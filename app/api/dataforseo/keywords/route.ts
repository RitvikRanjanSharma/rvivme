// app/api/dataforseo/keywords/route.ts
// =============================================================================
// AI Marketing Lab — Keywords API Route
// Uses ranked_keywords endpoint — returns keywords a domain actually ranks for
// =============================================================================

import { NextResponse, NextRequest } from "next/server";

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
    const { domain, limit = 50 } = await request.json();
    if (!domain) return NextResponse.json({ error: "domain is required" }, { status: 400 });

    // Correct endpoint: ranked_keywords returns keywords the domain ranks for
    const data = await dfsPost("/dataforseo_labs/google/ranked_keywords/live", [{
      target:        domain,
      location_code: 2826,   // UK
      language_code: "en",
      limit,
      order_by:      ["keyword_data.keyword_info.search_volume,desc"],
      filters:       [["keyword_data.keyword_info.search_volume", ">", 0]],
    }]);

    const task = data?.tasks?.[0];
    if (task?.status_code !== 20000) {
      throw new Error(task?.status_message ?? "DataForSEO task failed");
    }

    const items = task?.result?.[0]?.items ?? [];

    const keywords = items.map((item: any) => ({
      term:       item.keyword_data?.keyword ?? "",
      position:   item.ranked_serp_element?.serp_item?.rank_group ?? 0,
      volume:     item.keyword_data?.keyword_info?.search_volume ?? 0,
      cpc:        parseFloat((item.keyword_data?.keyword_info?.cpc ?? 0).toFixed(2)),
      difficulty: item.keyword_data?.keyword_properties?.keyword_difficulty ?? 0,
      intent:     item.keyword_data?.search_intent_info?.main_intent ?? "informational",
      url:        item.ranked_serp_element?.serp_item?.url ?? "",
      featured:   item.ranked_serp_element?.serp_item?.type === "featured_snippet",
      aiOverview: false,
    }));

    return NextResponse.json({ success: true, domain, keywords, total: task?.result?.[0]?.total_count ?? keywords.length });
  } catch (err: any) {
    console.error("[keywords]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const domain = new URL(request.url).searchParams.get("domain");
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });
  return POST(new NextRequest(request.url, { method: "POST", body: JSON.stringify({ domain, limit: 50 }) }));
}
