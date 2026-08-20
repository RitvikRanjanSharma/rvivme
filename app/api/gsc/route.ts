// app/api/gsc/route.ts
// =============================================================================
// AI Marketing Lab — Google Search Console API Route (per-user)
// Reuses the same service account as GA4 (GA4_SERVICE_ACCOUNT_KEY).
// The *site URL* is now read from the caller's own row in public.users, not
// from process.env, so each workspace only sees its own GSC data.
// Returns: impressions, clicks, CTR, avg position, top queries, top pages.
// =============================================================================

import { NextResponse } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import { rangeFor, rangeDates, bucketFor, bucketSeries, GSC_LAG_DAYS } from "@/lib/date-range";
import { resolveGoogleToken } from "@/lib/google-oauth";
import { googleFetch } from "@/lib/outbound-fetch";
import { callerGscSite } from "@/lib/caller-site";

// Declared so a slow upstream fails as a timeout rather than as a killed
// process. A killed function returns nothing at all, which the UI cannot
// distinguish from an empty result.
export const maxDuration = 45;

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";
const GSC_SCOPE    = "https://www.googleapis.com/auth/webmasters.readonly";

// ─────────────────────────────────────────────────────────────────────────────
// Run a GSC search analytics query
// ─────────────────────────────────────────────────────────────────────────────
async function searchAnalytics(
  siteUrl: string,
  token: string,
  body: object
) {
  const encoded = encodeURIComponent(siteUrl);
  const res = await googleFetch(`${GSC_API_BASE}/sites/${encoded}/searchAnalytics/query`,
    {
      method: "POST",
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/gsc
// Returns: summary + top queries + top pages + 30-day daily trend for the
// *authenticated caller's* GSC site, or a calm `not_configured` signal if
// they haven't entered one under Settings → Integrations.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    // 1. Require an authenticated session. Prevents a logged-out browser (or
    //    a different user on the same browser before cookies load) from
    //    stumbling onto a shared dataset.
    const caller = await getCallerOrNull();
    if (!caller) {
      return NextResponse.json(
        { success: false, error: "unauthenticated" },
        { status: 401 }
      );
    }

    // 2. Read this caller's own GSC property. We go through the cookie-aware
    //    client so RLS enforces "can only read your own row" server-side.
    //    Manual cast mirrors the pattern used in lib/useDomain.ts — supabase-js
    //    2.x narrows string-literal select() results to `never` when combined
    //    with our generated Database type.
    // A missing profile row and an unconnected integration are different
    // problems with different fixes, and this used to report both as
    // "Search Console is not connected" — sending someone to reconnect an
    // integration that was working. See lib/caller-site.
    const site = await callerGscSite(caller.supabase, caller.user.id);
    if (!site.ok) {
      return NextResponse.json(
        { success: false, reason: site.reason, message: site.message },
        { status: 200 },
      );
    }
    const siteUrl = site.siteUrl;

    // Prefer the caller's own OAuth connection; fall back to the legacy shared
    // service account so existing setups keep working during the migration.
    const tokenResult = await resolveGoogleToken(caller.user.id, GSC_SCOPE);
    if (!tokenResult.ok) {
      return NextResponse.json(
        {
          success: false,
          reason:  tokenResult.reason === "reauth_required" ? "reauth_required" : "not_connected",
          message: tokenResult.message,
        },
        { status: 200 },
      );
    }
    const token = tokenResult.accessToken;

    // Range comes from the caller, validated against the shared list so an
    // arbitrary ?range= cannot ask Google for something it will refuse.
    const spec      = rangeFor(new URL(request.url).searchParams.get("range"));
    const dateRange = rangeDates(spec, GSC_LAG_DAYS);
    const bucket    = bucketFor(spec);

    // Run all queries in parallel
    const [summaryData, queriesData, pagesData, trendData] = await Promise.all([

      // 1. Overall summary — no dimension
      searchAnalytics(siteUrl, token, {
        ...dateRange,
        searchType: "web",
      }),

      // 2. Top queries
      searchAnalytics(siteUrl, token, {
        ...dateRange,
        searchType: "web",
        dimensions: ["query"],
        rowLimit:   10,
        orderBy:    [{ fieldName: "impressions", sortOrder: "DESCENDING" }],
      }),

      // 3. Top pages
      searchAnalytics(siteUrl, token, {
        ...dateRange,
        searchType: "web",
        dimensions: ["page"],
        rowLimit:   5,
        orderBy:    [{ fieldName: "clicks", sortOrder: "DESCENDING" }],
      }),

      // 4. Daily trend
      searchAnalytics(siteUrl, token, {
        ...dateRange,
        searchType: "web",
        dimensions: ["date"],
        // One row per day for the whole window. The old value of 30 silently
        // truncated anything longer, so a 90-day range would have charted its
        // first 30 days and called it three months.
        rowLimit:   spec.days + 1,
        orderBy:    [{ fieldName: "date", sortOrder: "ASCENDING" }],
      }),

    ]);

    // ── Parse summary ──────────────────────────────────────────────────────
    const sr = summaryData.rows?.[0] ?? {};
    const summary = {
      clicks:      Math.round(sr.clicks      ?? 0),
      impressions: Math.round(sr.impressions ?? 0),
      ctr:         parseFloat(((sr.ctr ?? 0) * 100).toFixed(1)),
      position:    parseFloat((sr.position   ?? 0).toFixed(1)),
    };

    // ── Parse top queries ──────────────────────────────────────────────────
    const topQueries = (queriesData.rows ?? []).map((row: any) => ({
      query:       row.keys[0],
      clicks:      Math.round(row.clicks),
      impressions: Math.round(row.impressions),
      ctr:         parseFloat((row.ctr * 100).toFixed(1)),
      position:    parseFloat(row.position.toFixed(1)),
    }));

    // ── Parse top pages ────────────────────────────────────────────────────
    const topPages = (pagesData.rows ?? []).map((row: any) => ({
      page:        row.keys[0].replace(siteUrl, "") || "/",
      clicks:      Math.round(row.clicks),
      impressions: Math.round(row.impressions),
      ctr:         parseFloat((row.ctr * 100).toFixed(1)),
      position:    parseFloat(row.position.toFixed(1)),
    }));

    // ── Parse daily trend ──────────────────────────────────────────────────
    const dailyTrend = (trendData.rows ?? []).map((row: any) => ({
      date:        row.keys[0],
      clicks:      Math.round(row.clicks),
      impressions: Math.round(row.impressions),
      ctr:         parseFloat((row.ctr * 100).toFixed(1)),
      position:    parseFloat(row.position.toFixed(1)),
    }));

    // Longer ranges are bucketed so the line stays readable. CTR and position
    // are deliberately NOT summed — they are ratios and averages, and adding
    // them would produce nonsense like a 400% click-through rate.
    const trend = bucketSeries(dailyTrend, bucket.size, ["clicks", "impressions"], "date");

    return NextResponse.json({
      success: true,
      summary,
      topQueries,
      topPages,
      trend,
      range: {
        key:    spec.key,
        label:  spec.long,
        days:   spec.days,
        bucket: bucket.unit,
        start:  dateRange.startDate,
        end:    dateRange.endDate,
      },
    });

  } catch (err: any) {
    // The user *has* stored a site URL, but the Google call failed. Most
    // common reasons: the service account doesn't have Viewer access on the
    // GSC property, or the URL is formatted wrong (e.g. "example.com"
    // instead of "sc-domain:example.com"). Return 200 with a structured
    // reason so the dashboard can show an actionable banner instead of a
    // generic "not connected".
    console.error("[gsc/route]", err.message);
    return NextResponse.json(
      {
        success: false,
        reason:  "api_error",
        message: err.message ?? "Search Console API call failed.",
      },
      { status: 200 }
    );
  }
}
