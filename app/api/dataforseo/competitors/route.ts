// app/api/dataforseo/competitors/route.ts
// =============================================================================
// AI Marketing Lab — Competitor Discovery (DISABLED)
// Used to surface competitors with authority, traffic, and overlap metrics.
// Relied on DataForSEO Labs competitors_domain + bulk_traffic_estimation which
// we are no longer using.
//
// No free equivalent exists: identifying competitors needs a large crawled
// SERP dataset. Returns an explicit "unavailable" response so the UI can
// render a calm not-available state instead of an error.
// =============================================================================

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    success: false,
    reason:  "unavailable",
    message: "Competitor discovery requires a paid SEO data provider and isn't enabled on your plan.",
    provider: "dataforseo",
  });
}

export async function GET() {
  return POST();
}
