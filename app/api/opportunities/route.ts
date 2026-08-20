// app/api/opportunities/route.ts
// =============================================================================
// AI Marketing Lab — the strategist's action list
//
// Pulls Search Console data over two consecutive periods and runs the analyses
// in lib/opportunities.ts to produce a ranked list of actions, each carrying
// the evidence that produced it.
//
// Deliberately uses no paid data source. Everything here comes from the user's
// own Search Console property.
//
// Response:
//   200 { success: true, diagnosis, opportunities, counts, curve, period }
//   200 { success: false, reason, message }   — calm states the UI can render
//   401 unauthenticated
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull }   from "@/lib/supabase-server";
import { resolveGoogleToken } from "@/lib/google-oauth";
import { googleFetch } from "@/lib/outbound-fetch";
import { callerGscSite } from "@/lib/caller-site";

// Declared so a slow upstream fails as a timeout rather than as a killed
// process. A killed function returns nothing at all, which the UI cannot
// distinguish from an empty result.
export const maxDuration = 60;
import {
  buildReport,
  type QueryRow, type QueryPageRow,
} from "@/lib/opportunities";

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";
const GSC_SCOPE    = "https://www.googleapis.com/auth/webmasters.readonly";

// Search Console finalises data on a delay — most metrics land within ~2 days,
// occasionally 3. Ending the window at "today" would therefore show a fake
// cliff at the end of every chart, because the last days are always partial.
//
// 2 rather than 3: Google's own Performance report defaults to 2, and the extra
// day of lag was making the report feel staler than it needed to.
const LAG_DAYS = 2;
const PERIOD   = 28;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

type GscApiRow = {
  keys:        string[];
  clicks:      number;
  impressions: number;
  ctr:         number;      // 0-1 from Google
  position:    number;
};

async function searchAnalytics(
  siteUrl: string, token: string, body: object,
): Promise<GscApiRow[]> {
  const res = await googleFetch(`${GSC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`GSC API error ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return (json.rows ?? []) as GscApiRow[];
}

/** Google returns ctr as a 0-1 fraction; the analysis engine works in percent. */
function toQueryRow(r: GscApiRow): QueryRow {
  return {
    query:       r.keys[0],
    clicks:      r.clicks,
    impressions: r.impressions,
    ctr:         r.ctr * 100,
    position:    r.position,
  };
}

function toQueryPageRow(r: GscApiRow, siteUrl: string): QueryPageRow {
  const raw = r.keys[1] ?? "";
  // Show paths rather than absolute URLs — shorter and easier to scan.
  let page = raw;
  if (raw.startsWith(siteUrl)) page = raw.slice(siteUrl.length) || "/";
  else {
    try { page = new URL(raw).pathname; } catch { /* leave as-is */ }
  }
  return { ...toQueryRow(r), page };
}

export async function GET(request: NextRequest) {
  try {
    const caller = await getCallerOrNull();
    if (!caller) {
      return NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 });
    }

    const site = await callerGscSite(caller.supabase, caller.user.id);
    if (!site.ok) {
      // The reason is carried through rather than flattened to "not connected".
      // A missing profile row is our bug and self-heals on reload; an
      // unconnected property is a setup step. Same message for both used to
      // send people to reconnect something that was never broken.
      return NextResponse.json({
        success: false,
        reason:  site.reason,
        message: site.reason === "not_configured" ? "Connect Search Console under Settings to see your opportunities." : site.message,
      });
    }
    const siteUrl = site.siteUrl;

    const tokenResult = await resolveGoogleToken(caller.user.id, GSC_SCOPE);
    if (!tokenResult.ok) {
      return NextResponse.json({
        success: false,
        reason:  tokenResult.reason === "reauth_required" ? "reauth_required" : "not_connected",
        message: tokenResult.message,
      });
    }
    const token = tokenResult.accessToken;

    const limit = Math.min(
      Math.max(Number(new URL(request.url).searchParams.get("limit") ?? 25), 5),
      50,
    );

    // Current period, the one before it (for decay), and query+page pairs
    // (for cannibalisation). Three calls, run in parallel.
    const currentRange = {
      startDate: isoDaysAgo(LAG_DAYS + PERIOD),
      endDate:   isoDaysAgo(LAG_DAYS),
    };
    const previousRange = {
      startDate: isoDaysAgo(LAG_DAYS + PERIOD * 2),
      endDate:   isoDaysAgo(LAG_DAYS + PERIOD + 1),
    };

    const [currentRaw, previousRaw, queryPageRaw] = await Promise.all([
      searchAnalytics(siteUrl, token, {
        ...currentRange, searchType: "web", dimensions: ["query"], rowLimit: 1000,
      }),
      // A failed previous-period call shouldn't sink the whole report — we just
      // lose decay detection.
      searchAnalytics(siteUrl, token, {
        ...previousRange, searchType: "web", dimensions: ["query"], rowLimit: 1000,
      }).catch(() => [] as GscApiRow[]),
      searchAnalytics(siteUrl, token, {
        ...currentRange, searchType: "web", dimensions: ["query", "page"], rowLimit: 2000,
      }).catch(() => [] as GscApiRow[]),
    ]);

    const queries    = currentRaw.map(toQueryRow);
    const previous   = previousRaw.map(toQueryRow);
    const queryPages = queryPageRaw.map(r => toQueryPageRow(r, siteUrl));

    // siteUrl lets the engine derive brand tokens and exclude brand searches.
    const report = buildReport({ queries, queryPages, previous, limit, siteUrl });

    return NextResponse.json({
      success: true,
      ...report,
      period: {
        current:  currentRange,
        previous: previousRange,
        // Surfaced so the UI can be honest about sample size — a report built
        // on 12 queries deserves less confidence than one built on 800.
        queryCount:         queries.length,
        previousQueryCount: previous.length,
      },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[opportunities]", message);
    return NextResponse.json({ success: false, reason: "api_error", message });
  }
}
