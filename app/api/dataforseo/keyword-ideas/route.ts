// app/api/dataforseo/keyword-ideas/route.ts
// =============================================================================
// AI Marketing Lab — Keyword Ideas (Google Ads data via DataForSEO)
// Equivalent to Google Keyword Planner — same underlying data source.
// Returns: search volume, CPC, competition, trends.
//
// Response-shape gotcha
// ---------------------
// The `/keywords_data/google_ads/*` endpoints are NOT shaped like Labs. They
// return `tasks[0].result` as a FLAT ARRAY of keyword objects (no `.items`
// wrapper). If you treat them like Labs endpoints you get an empty list.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";

const DFS_BASE = "https://api.dataforseo.com/v3";

function basicAuth(): string {
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
    const { seed, domain, mode = "seed" } = await request.json();
    // mode: "seed" = ideas from keywords, "site" = ideas from domain

    let endpoint: string;
    let payload:  object;

    if (mode === "site") {
      if (!domain) {
        return NextResponse.json({ error: "domain is required for site mode" }, { status: 400 });
      }
      const target = String(domain).trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
      endpoint = "/keywords_data/google_ads/keywords_for_site/live";
      // `target_type: "site"` is the critical bit — without it the endpoint
      // only looks at the exact root page instead of crawling the whole site.
      payload  = [{
        target,
        target_type:    "site",
        location_code:  2826,   // UK
        language_code:  "en",
        search_partners: false,
        sort_by:        "search_volume",
        limit:          100,
      }];
    } else {
      const keywords = (Array.isArray(seed) ? seed : [seed])
        .map(s => String(s ?? "").trim())
        .filter(Boolean)
        .slice(0, 20);
      if (keywords.length === 0) {
        return NextResponse.json({ error: "seed keywords are required" }, { status: 400 });
      }
      endpoint = "/keywords_data/google_ads/keywords_for_keywords/live";
      payload  = [{
        keywords,
        location_code:  2826,
        language_code:  "en",
        search_partners: false,
        sort_by:        "search_volume",
        limit:          100,
      }];
    }

    const data = await dfsPost(endpoint, payload);
    const task = data?.tasks?.[0];

    if (task?.status_code !== 20000) {
      // Surface the real DFS error — often "Target URL is missing" or quota.
      const msg = task?.status_message ?? "Keyword ideas task failed";
      console.error("[keyword-ideas] DFS error:", task?.status_code, msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // Google Ads endpoints: result is a FLAT array of keyword objects.
    // Labs endpoints nest under result[0].items — do NOT confuse the two.
    const raw: any[] = Array.isArray(task?.result) ? task.result : [];

    const keywords = raw
      .map((item: any) => {
        const info       = item.keyword_info       ?? {};
        const properties = item.keyword_properties ?? {};
        const monthly    = info.monthly_searches   ?? [];

        const lastVol  = monthly.length >= 1 ? (monthly[monthly.length - 1]?.search_volume ?? 0) : 0;
        const prevVol  = monthly.length >= 2 ? (monthly[monthly.length - 2]?.search_volume ?? 0) : 0;
        const trending =
          monthly.length < 2 ? "stable" :
          lastVol > prevVol   ? "up"    :
          lastVol < prevVol   ? "down"  : "stable";

        return {
          term:             item.keyword ?? "",
          volume:           info.search_volume ?? 0,
          cpc:              parseFloat((info.cpc ?? 0).toFixed(2)),
          competition:      parseFloat((info.competition ?? 0).toFixed(2)),
          competitionLevel: info.competition_level ?? "LOW",
          difficulty:       properties.keyword_difficulty ?? 0,
          intent:           item.search_intent_info?.main_intent ?? "informational",
          trend:            monthly.slice(-3).map((m: any) => ({
            month:  `${m.year}-${String(m.month).padStart(2, "0")}`,
            volume: m.search_volume ?? 0,
          })),
          trending,
        };
      })
      .filter(k => k.term)
      // Sort again defensively — sort_by in payload isn't always honoured
      // for keywords_for_site, so we guarantee ordering here.
      .sort((a, b) => b.volume - a.volume);

    return NextResponse.json({ success: true, keywords, total: keywords.length });

  } catch (err: any) {
    console.error("[keyword-ideas]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
