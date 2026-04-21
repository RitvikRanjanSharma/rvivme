// app/api/dataforseo/keyword-ideas/route.ts
// =============================================================================
// AI Marketing Lab — Keyword Ideas (Google Ads data via DataForSEO)
// Equivalent to Google Keyword Planner — same underlying data source
// Returns: search volume, CPC, competition, trends, related keywords
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";

const DFS_BASE = "https://api.dataforseo.com/v3";

function basicAuth(): string {
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
    const { seed, domain, mode = "seed" } = await request.json();
    // mode: "seed" = ideas from keywords, "site" = ideas from domain

    let endpoint: string;
    let payload: object;

    if (mode === "site" && domain) {
      // Site-based keyword ideas — mirrors Keyword Planner "Start with a website"
      endpoint = "/keywords_data/google_ads/keywords_for_site/live";
      payload  = [{
        target:        domain,
        location_code: 2826,   // UK
        language_code: "en",
        search_partners: false,
        limit: 50,
      }];
    } else {
      // Seed keyword ideas — mirrors Keyword Planner "Start with keywords"
      endpoint = "/keywords_data/google_ads/keywords_for_keywords/live";
      payload  = [{
        keywords:       Array.isArray(seed) ? seed : [seed],
        location_code:  2826,
        language_code:  "en",
        search_partners: false,
        limit: 50,
        order_by: ["keyword_data.keyword_info.search_volume,desc"],
      }];
    }

    const data = await dfsPost(endpoint, payload);
    const task = data?.tasks?.[0];

    if (task?.status_code !== 20000) {
      throw new Error(task?.status_message ?? "Keyword ideas task failed");
    }

    const items = task?.result?.[0]?.items ?? [];

    const keywords = items.map((item: any) => {
      const info       = item.keyword_info ?? {};
      const categories = item.keyword_properties ?? {};
      const monthly    = info.monthly_searches ?? [];

      return {
        term:        item.keyword,
        volume:      info.search_volume ?? 0,
        cpc:         parseFloat((info.cpc ?? 0).toFixed(2)),
        competition: parseFloat((info.competition ?? 0).toFixed(2)), // 0-1
        competitionLevel: info.competition_level ?? "LOW",            // LOW/MEDIUM/HIGH
        difficulty:  categories.keyword_difficulty ?? 0,             // 0-100
        intent:      item.search_intent_info?.main_intent ?? "informational",
        trend:       monthly.slice(-3).map((m: any) => ({
          month:  `${m.year}-${String(m.month).padStart(2,"0")}`,
          volume: m.search_volume ?? 0,
        })),
        // 3-month trend direction
        trending:    monthly.length >= 2
          ? (monthly[monthly.length-1]?.search_volume ?? 0) > (monthly[monthly.length-2]?.search_volume ?? 0)
            ? "up" : "down"
          : "stable",
      };
    });

    return NextResponse.json({ success: true, keywords, total: keywords.length });

  } catch (err: any) {
    console.error("[keyword-ideas]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
