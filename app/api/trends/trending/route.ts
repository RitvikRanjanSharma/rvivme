// app/api/trends/trending/route.ts
// =============================================================================
// AI Marketing Lab — Google Trends: Today's Trending Searches
// Wraps lib/google-trends.ts getTrendingNow. Pure "what's hot right now" feed
// — not tied to any specific keyword. Useful as a dashboard ticker or to spot
// zeitgeist topics worth writing about.
//
// Response contract (matches /api/gsc and /api/ga4):
//   200 { success: true, geo, items: [{title, traffic, articles: [...]}] }
//   200 { success: false, reason: "api_error", message } on upstream failure
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import {
  getTrendingNow,
  TRENDS_GEO,
  type TrendsGeo,
} from "@/lib/google-trends";

function resolveGeo(raw: string | null): TrendsGeo {
  if (!raw) return TRENDS_GEO.UK;
  const key = raw.toUpperCase() as keyof typeof TRENDS_GEO;
  return TRENDS_GEO[key] ?? TRENDS_GEO.UK;
}

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const geo    = resolveGeo(params.get("geo"));

    const items = await getTrendingNow(geo);

    return NextResponse.json({
      success: true,
      geo,
      items,
    });
  } catch (err: any) {
    console.error("[trends/trending]", err.message);
    return NextResponse.json(
      {
        success: false,
        reason:  "api_error",
        message: err.message ?? "Google Trends call failed.",
      },
      { status: 200 }
    );
  }
}
