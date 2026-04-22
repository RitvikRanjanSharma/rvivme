// app/api/keywords/ideas/route.ts
// =============================================================================
// AI Marketing Lab — Keyword Ideas (Google Trends + GSC)
// Free replacement for DataForSEO keyword ideas. We merge two signals:
//   • `top`    related queries   — consistently searched alongside the seed
//   • `rising` related queries   — fastest-growing queries RIGHT NOW
//     ("rising" is the closest thing Google gives you to opportunity keywords
//      without paying for Keyword Planner.)
//
// Modes (kept API-compatible with the retired /api/dataforseo/keyword-ideas):
//   mode = "seed"  → body.seed is a string or array of seed keywords (≤5)
//   mode = "site"  → we fetch the caller's top GSC queries and use those as
//                    seeds, so site mode still "just works" without a seed
//                    being typed.
//
// What we cannot provide vs DataForSEO (and so return as null):
//   • absolute monthly search volume
//   • CPC / competition
//   • keyword difficulty
//   • explicit intent classification
//
// What we DO provide that DataForSEO didn't:
//   • `trendScore` — Google's own relative interest number for the query
//   • `trending: "up" | "stable"` derived from top vs rising bucket
//   • `source: "trends-top" | "trends-rising"` — which bucket the query came
//      from, so the UI can badge "Rising" explicitly
//
// Response contract:
//   200 { success: true, seeds, keywords: [...], total }
//   200 { success: false, reason: "api_error", message } on upstream failure
//   400 on bad input
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import {
  getRelatedQueries,
  TRENDS_GEO,
  TRENDS_TIMEFRAMES,
  type TrendsGeo,
} from "@/lib/google-trends";
import { getGoogleAccessToken } from "@/lib/google-auth";
import { getCallerOrNull }      from "@/lib/supabase-server";

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";
const GSC_SCOPE    = "https://www.googleapis.com/auth/webmasters.readonly";

type IdeaRow = {
  term:             string;
  volume:           number | null;
  cpc:              number | null;
  competition:      number | null;
  competitionLevel: string;
  difficulty:       number | null;
  intent:           string | null;
  trend:            Array<{ month: string; volume: number }>;
  trending:         "up" | "stable" | "down";
  trendScore:       number;
  source:           "trends-top" | "trends-rising";
};

