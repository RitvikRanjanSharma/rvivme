// =============================================================================
// FILE 1: lib/dataforseo.ts
// Shared DataForSEO client — import this in all API routes
// =============================================================================

export const DFS_BASE = "https://api.dataforseo.com/v3";

export function dfsAuth(): string {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    throw new Error(
      "DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set in .env.local"
    );
  }

  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

export async function dfsPost<T = any>(
  endpoint: string,
  body: unknown
): Promise<T> {
  const res = await fetch(`${DFS_BASE}${endpoint}`, {
    method:  "POST",
    headers: {
      "Authorization": dfsAuth(),
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(body),
    // Next.js fetch cache — revalidate every 60 seconds for SERP data
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataForSEO ${res.status}: ${text}`);
  }

  return res.json();
}

export async function dfsGet<T = any>(endpoint: string): Promise<T> {
  const res = await fetch(`${DFS_BASE}${endpoint}`, {
    headers: { "Authorization": dfsAuth() },
    next:    { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`DataForSEO GET ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

// Location codes used across routes
export const LOCATIONS = {
  UK:  2826,
  US:  2840,
  AU:  2036,
  CA:  2124,
  IN:  2356,
} as const;

// Normalise difficulty score (0-100) to label
export function difficultyLabel(
  score: number
): "low" | "medium" | "high" | "very-high" {
  if (score < 30) return "low";
  if (score < 55) return "medium";
  if (score < 75) return "high";
  return "very-high";
}

// Normalise threat level from overlap percentage
export function threatLevel(
  overlapPct: number
): "low" | "medium" | "high" | "critical" {
  if (overlapPct > 60) return "critical";
  if (overlapPct > 40) return "high";
  if (overlapPct > 20) return "medium";
  return "low";
}


// =============================================================================
// FILE 2: app/api/dataforseo/balance/route.ts
// Returns remaining DataForSEO credit balance — shown in Settings > Data Providers
// =============================================================================

// import { NextResponse } from "next/server";
// import { dfsGet } from "@/lib/dataforseo";
//
// export async function GET() {
//   try {
//     const data = await dfsGet("/appendix/user_data/live");
//     const balance = data?.tasks?.[0]?.result?.[0]?.money_data?.balance ?? 0;
//     const currency = data?.tasks?.[0]?.result?.[0]?.money_data?.currency ?? "USD";
//     return NextResponse.json({ success: true, balance, currency });
//   } catch (err: any) {
//     return NextResponse.json({ error: err.message }, { status: 500 });
//   }
// }


// =============================================================================
// FILE 3: app/api/dataforseo/traffic/route.ts
// Estimates organic traffic for a domain — used in Competitors page
// =============================================================================

// import { NextResponse, type NextRequest } from "next/server";
// import { dfsPost } from "@/lib/dataforseo";
//
// export async function POST(request: NextRequest) {
//   try {
//     const { domains } = await request.json();
//     if (!domains?.length) return NextResponse.json({ error: "domains required" }, { status: 400 });
//
//     const data = await dfsPost("/dataforseo_labs/google/bulk_traffic_estimation/live", [
//       { targets: domains.slice(0, 100), location_code: 2826, language_code: "en" }
//     ]);
//
//     const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
//     return NextResponse.json({ success: true, items });
//   } catch (err: any) {
//     return NextResponse.json({ error: err.message }, { status: 500 });
//   }
// }


// =============================================================================
// HOW TO USE THESE API ROUTES FROM YOUR PAGES
// =============================================================================
//
// From any Client Component, call your own API routes like this:
//
// KEYWORDS PAGE — fetch real rankings:
// ─────────────────────────────────────
// const res = await fetch("/api/dataforseo/keywords", {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({ domain: "yoursite.com", limit: 50 }),
// });
// const { keywords } = await res.json();
//
//
// COMPETITORS PAGE — discover rivals:
// ─────────────────────────────────────
// const res = await fetch("/api/dataforseo/competitors", {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({ domain: "yoursite.com", limit: 10 }),
// });
// const { competitors } = await res.json();
//
//
// SERP CHECK — check a single keyword:
// ─────────────────────────────────────
// const res = await fetch(
//   "/api/dataforseo/serp?keyword=seo+tools+uk&domain=yoursite.com"
// );
// const { results } = await res.json();
//
//
// BALANCE CHECK — see remaining credits:
// ─────────────────────────────────────
// const res = await fetch("/api/dataforseo/balance");
// const { balance, currency } = await res.json();
