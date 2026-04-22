// app/api/dataforseo/serp/route.ts
// =============================================================================
// AI Marketing Lab — Live SERP lookup (DISABLED)
// Used to fetch live Google SERPs for a batch of keywords. Relied on
// DataForSEO's SERP API which is a paid per-call endpoint.
//
// Free replacement strategy: for your *own* domain, use /api/keywords/ranked
// which reads position directly from Search Console. For anything else there
// is no free substitute.
//
// Returns an explicit "unavailable" response so callers can render a calm
// not-available state instead of an error.
// =============================================================================

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    success: false,
    reason:  "unavailable",
    message: "Live SERP lookups require a paid SEO data provider. Use /api/keywords/ranked for your own site's positions instead.",
    provider: "dataforseo",
  });
}

export async function GET() {
  return POST();
}
