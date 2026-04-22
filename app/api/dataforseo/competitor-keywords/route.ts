// app/api/dataforseo/competitor-keywords/route.ts
// =============================================================================
// AI Marketing Lab — Competitor Keywords (DISABLED)
// Used to compare a competitor's ranked keywords vs. ours and surface gaps +
// opportunities. Relied on DataForSEO Labs ranked_keywords which we are no
// longer using (see migration to Google Trends + GSC).
//
// There is no free equivalent — GSC only shows your own data and Trends can't
// tell you what a competitor ranks for. Returns an explicit "unavailable"
// response so the UI renders a calm not-available state instead of an error.
// =============================================================================

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    success: false,
    reason:  "unavailable",
    message: "Competitor keyword research requires a paid SEO data provider and isn't enabled on your plan.",
    provider: "dataforseo",
  });
}

export async function GET() {
  return POST();
}
