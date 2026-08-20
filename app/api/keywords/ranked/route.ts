// app/api/keywords/ranked/route.ts
// =============================================================================
// AI Marketing Lab — Keywords you rank for (from GSC)
// Free replacement for DataForSEO ranked_keywords: pulls the list directly
// from the caller's own Search Console property. You only see queries where
// *your* site actually impressed, which is honest and exact — no third-party
// estimate.
//
// What we can / can't provide vs DataForSEO:
//   ✅ query term, position (avg), clicks, impressions, CTR
//   ✅ landing page (per query — costs an extra GSC call)
//   ❌ absolute monthly search volume (Google doesn't expose that publicly)
//   ❌ CPC, keyword difficulty, search intent, featured-snippet flag
//
// The UI surfaces absolute-volume-dependent columns conditionally — when
// `volume == null` we render a dash instead of a zero.
//
// Per-user auth: reads gsc_site_url from the caller's own row (RLS-enforced).
//
// Response contract:
//   200 { success: true, domain, keywords: [...], total }
//   200 { success: false, reason: "not_configured" | "api_error", message }
//   401 { success: false, error: "unauthenticated" }
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { resolveGoogleToken }   from "@/lib/google-oauth";
import { getCallerOrNull }      from "@/lib/supabase-server";
import { callerGscSite, deriveDomain } from "@/lib/caller-site";
import { googleFetch } from "@/lib/outbound-fetch";

// Declared so a slow upstream fails as a timeout rather than as a killed
// process. A killed function returns nothing at all, which the UI cannot
// distinguish from an empty result.
export const maxDuration = 45;

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";
const GSC_SCOPE    = "https://www.googleapis.com/auth/webmasters.readonly";

async function searchAnalytics(siteUrl: string, token: string, body: object) {
  const encoded = encodeURIComponent(siteUrl);
  const res = await googleFetch(`${GSC_API_BASE}/sites/${encoded}/searchAnalytics/query`,
    {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GSC API error ${res.status}: ${err}`);
  }
  return res.json();
}

export async function GET(request: NextRequest) {
  try {
    const caller = await getCallerOrNull();
    if (!caller) {
      return NextResponse.json(
        { success: false, error: "unauthenticated" },
        { status: 401 }
      );
    }

    // Per-user site URL (RLS enforced). A missing profile row is reported as
    // itself rather than as a disconnected integration — see lib/caller-site.
    const site = await callerGscSite(caller.supabase, caller.user.id);
    if (!site.ok) {
      return NextResponse.json({ success: false, reason: site.reason, message: site.message });
    }
    const siteUrl = site.siteUrl;

    const limitParam = Number(new URL(request.url).searchParams.get("limit") ?? 100);
    const rowLimit   = Math.min(Math.max(limitParam, 1), 500);

    // The caller's own OAuth connection first, shared service account second.
    // This route used to go straight to the service account, which only works
    // if that account was granted Viewer on the property — so it failed for
    // exactly the users who onboarded through the OAuth flow we ask them to use.
    const tokenResult = await resolveGoogleToken(caller.user.id, GSC_SCOPE);
    if (!tokenResult.ok) {
      return NextResponse.json({
        success: false,
        reason:  tokenResult.reason === "reauth_required" ? "reauth_required" : "not_connected",
        message: tokenResult.message,
      });
    }
    const token = tokenResult.accessToken;

    const dateRange = {
      startDate: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10),
      endDate:   new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10),
    };

    // Two parallel queries:
    //   1. per-query aggregate (gives us position, clicks, impressions, CTR)
    //   2. per-query + per-page (so we can attach the landing URL to each query)
    const [queryAgg, queryPage] = await Promise.all([
      searchAnalytics(siteUrl, token, {
        ...dateRange,
        searchType: "web",
        dimensions: ["query"],
        rowLimit,
        orderBy:    [{ fieldName: "impressions", sortOrder: "DESCENDING" }],
      }),
      searchAnalytics(siteUrl, token, {
        ...dateRange,
        searchType: "web",
        dimensions: ["query", "page"],
        // Ask for more rows here because a single query can surface on several
        // pages; we pick the top-impression URL per query in code.
        rowLimit:   rowLimit * 3,
        orderBy:    [{ fieldName: "impressions", sortOrder: "DESCENDING" }],
      }),
    ]);

    // Build query→top-URL map from the per-query+page response.
    const topUrlByQuery = new Map<string, string>();
    for (const row of (queryPage.rows ?? []) as Array<{ keys: [string, string]; impressions: number }>) {
      const [q, page] = row.keys;
      if (!topUrlByQuery.has(q)) topUrlByQuery.set(q, page);
    }

    // Normalise the landing URL to a path when it lives under our site.
    const toPath = (url: string): string => {
      try {
        if (url.startsWith(siteUrl)) return url.slice(siteUrl.length) || "/";
        const u = new URL(url);
        return u.pathname + u.search;
      } catch {
        return url;
      }
    };

    const keywords = ((queryAgg.rows ?? []) as Array<{
      keys:        [string];
      clicks:      number;
      impressions: number;
      ctr:         number;
      position:    number;
    }>).map(r => ({
      term:        r.keys[0],
      position:    parseFloat(r.position.toFixed(1)),
      clicks:      Math.round(r.clicks),
      impressions: Math.round(r.impressions),
      ctr:         parseFloat((r.ctr * 100).toFixed(1)),
      url:         toPath(topUrlByQuery.get(r.keys[0]) ?? ""),
      // Not available from GSC — kept as nulls so the UI can render em-dashes.
      volume:      null,
      cpc:         null,
      difficulty:  null,
      intent:      null,
      featured:    false,
      aiOverview:  false,
    }));

    const domain = deriveDomain(siteUrl);

    return NextResponse.json({
      success: true,
      source:  "gsc",
      domain,
      siteUrl,
      keywords,
      total:   keywords.length,
      period:  "last_28_days",
    });
  } catch (err: any) {
    console.error("[keywords/ranked]", err.message);
    return NextResponse.json({
      success: false,
      reason:  "api_error",
      message: err.message ?? "Search Console keyword query failed.",
    });
  }
}


