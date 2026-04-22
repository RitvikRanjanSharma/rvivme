// app/api/dataforseo/domain-metrics/route.ts
// =============================================================================
// AI Marketing Lab — Domain Metrics (DISABLED)
// Used to return keyword count + monthly traffic + pseudo-DA for a list of
// domains. Relied on DataForSEO Labs bulk_traffic_estimation which we are
// no longer using.
//
// No free equivalent exists. Returns an explicit "unavailable" response so
// callers can render a calm not-available state instead of an error.
// =============================================================================

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    success: false,
    reason:  "unavailable",
    message: "Domain-level SEO metrics require a paid SEO data provider and isn't enabled on your plan.",
    provider: "dataforseo",
  });
}

export async function GET() {
  return POST();
}
