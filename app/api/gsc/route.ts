// app/api/gsc/route.ts
// =============================================================================
// AI Marketing Labs — Google Search Console API Route
// Reuses the same service account as GA4 (GA4_SERVICE_ACCOUNT_KEY)
// Returns: impressions, clicks, CTR, avg position, top queries, top pages
// =============================================================================

import { NextResponse } from "next/server";

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";

// ─────────────────────────────────────────────────────────────────────────────
// Reuse the same JWT auth as GA4
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
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud:   "https://oauth2.googleapis.com/token",
    iat:   now,
    exp:   now + 3600,
  };

  const header  = { alg: "RS256", typ: "JWT" };
  const b64     = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${b64(header)}.${b64(payload)}`;

  const pemBody = key.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    Buffer.from(pemBody, "base64"),
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
    throw new Error(`Failed to get GSC access token: ${err}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
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