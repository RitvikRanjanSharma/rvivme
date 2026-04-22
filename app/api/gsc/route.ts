// app/api/gsc/route.ts
// =============================================================================
// AI Marketing Lab — Google Search Console API Route (per-user)
// Reuses the same service account as GA4 (GA4_SERVICE_ACCOUNT_KEY).
// The *site URL* is now read from the caller's own row in public.users, not
// from process.env, so each workspace only sees its own GSC data.
// Returns: impressions, clicks, CTR, avg position, top queries, top pages.
// =============================================================================

import { NextResponse } from "next/server";
import { getGoogleAccessToken } from "@/lib/google-auth";
import { getCallerOrNull } from "@/lib/supabase-server";

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";
const GSC_SCOPE    = "https://www.googleapis.com/auth/webmasters.readonly";

async function getAccessToken(): Promise<string> {
  return getGoogleAccessToken(GSC_SCOPE);
}

// ─────────────────────────────────────────────────────────────────────────────
// Run a GSC search analytics query
// ─────────────────────────────────────────────────────────────────────────────
async function searchAnalytics(
  siteUrl: string,
  token: string,
  body: object
) {
  const encoded = encodeURIComponent(siteUrl);
  const res = await fetch(
    `${GSC_API_BASE}/sites/${encoded}/searchAnalytics/query`,
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
export async function GET() {
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
    const { data, error: rowErr } = await caller.supabase
      .from("users")
      .select("gsc_site_url")
      .eq("id", caller.user.id)
      .single();
    const row = data as { gsc_site_url: string | null } | null;

    if (rowErr) {
      // Treat "no row" as not_configured so brand new users see the empty
      // state instead of a red error banner.
      return NextResponse.json(
        {
          success: false,
          reason:  "not_configured",
          message: "Search Console is not connected for your workspace yet.",
        },
        { status: 200 }
      );
    }

    const siteUrl = row?.gsc_site_url?.trim();
    if (!siteUrl) {
      return NextResponse.json(
        {
          success: false,
          reason:  "not_configured",
          message: "Search Console is not connected for your workspace yet.",
        },
        { status: 200 }
      );
    }

    const token = await getAccessToken();

    const dateRange = {
      startDate: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10),
      endDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10), // GSC has ~3 day lag
    };

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
        rowLimit:   30,
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
    const trend = (trendData.rows ?? []).map((row: any) => ({
      date:        row.keys[0],
      clicks:      Math.round(row.clicks),
      impressions: Math.round(row.impressions),
      ctr:         parseFloat((row.ctr * 100).toFixed(1)),
      position:    parseFloat(row.position.toFixed(1)),
    }));

    return NextResponse.json({
      success: true,
      summary,
      topQueries,
      topPages,
      trend,
      period:  "last_28_days",
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
