// app/api/dataforseo/competitor-keywords/route.ts
// =============================================================================
// AI Marketing Lab — Competitor Keywords API
// Returns: all competitor keywords + gap analysis (you don't rank for these)
//          + opportunities (low difficulty, decent volume)
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";

const DFS_BASE = "https://api.dataforseo.com/v3";

function basicAuth() {
  return "Basic " + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");
}

async function dfsPost(endpoint: string, body: unknown) {
  const res = await fetch(`${DFS_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Authorization": basicAuth(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DataForSEO ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function POST(request: NextRequest) {
  try {
    const { yourDomain, competitorDomain, limit = 50 } = await request.json();

    if (!yourDomain || !competitorDomain) {
      return NextResponse.json({ error: "yourDomain and competitorDomain are required" }, { status: 400 });
    }

    // Get keyword gap: keywords competitor ranks for that YOU don't
    const gapData = await dfsPost("/dataforseo_labs/google/keyword_gap/live", [{
      targets: [yourDomain, competitorDomain],
      location_code: 2826,
      language_code: "en",
      limit,
      intersections: false, // false = keywords competitor has that you don't
      order_by: ["keyword_data.keyword_info.search_volume,desc"],
      filters: [
        ["keyword_data.keyword_info.search_volume", ">", 100],
      ],
    }]);

    const gapTask  = gapData?.tasks?.[0];
    const gapItems = gapTask?.result?.[0]?.items ?? [];

    // Also get opportunities: keywords competitor ranks for with low difficulty
    const oppData = await dfsPost("/dataforseo_labs/google/keyword_gap/live", [{
      targets: [yourDomain, competitorDomain],
      location_code: 2826,
      language_code: "en",
      limit,
      intersections: false,
      order_by: ["keyword_data.keyword_properties.keyword_difficulty,asc"],
      filters: [
        ["keyword_data.keyword_info.search_volume", ">", 50],
        ["keyword_data.keyword_properties.keyword_difficulty", "<", 40],
      ],
    }]);

    const oppTask  = oppData?.tasks?.[0];
    const oppItems = oppTask?.result?.[0]?.items ?? [];

    function normalise(item: any) {
      const kd  = item.keyword_data ?? {};
      const ki  = kd.keyword_info ?? {};
      const kp  = kd.keyword_properties ?? {};
      const si  = kd.search_intent_info ?? {};
      // competitor rank position
      const rankMap = item.ranked_elements ?? [];
      const compEl  = rankMap.find((e: any) => e.se_domain === competitorDomain);
      return {
        term:            kd.keyword ?? item.keyword ?? "",
        volume:          ki.search_volume ?? 0,
        difficulty:      kp.keyword_difficulty ?? 0,
        cpc:             parseFloat((ki.cpc ?? 0).toFixed(2)),
        competitionLevel: ki.competition_level ?? "LOW",
        intent:          si.main_intent ?? "informational",
        competitorPos:   compEl?.ranked_serp_element?.serp_item?.rank_group ?? 0,
        yourPos:         null as number | null, // you don't rank — that's the gap
      };
    }

    const gapKeywords = gapItems.map(normalise);
    const oppKeywords = oppItems.map(normalise);

    // Deduplicate opportunities (remove overlap with gap)
    const gapTerms = new Set(gapKeywords.map((k: any) => k.term));
    const uniqueOpp = oppKeywords.filter((k: any) => !gapTerms.has(k.term));

    return NextResponse.json({
      success:         true,
      competitorDomain,
      yourDomain,
      gapKeywords,      // high volume you're missing
      oppKeywords:      uniqueOpp, // low difficulty quick wins
    });

  } catch (err: any) {
    console.error("[competitor-keywords]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
