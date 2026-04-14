// app/api/dataforseo/keywords/route.ts
// =============================================================================
// AI Marketing Labs — DataForSEO Keywords API Route
// Server-side proxy — credentials never reach the browser
// Fetches keyword rankings for a target domain
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";

const DFS_BASE = "https://api.dataforseo.com/v3";

function basicAuth(): string {
  const login    = process.env.DATAFORSEO_LOGIN!;
  const password = process.env.DATAFORSEO_PASSWORD!;
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

async function dfsPost(endpoint: string, body: unknown) {
  const res = await fetch(`${DFS_BASE}${endpoint}`, {
    method:  "POST",
    headers: {
      "Authorization": basicAuth(),
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`DataForSEO error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function POST(request: NextRequest) {
  try {
    const { domain, limit = 20, offset = 0 } = await request.json();

    if (!domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    // Ranked Keywords — returns keywords a domain ranks for with positions
    const data = await dfsPost(
      "/serp/google/organic/live/regular",
      [
        {
          target:       domain,
          location_code: 2826,      // United Kingdom
          language_code: "en",
          limit,
          offset,
          filters: [
            ["keyword_data.keyword_info.search_volume", ">", 0],
          ],
          order_by: ["ranked_serp_element.serp_item.rank_group,asc"],
        },
      ]
    );

    const task = data?.tasks?.[0];

    if (task?.status_code !== 20000) {
      throw new Error(task?.status_message ?? "DataForSEO task failed");
    }

    const items = task?.result?.[0]?.items ?? [];

    // Normalise to our internal shape
    const keywords = items.map((item: any) => ({
      term:      item.keyword_data?.keyword ?? "",
      position:  item.ranked_serp_element?.serp_item?.rank_group ?? 0,
      volume:    item.keyword_data?.keyword_info?.search_volume ?? 0,
      cpc:       item.keyword_data?.keyword_info?.cpc ?? 0,
      ctr:       parseFloat(
        (item.ranked_serp_element?.serp_item?.rank_group <= 3 ? 15 : 5).toFixed(1)
      ),
      difficulty: item.keyword_data?.keyword_properties?.keyword_difficulty ?? 0,
      intent:    item.keyword_data?.search_intent_info?.main_intent ?? "informational",
      url:       item.ranked_serp_element?.serp_item?.url ?? "",
      featured:  item.ranked_serp_element?.serp_item?.type === "featured_snippet",
      aiOverview:false, // enriched separately via SERP route
    }));

    return NextResponse.json({
      success:  true,
      domain,
      total:    task?.result?.[0]?.total_count ?? keywords.length,
      keywords,
    });

  } catch (err: any) {
    console.error("[dataforseo/keywords]", err.message);
    return NextResponse.json(
      { error: err.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain");

  if (!domain) {
    return NextResponse.json({ error: "domain query param required" }, { status: 400 });
  }

  try {
    const data = await dfsPost(
      "/dataforseo_labs/google/ranked_keywords/live",
      [{ target: domain, location_code: 2826, language_code: "en", limit: 20 }]
    );

    const task    = data?.tasks?.[0];
    if (task?.status_code !== 20000) throw new Error(task?.status_message ?? "Task failed");

    const items   = task?.result?.[0]?.items ?? [];
    const keywords = items.map((item: any) => ({
      term:       item.keyword_data?.keyword ?? "",
      position:   item.ranked_serp_element?.serp_item?.rank_group ?? 0,
      volume:     item.keyword_data?.keyword_info?.search_volume ?? 0,
      cpc:        item.keyword_data?.keyword_info?.cpc ?? 0,
      ctr:        parseFloat((item.ranked_serp_element?.serp_item?.rank_group <= 3 ? 15 : 5).toFixed(1)),
      difficulty: item.keyword_data?.keyword_properties?.keyword_difficulty ?? 0,
      intent:     item.keyword_data?.search_intent_info?.main_intent ?? "informational",
      url:        item.ranked_serp_element?.serp_item?.url ?? "",
      featured:   item.ranked_serp_element?.serp_item?.type === "featured_snippet",
      aiOverview: false,
    }));

    return NextResponse.json({ success: true, domain, total: keywords.length, keywords });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
