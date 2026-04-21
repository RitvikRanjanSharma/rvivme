// app/api/gsc/route.ts
// =============================================================================
// AI Marketing Lab — Google Search Console API Route
// Reuses the same service account as GA4 (GA4_SERVICE_ACCOUNT_KEY)
// Returns: impressions, clicks, CTR, avg position, top queries, top pages
// =============================================================================

import { NextResponse } from "next/server";
import { getGoogleAccessToken } from "@/lib/google-auth";

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
// Returns: summary + top queries + top pages + 30-day daily trend
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const siteUrl = process.env.GSC_SITE_URL;
    if (!siteUrl) throw new Error("GSC_SITE_URL is not set");

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
    console.error("[gsc/route]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}