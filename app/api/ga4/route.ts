// app/api/ga4/route.ts
// =============================================================================
// AI Marketing Lab — GA4 Data API Route
// Server-side only — service account credentials never reach the browser
// Returns sessions, users, pageviews, and 30-day traffic trend
// =============================================================================

import { NextResponse } from "next/server";
import { getGoogleAccessToken } from "@/lib/google-auth";

const GA4_API_BASE = "https://analyticsdata.googleapis.com/v1beta";
const GA4_SCOPE    = "https://www.googleapis.com/auth/analytics.readonly";

async function getAccessToken(): Promise<string> {
  return getGoogleAccessToken(GA4_SCOPE);
}

// ─────────────────────────────────────────────────────────────────────────────
// Run a GA4 Data API report
// ─────────────────────────────────────────────────────────────────────────────
async function runReport(propertyId: string, token: string, body: object) {
  const res = await fetch(
    `${GA4_API_BASE}/properties/${propertyId}:runReport`,
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
    throw new Error(`GA4 API error ${res.status}: ${err}`);
  }

  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ga4
// Returns: summary metrics + 30-day daily trend + top pages + traffic sources
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      return NextResponse.json(
        { error: "GA4_PROPERTY_ID is not set" },
        { status: 500 }
      );
    }

    const token = await getAccessToken();

    // Run all reports in parallel
    const [summaryData, trendData, pagesData, sourcesData] = await Promise.all([

      // 1. Summary — last 30 days totals
      runReport(propertyId, token, {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        metrics: [
          { name: "sessions"         },
          { name: "totalUsers"       },
          { name: "screenPageViews"  },
          { name: "bounceRate"       },
          { name: "averageSessionDuration" },
          { name: "newUsers"         },
        ],
      }),

      // 2. Daily trend — last 30 days by date
      runReport(propertyId, token, {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics:    [{ name: "sessions" }, { name: "totalUsers" }],
        orderBys:   [{ dimension: { dimensionName: "date" }, desc: false }],
      }),

      // 3. Top pages
      runReport(propertyId, token, {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "pagePath" }],
        metrics:    [{ name: "screenPageViews" }, { name: "sessions" }],
        orderBys:   [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 5,
      }),

      // 4. Traffic sources
      runReport(propertyId, token, {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics:    [{ name: "sessions" }],
        orderBys:   [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 6,
      }),

    ]);

    // ── Parse summary ──────────────────────────────────────────────────────
    const summaryRow = summaryData.rows?.[0]?.metricValues ?? [];
    const summary = {
      sessions:        parseInt(summaryRow[0]?.value ?? "0"),
      users:           parseInt(summaryRow[1]?.value ?? "0"),
      pageviews:       parseInt(summaryRow[2]?.value ?? "0"),
      bounceRate:      parseFloat((parseFloat(summaryRow[3]?.value ?? "0") * 100).toFixed(1)),
      avgSessionSecs:  parseFloat(parseFloat(summaryRow[4]?.value ?? "0").toFixed(0)),
      newUsers:        parseInt(summaryRow[5]?.value ?? "0"),
    };

    // ── Parse daily trend ──────────────────────────────────────────────────
    const trend = (trendData.rows ?? []).map((row: any) => {
      const rawDate = row.dimensionValues[0].value; // "20260101"
      const d = `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}`;
      return {
        date:     d,
        sessions: parseInt(row.metricValues[0].value),
        users:    parseInt(row.metricValues[1].value),
      };
    });

    // ── Parse top pages ────────────────────────────────────────────────────
    const topPages = (pagesData.rows ?? []).map((row: any) => ({
      path:      row.dimensionValues[0].value,
      pageviews: parseInt(row.metricValues[0].value),
      sessions:  parseInt(row.metricValues[1].value),
    }));

    // ── Parse traffic sources ──────────────────────────────────────────────
    const totalSessions = summary.sessions || 1;
    const sources = (sourcesData.rows ?? []).map((row: any) => ({
      channel:  row.dimensionValues[0].value,
      sessions: parseInt(row.metricValues[0].value),
      pct:      Math.round((parseInt(row.metricValues[0].value) / totalSessions) * 100),
    }));

    return NextResponse.json({
      success: true,
      summary,
      trend,
      topPages,
      sources,
      period: "last_30_days",
    });

  } catch (err: any) {
    console.error("[ga4/route]", err.message);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}