// app/api/dataforseo/keyword-ideas/route.ts
// =============================================================================
// AI Marketing Lab — Keyword Ideas (DEPRECATED, replaced by Google Trends)
// Replaced by /api/keywords/ideas which uses Google Trends related queries
// (top + rising) instead of DataForSEO. Old route retained so stale clients
// get a clear migration message rather than a silent 404.
// =============================================================================

import { NextResponse } from "next/server";

function deprecated() {
  return NextResponse.json({
    success: false,
    reason:  "deprecated",
    message: "This endpoint has been replaced by /api/keywords/ideas (uses Google Trends instead of DataForSEO).",
    replacement: "/api/keywords/ideas",
  });
}

export async function GET()  { return deprecated(); }
export async function POST() { return deprecated(); }