function resolveGeo(raw: string | undefined | null): TrendsGeo {
  if (!raw) return TRENDS_GEO.UK;
  const key = String(raw).toUpperCase() as keyof typeof TRENDS_GEO;
  return TRENDS_GEO[key] ?? TRENDS_GEO.UK;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { seed, mode = "seed", geo } = body as {
      seed?: string | string[];
      mode?: "seed" | "site";
      geo?:  string;
    };
    const resolvedGeo = resolveGeo(geo);
    const timeframe   = TRENDS_TIMEFRAMES["last-12-months"];

    // ── 1. Figure out which seed keywords to explore ──────────────────────
    let seeds: string[] = [];

    if (mode === "site") {
      // Pull top GSC queries for the authenticated caller's site and use them
      // as seeds. This preserves the original UX — the user clicks "Ideas for
      // my site" and gets results without having to type anything.
      const caller = await getCallerOrNull();
      if (!caller) {
        return NextResponse.json(
          { success: false, error: "unauthenticated" },
          { status: 401 }
        );
      }
      const { data } = await caller.supabase
        .from("users")
        .select("gsc_site_url")
        .eq("id", caller.user.id)
        .single();
      const siteUrl = (data as { gsc_site_url: string | null } | null)?.gsc_site_url?.trim();
      if (!siteUrl) {
        return NextResponse.json({
          success: false,
          reason:  "not_configured",
          message: "Connect Search Console under Settings to use 'ideas for my site'.",
        });
      }
      seeds = await fetchTopGscQueries(siteUrl, 3);
      if (seeds.length === 0) {
        return NextResponse.json({
          success: false,
          reason:  "no_gsc_data",
          message: "Search Console hasn't returned any queries for your site yet — try again once it has some impressions.",
        });
      }
    } else {
      // Seed mode — accept a string or array.
      const raw = Array.isArray(seed) ? seed : [seed];
      seeds = raw
        .map(s => String(s ?? "").trim())
        .filter(Boolean)
        .slice(0, 5); // cap to keep Trends-rate-limit headroom
      if (seeds.length === 0) {
        return NextResponse.json(
          { success: false, error: "seed keywords are required" },
          { status: 400 }
        );
      }
    }

    // ── 2. Fetch related queries for each seed in parallel ────────────────
    const perSeed = await Promise.all(
      seeds.map(async s => {
        try {
          const r = await getRelatedQueries(s, resolvedGeo, timeframe);
          return { seed: s, ...r };
        } catch (e) {
          console.warn("[keywords/ideas] seed failed:", s, (e as Error).message);
          return { seed: s, top: [], rising: [] };
        }
      })
    );

    // ── 3. Merge + dedupe by query term (prefer `rising` bucket) ─────────
    const byTerm = new Map<string, IdeaRow>();

    for (const { top, rising } of perSeed) {
      for (const r of rising) {
        const key = r.query.toLowerCase();
        if (!byTerm.has(key)) {
          byTerm.set(key, {
            term:             r.query,
            volume:           null,
            cpc:              null,
            competition:      null,
            competitionLevel: "UNKNOWN",
            difficulty:       null,
            intent:           null,
            trend:            [],
            trending:         "up",
            trendScore:       r.value,
            source:           "trends-rising",
          });
        }
      }
      for (const t of top) {
        const key = t.query.toLowerCase();
        if (!byTerm.has(key)) {
          byTerm.set(key, {
            term:             t.query,
            volume:           null,
            cpc:              null,
            competition:      null,
            competitionLevel: "UNKNOWN",
            difficulty:       null,
            intent:           null,
            trend:            [],
            trending:         "stable",
            trendScore:       t.value,
            source:           "trends-top",
          });
        }
      }
    }

    // Rising entries first (higher value = higher %growth), then top sorted
    // by Trends' own relative score.
    const keywords = [...byTerm.values()].sort((a, b) => {
      if (a.source !== b.source) return a.source === "trends-rising" ? -1 : 1;
      return b.trendScore - a.trendScore;
    });

    return NextResponse.json({
      success: true,
      source:  "trends",
      seeds,
      geo:     resolvedGeo,
      keywords,
      total:   keywords.length,
    });
  } catch (err: any) {
    console.error("[keywords/ideas]", err.message);
    return NextResponse.json({
      success: false,
      reason:  "api_error",
      message: err.message ?? "Google Trends call failed.",
    });
  }
}

// ── Internal: top GSC queries for a given siteUrl ──────────────────────────
async function fetchTopGscQueries(siteUrl: string, limit: number): Promise<string[]> {
  const token   = await getGoogleAccessToken(GSC_SCOPE);
  const encoded = encodeURIComponent(siteUrl);

  const body = {
    startDate: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10),
    endDate:   new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10),
    searchType: "web",
    dimensions: ["query"],
    rowLimit:   limit,
    orderBy:    [{ fieldName: "impressions", sortOrder: "DESCENDING" }],
  };

  const res = await fetch(
    `${GSC_API_BASE}/sites/${encoded}/searchAnalytics/query`,
    {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`GSC API error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  return ((data.rows ?? []) as Array<{ keys: [string] }>)
    .map(r => r.keys[0])
    .filter(Boolean);
}

// Allow GET as a convenience so dashboards / cron probes can hit it with just
// ?seed=foo without a POST body.
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const seed   = params.get("seed");
  const mode   = (params.get("mode") as "seed" | "site") ?? (seed ? "seed" : "site");
  const geo    = params.get("geo") ?? undefined;

  // Rebuild the request as a POST and delegate so the logic stays in one place.
  return POST(new NextRequest(request.url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ seed: seed ?? undefined, mode, geo }),
  }));
}
