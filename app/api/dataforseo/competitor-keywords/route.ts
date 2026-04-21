// app/api/dataforseo/competitor-keywords/route.ts
// =============================================================================
// AI Marketing Lab — Competitor Keywords API
// Returns:
//   - gapKeywords: keywords the competitor ranks for that you don't
//   - oppKeywords: quick-win opportunities (competitor's low-difficulty terms
//                  that you don't rank for)
//
// Implementation: DataForSEO has no first-class "keyword gap" endpoint under
// /dataforseo_labs/google. We compose the answer client-side:
//   1. competitor's ranked_keywords (high volume)
//   2. your ranked_keywords (to subtract out terms you already rank for)
//   3. difference + filters = gap / opportunities
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";

const DFS_BASE = "https://api.dataforseo.com/v3";

function basicAuth() {
  const login = process.env.DATAFORSEO_LOGIN;
  const pass  = process.env.DATAFORSEO_PASSWORD;
  if (!login || !pass) throw new Error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set");
  return "Basic " + Buffer.from(`${login}:${pass}`).toString("base64");
}

async function dfsPost(endpoint: string, body: unknown) {
  const res = await fetch(`${DFS_BASE}${endpoint}`, {
    method:  "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`DataForSEO ${res.status}: ${text.slice(0, 160)}`);
  }
  return res.json();
}

async function fetchRankedKeywords(target: string, limit: number, difficultyMax?: number) {
  const filters: any[] = [["keyword_data.keyword_info.search_volume", ">", 50]];
  if (difficultyMax != null) {
    filters.push("and");
    filters.push(["keyword_data.keyword_properties.keyword_difficulty", "<", difficultyMax]);
  }
  const data = await dfsPost("/dataforseo_labs/google/ranked_keywords/live", [{
    target,
    location_code: 2826,
    language_code: "en",
    limit,
    order_by:      ["keyword_data.keyword_info.search_volume,desc"],
    filters,
  }]);
  const task = data?.tasks?.[0];
  if (task?.status_code !== 20000) {
    throw new Error(task?.status_message ?? "DataForSEO ranked_keywords failed");
  }
  return task?.result?.[0]?.items ?? [];
}

function normalise(item: any) {
  const kd = item.keyword_data       ?? {};
  const ki = kd.keyword_info         ?? {};
  const kp = kd.keyword_properties   ?? {};
  const si = kd.search_intent_info   ?? {};
  const rs = item.ranked_serp_element?.serp_item ?? {};
  return {
    term:             kd.keyword ?? "",
    volume:           ki.search_volume ?? 0,
    difficulty:       kp.keyword_difficulty ?? 0,
    cpc:              parseFloat((ki.cpc ?? 0).toFixed(2)),
    competitionLevel: ki.competition_level ?? "LOW",
    intent:           si.main_intent ?? "informational",
    competitorPos:    rs.rank_group ?? 0,
    yourPos:          null as number | null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { yourDomain, competitorDomain, limit = 50 } = await request.json();

    if (!yourDomain || !competitorDomain) {
      return NextResponse.json({ error: "yourDomain and competitorDomain are required" }, { status: 400 });
    }

    // Fetch competitor's top terms (high volume) and easy terms in parallel,
    // plus your own top terms so we can subtract overlap.
    const [compTop, compEasy, yourTop] = await Promise.all([
      fetchRankedKeywords(competitorDomain, limit * 2),       // high volume
      fetchRankedKeywords(competitorDomain, limit * 2, 40),   // low difficulty
      fetchRankedKeywords(yourDomain,       500),             // broad — for subtraction
    ]);

    const yourTerms = new Set<string>(
      yourTop.map((it: any) => (it.keyword_data?.keyword ?? "").toLowerCase()).filter(Boolean)
    );

    const gapKeywords = compTop
      .map(normalise)
      .filter((k: any) => k.term && !yourTerms.has(k.term.toLowerCase()))
      .slice(0, limit);

    const gapTerms = new Set(gapKeywords.map((k: any) => k.term.toLowerCase()));

    const oppKeywords = compEasy
      .map(normalise)
      .filter((k: any) =>
        k.term &&
        !yourTerms.has(k.term.toLowerCase()) &&
        !gapTerms.has(k.term.toLowerCase())
      )
      .slice(0, limit);

    return NextResponse.json({
      success: true,
      yourDomain,
      competitorDomain,
      gapKeywords,
      oppKeywords,
    });
  } catch (err: any) {
    console.error("[competitor-keywords]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
