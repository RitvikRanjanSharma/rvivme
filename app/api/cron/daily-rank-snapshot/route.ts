// app/api/cron/daily-rank-snapshot/route.ts
// =============================================================================
// AI Marketing Lab — Daily rank-tracking snapshot
// =============================================================================
// Runs at 03:20 UTC daily (see vercel.json). For each user that has tracked
// keywords AND a connected GSC property, we:
//
//   1. Pull the last 7 days of GSC search analytics by query.
//   2. For each tracked_keywords row, look up the matching query and write
//      one row into keyword_rankings_history for today's UTC date.
//
// Why GSC rather than DataForSEO SERPs? GSC is free and reflects real Google
// rankings for the user's site. DFS is paid; we'll add it later for keywords
// the site doesn't yet rank for, gated behind quotas.
//
// This route is idempotent: the (user_id, keyword, captured_on) UNIQUE
// constraint means re-running on the same day just updates today's row via
// upsert.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { verifyCron, getServiceSupabase } from "@/lib/cron";
import { getGoogleAccessToken } from "@/lib/google-auth";

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";
const GSC_SCOPE    = "https://www.googleapis.com/auth/webmasters.readonly";

// We allow this to run for up to 5 minutes — Vercel hobby caps at 60s; pro
// goes to 300s. With 100+ users this still won't be enough; we'll batch.
export const maxDuration = 300;
export const dynamic     = "force-dynamic";

type TrackedKw = { id: string; user_id: string; keyword: string };

export async function GET(req: NextRequest) {
  const guard = verifyCron(req);
  if (guard) return guard;

  const startedAt = Date.now();
  const sb = getServiceSupabase();

  // ─── 1. Find users with both a tracked keyword AND a GSC property ─────────
  const { data: users, error: usersErr } = await sb
    .from("users")
    .select("id, gsc_site_url, website_url")
    .not("gsc_site_url", "is", null);

  if (usersErr) {
    return NextResponse.json({ success: false, error: usersErr.message }, { status: 500 });
  }

  const summary = {
    users_processed: 0,
    rows_written:    0,
    skipped_no_kw:   0,
    failed:          [] as { user_id: string; reason: string }[],
  };

  // Get one Google access token up front; service-account tokens are valid
  // for ~1 hour, so it covers the whole batch.
  let token: string;
  try {
    token = await getGoogleAccessToken(GSC_SCOPE);
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: `google-auth: ${e.message}` },
      { status: 500 },
    );
  }

  for (const u of users ?? []) {
    if (!u.gsc_site_url) continue;

    // Pull this user's tracked keywords. We snapshot whatever they're
    // tracking right now; if they untrack a keyword later it just stops
    // gaining new history rows (existing rows stay).
    const { data: tracked } = await sb
      .from("tracked_keywords")
      .select("id, user_id, keyword")
      .eq("user_id", u.id);

    if (!tracked || tracked.length === 0) {
      summary.skipped_no_kw++;
      continue;
    }

    try {
      const rows = await snapshotForUser(token, u.gsc_site_url, u.id, tracked, u.website_url);
      if (rows.length) {
        const { error: upErr } = await sb
          .from("keyword_rankings_history")
          .upsert(rows, { onConflict: "user_id,keyword,captured_on" });
        if (upErr) {
          summary.failed.push({ user_id: u.id, reason: `upsert: ${upErr.message}` });
        } else {
          summary.rows_written += rows.length;
        }
      }
      summary.users_processed++;
    } catch (e: any) {
      summary.failed.push({ user_id: u.id, reason: e.message });
    }
  }

  return NextResponse.json({
    success:    true,
    duration_ms: Date.now() - startedAt,
    ...summary,
  });
}

// ---------------------------------------------------------------------------
// snapshotForUser: pull GSC by-query data and emit history rows for matched
// tracked keywords. We also emit a row for keywords that don't appear in GSC
// (out-of-top-100) so the trend chart shows a continuous line at position 101.
// ---------------------------------------------------------------------------
async function snapshotForUser(
  token: string,
  siteUrl: string,
  userId: string,
  tracked: TrackedKw[],
  websiteUrl: string,
) {
  const today = new Date().toISOString().slice(0, 10);
  // GSC has a 2-3 day lag, so look back over a window that gives us at least
  // one stable day of data.
  const endDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const res = await fetch(
    `${GSC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate, endDate,
        searchType: "web",
        dimensions: ["query"],
        rowLimit:   25_000,
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GSC ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const byQuery = new Map<string, { position: number; clicks: number; impressions: number }>();
  for (const row of json.rows ?? []) {
    const q = String(row.keys?.[0] ?? "").toLowerCase().trim();
    if (!q) continue;
    byQuery.set(q, {
      position:    Math.round(Math.min(101, Math.max(1, row.position ?? 101))),
      clicks:      Math.round(row.clicks ?? 0),
      impressions: Math.round(row.impressions ?? 0),
    });
  }

  const domain = hostFor(websiteUrl) || hostFor(siteUrl);

  return tracked.map(t => {
    const match = byQuery.get(t.keyword.toLowerCase().trim());
    return {
      user_id:      userId,
      keyword:      t.keyword,
      domain,
      position:     match?.position ?? 101,
      search_volume: null,
      url:          null,
      source:       "gsc" as const,
      captured_on:  today,
    };
  });
}

function hostFor(input: string | null | undefined): string {
  if (!input) return "";
  const cleaned = input.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/^www\./, "");
  return cleaned.split("/")[0];
}
