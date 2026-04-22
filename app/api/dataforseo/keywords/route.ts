// app/api/dataforseo/keywords/route.ts
// =============================================================================
// AI Marketing Lab — Keywords API Route
// Uses ranked_keywords endpoint — returns keywords a domain actually ranks for.
//
// Notes
// -----
// * No `search_volume > 0` filter — a new domain may rank for things DFS
//   hasn't measured volume for yet. We'd rather show them with volume 0 than
//   an empty page.
// * We sort client-side by position so the most visible ranks surface first.
// =============================================================================

import { NextResponse, NextRequest } from "next/server";

const DFS_BASE = "https://api.dataforseo.com/v3";

function basicAuth() {
  const login = process.env.DATAFORSEO_LOGIN;
  const pass  = process.env.DATAFORSEO_PASSWORD;
  if (!login || !pass) throw new Error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set");
  return "Basic " + Buffer.from(`${login}:${pass}`).toString("base64");
}

async function dfsPost(endpoint: string, body: unknown) {
  const res = await fetch(`${DFS_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Authorization": basicAuth(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`DataForSEO ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function POST(request: NextRequest) {
  try {
    const { domain, limit = 100 } = await request.json();
    if (!domain) return NextResponse.json({ error: "domain is required" }, { status: 400 });

    const target = String(domain).trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

    const data = await dfsPost("/dataforseo_labs/google/ranked_keywords/live", [{
      target,
      location_code: 2826,   // UK
      language_code: "en",
      limit,
      // Order by position — most visible ranks first.
      order_by:      ["ranked_serp_element.serp_item.rank_group,asc"],
      // NO filter on search_volume — we want to show every rank the domain has,
      // even for keywords where DFS hasn't measured volume.
    }]);

    const task = data?.tasks?.[0];
    if (task?.status_code !== 20000) {
      const msg = task?.status_message ?? "DataForSEO task failed";
      console.error("[keywords] DFS error:", task?.status_code, msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const items    = task?.result?.[0]?.items ?? [];
    const totalKw  = task?.result?.[0]?.total_count ?? items.length;

    const keywords = items
      .map((item: any) => ({
        term:       item.keyword_data?.keyword ?? "",
        position:   item.ranked_serp_element?.serp_item?.rank_group ?? 0,
        volume:     item.keyword_data?.keyword_info?.search_volume ?? 0,
        cpc:        parseFloat((item.keyword_data?.keyword_info?.cpc ?? 0).toFixed(2)),
        difficulty: item.keyword_data?.keyword_properties?.keyword_difficulty ?? 0,
        intent:     item.keyword_data?.search_intent_info?.main_intent ?? "informational",
        url:        item.ranked_serp_element?.serp_item?.url ?? "",
        featured:   item.ranked_serp_element?.serp_item?.type === "featured_snippet",
        aiOverview: false,
      }))
      .filter((k: any) => k.term);

    return NextResponse.json({ success: true, domain: target, keywords, total: totalKw });
  } catch (err: any) {
    console.error("[keywords]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const domain = new URL(request.url).searchParams.get("domain");
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });
  return POST(new NextRequest(request.url, { method: "POST", body: JSON.stringify({ domain, limit: 100 }) }));
}
