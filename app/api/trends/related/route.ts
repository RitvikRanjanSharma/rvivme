// app/api/trends/related/route.ts
// =============================================================================
// AI Marketing Lab — Google Trends: Related Queries
// Wraps lib/google-trends.ts getRelatedQueries. Returns two ranked lists:
//   top    — most consistently searched related queries
//   rising — queries whose interest has grown fastest recently (opportunity
//            keywords — the closest free substitute for DataForSEO "keyword
//            ideas" without absolute volume numbers)
//
// Response contract (matches /api/gsc and /api/ga4):
//   200 { success: true, keyword, geo, timeframe, top: [...], rising: [...] }
//   200 { success: false, reason: "api_error", message } on upstream failure
//   400 { success: false, error: "keyword required" } on bad input
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import {
  getRelatedQueries,
  TRENDS_GEO,
  TRENDS_TIMEFRAMES,
  type TrendsGeo,
  type TrendsTimeframe,
} from "@/lib/google-trends";

function resolveGeo(raw: string | null): TrendsGeo {
  if (!raw) return TRENDS_GEO.UK;
  const key = raw.toUpperCase() as keyof typeof TRENDS_GEO;
  return TRENDS_GEO[key] ?? TRENDS_GEO.UK;
}

function resolveTimeframe(raw: string | null): string {
  if (!raw) return TRENDS_TIMEFRAMES["last-12-months"];
  if (raw in TRENDS_TIMEFRAMES) {
    return TRENDS_TIMEFRAMES[raw as TrendsTimeframe];
  }
  return raw;
}

export async function GET(request: NextRequest) {
  try {
    const params    = new URL(request.url).searchParams;
    const keyword   = params.get("keyword")?.trim();
    const geo       = resolveGeo(params.get("geo"));
    const timeframe = resolveTimeframe(params.get("timeframe"));

    if (!keyword) {
      return NextResponse.json(
        { success: false, error: "keyword required" },
        { status: 400 }
      );
    }

    const { top, rising } = await getRelatedQueries(keyword, geo, timeframe);

    return NextResponse.json({
      success: true,
      keyword,
      geo,
      timeframe,
      top,
      rising,
    });
  } catch (err: any) {
    console.error("[trends/related]", err.message);
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
