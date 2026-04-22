// app/api/dataforseo/keywords/route.ts
// =============================================================================
// AI Marketing Lab — Ranked Keywords (DEPRECATED, replaced by GSC)
// This endpoint has been replaced by /api/keywords/ranked which uses Google
// Search Console instead of DataForSEO. The old route is retained so stale
// clients get a clear error rather than a silent 404.
// =============================================================================

import { NextResponse } from "next/server";

function deprecated() {
  return NextResponse.json({
    success: false,
    reason:  "deprecated",
    message: "This endpoint has been replaced by /api/keywords/ranked (uses Search Console instead of DataForSEO).",
    replacement: "/api/keywords/ranked",
  });
}

export async function GET()  { return deprecated(); }
export async function POST() { return deprecated(); }
