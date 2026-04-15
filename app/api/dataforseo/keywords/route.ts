import { NextResponse, type NextRequest } from "next/server";
import {
  dfsPost,
  extractErrorMessage,
  type DataForSeoKeywordItem,
} from "@/lib/dataforseo";

function mapKeyword(item: DataForSeoKeywordItem) {
  const rank = item.ranked_serp_element?.serp_item?.rank_group ?? 0;

  return {
    aiOverview: false,
    cpc: item.keyword_data?.keyword_info?.cpc ?? 0,
    ctr: Number.parseFloat((rank <= 3 ? 15 : 5).toFixed(1)),
    difficulty: item.keyword_data?.keyword_properties?.keyword_difficulty ?? 0,
    featured: item.ranked_serp_element?.serp_item?.type === "featured_snippet",
    intent: item.keyword_data?.search_intent_info?.main_intent ?? "informational",
    position: rank,
    term: item.keyword_data?.keyword ?? "",
    url: item.ranked_serp_element?.serp_item?.url ?? "",
    volume: item.keyword_data?.keyword_info?.search_volume ?? 0,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { domain, limit = 20, offset = 0 } = (await request.json()) as {
      domain?: string;
      limit?: number;
      offset?: number;
    };

    if (!domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    const data = await dfsPost<DataForSeoKeywordItem>("/serp/google/organic/live/regular", [
      {
        target: domain,
        location_code: 2826,
        language_code: "en",
        limit,
        offset,
        filters: [["keyword_data.keyword_info.search_volume", ">", 0]],
        order_by: ["ranked_serp_element.serp_item.rank_group,asc"],
      },
    ]);

    const task = data.tasks?.[0];

    if (task?.status_code !== 20000) {
      throw new Error(task?.status_message ?? "DataForSEO task failed");
    }

    const result = task.result?.[0];
    const keywords = (result?.items ?? []).map(mapKeyword);

    return NextResponse.json({
      success: true,
      domain,
      total: result?.total_count ?? keywords.length,
      keywords,
    });
  } catch (error) {
    const message = extractErrorMessage(error);
    console.error("[dataforseo/keywords]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain");

  if (!domain) {
    return NextResponse.json({ error: "domain query param required" }, { status: 400 });
  }

  try {
    const data = await dfsPost<DataForSeoKeywordItem>("/dataforseo_labs/google/ranked_keywords/live", [
      { target: domain, location_code: 2826, language_code: "en", limit: 20 },
    ]);

    const task = data.tasks?.[0];

    if (task?.status_code !== 20000) {
      throw new Error(task?.status_message ?? "Task failed");
    }

    const keywords = (task.result?.[0]?.items ?? []).map(mapKeyword);
    return NextResponse.json({ success: true, domain, total: keywords.length, keywords });
  } catch (error) {
    return NextResponse.json({ error: extractErrorMessage(error) }, { status: 500 });
  }
}
