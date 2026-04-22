// app/api/dataforseo/backlinks/route.ts
// =============================================================================
// AI Marketing Lab — Backlinks Overview (DISABLED)
// DataForSEO's backlinks add-on requires a paid subscription with a $50 minimum
// top-up we're not paying for right now. The route is kept as a well-known
// stable endpoint and returns a structured "unavailable" response so the UI
// renders a calm "not available on your plan" state instead of an error.
//
// To re-enable: restore the implementation from git history at the commit that
// introduced the migration to Google Trends + GSC, and top up DataForSEO.
// =============================================================================

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: false,
    reason:  "unavailable",
    message: "Backlinks data isn't available on your current plan.",
    provider: "dataforseo",
  });
}
