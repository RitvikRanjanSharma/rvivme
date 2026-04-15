// app/api/ga4/route.ts
// =============================================================================
// AI Marketing Labs — GA4 Data API Route
// Server-side only — service account credentials never reach the browser
// Returns sessions, users, pageviews, and 30-day traffic trend
// =============================================================================

import { NextResponse } from "next/server";

const GA4_API_BASE = "https://analyticsdata.googleapis.com/v1beta";

// ─────────────────────────────────────────────────────────────────────────────
// Google OAuth2 — get access token from service account JSON
// ─────────────────────────────────────────────────────────────────────────────
async function getAccessToken(): Promise<string> {
  const keyRaw = process.env.GA4_SERVICE_ACCOUNT_KEY;
  if (!keyRaw) throw new Error("GA4_SERVICE_ACCOUNT_KEY is not set");

  let key: any;
  try {
    key = JSON.parse(keyRaw);
  } catch {
    throw new Error("GA4_SERVICE_ACCOUNT_KEY is not valid JSON");
  }

  const now     = Math.floor(Date.now() / 1000);
  const payload = {
    iss:   key.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud:   "https://oauth2.googleapis.com/token",
    iat:   now,
    exp:   now + 3600,
  };

  // Build JWT manually (no external libraries needed)
  const header  = { alg: "RS256", typ: "JWT" };
  const b64     = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${b64(header)}.${b64(payload)}`;

  // Sign with private key using Web Crypto
  const pemBody = key.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binaryKey  = Buffer.from(pemBody, "base64");
  const cryptoKey  = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    Buffer.from(unsigned)
  );

  const jwt = `${unsigned}.${Buffer.from(signature).toString("base64url")}`;

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Failed to get GA4 access token: ${err}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
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