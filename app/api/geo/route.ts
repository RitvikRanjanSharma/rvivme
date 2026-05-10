// app/api/geo/route.ts
// =============================================================================
// AI Marketing Lab — GEO (Generative Engine Optimisation) Citation Tracker
// =============================================================================
// Two modes, decided at runtime:
//
//   Mode A — "live" (real)
//     Calls DataForSEO's Live SERP API and inspects the `ai_overview` /
//     `ai_summary` SERP element returned for each keyword. Counts the
//     user's domain as cited if it appears in the AI Overview's references.
//     This is the truthful measurement.
//     Activated by env: DFS_SERP_ENABLED=true (and valid DFS credentials).
//
//   Mode B — "simulated" (fallback)
//     Sends the keyword to Claude with a prompt that asks for a likely AI
//     answer with citations. The UI is told explicitly that this is a
//     simulation, NOT a real Google AI Overview measurement.
//
// We always include `mode` in the response so the UI can render the right
// label ("Live AI Overview citations" vs "Simulated AI answer probe").
// Quotas apply to both modes (anthropic for B, dataforseo for A).
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import { checkAndIncrement } from "@/lib/quota";
import { getOrFetch, CACHE_NS, CACHE_TTL } from "@/lib/cache";

type Mode = "live" | "simulated" | "not_configured";

type CitationResult = {
  keyword:   string;
  cited:     boolean;
  answer:    string;
  mentioned: string[];
  source?:   "dfs_ai_overview" | "claude_simulation";
};

const DFS_SERP_ENABLED = process.env.DFS_SERP_ENABLED === "true";

export async function POST(req: NextRequest) {
  const caller = await getCallerOrNull();
  if (!caller) {
    return NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 });
  }

  const { domain, keywords } = await req.json().catch(() => ({} as { domain?: string; keywords?: string[] }));
  if (!domain || !Array.isArray(keywords) || keywords.length === 0) {
    return NextResponse.json({ error: "domain and keywords required" }, { status: 400 });
  }

  const slimDomain = String(domain).toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const top5 = keywords.slice(0, 5).map((s: string) => String(s).trim()).filter(Boolean);

  // Decide mode.
  const dfsAvailable = DFS_SERP_ENABLED
    && Boolean(process.env.DATAFORSEO_LOGIN)
    && Boolean(process.env.DATAFORSEO_PASSWORD);
  const anthropicAvailable = Boolean(process.env.ANTHROPIC_API_KEY);

  const mode: Mode = dfsAvailable ? "live" : anthropicAvailable ? "simulated" : "not_configured";

  if (mode === "not_configured") {
    return NextResponse.json({
      success: false,
      reason:  "not_configured",
      mode,
      message: "GEO citation tracking is not set up on this workspace yet.",
    }, { status: 200 });
  }

  // Quota check (count once per request for the dominant provider).
  const provider = mode === "live" ? "dataforseo" : "anthropic";
  const q = await checkAndIncrement(caller.supabase, caller.user.id, provider, {
    cost: mode === "live" ? top5.length * 0.15 : 0,
    endpoint: "/api/geo",
  });
  if (!q.allowed) {
    return NextResponse.json({
      success: false,
      reason:  "quota_exceeded",
      mode,
      message: `Daily ${provider} quota reached.`,
    }, { status: 200 });
  }

  // Run lookups in parallel.
  const results = await Promise.all(top5.map(async (kw: string): Promise<CitationResult> => {
    try {
      if (mode === "live") return await checkLiveAIOverview(caller.supabase, caller.user.id, slimDomain, kw);
      return await checkSimulated(caller.supabase, caller.user.id, slimDomain, kw);
    } catch {
      return { keyword: kw, cited: false, answer: "", mentioned: [] };
    }
  }));

  const cited = results.filter(r => r.cited).length;
  const citationRate = results.length > 0
    ? Math.round((cited / results.length) * 100)
    : 0;

  return NextResponse.json({
    success: true,
    mode,                    // "live" | "simulated" — UI uses this to label
    domain:  slimDomain,
    citationRate,
    results,
    totalChecked: results.length,
    cited,
    note: mode === "simulated"
      ? "Simulation only — uses an LLM to predict a likely AI answer. Enable DFS SERP for live measurement."
      : undefined,
  });
}

// ---------------------------------------------------------------------------
// Live mode — DataForSEO SERP with ai_overview SERP element
// ---------------------------------------------------------------------------
async function checkLiveAIOverview(
  sb: Parameters<typeof checkAndIncrement>[0],
  userId: string,
  domain: string,
  keyword: string,
): Promise<CitationResult> {
  const cacheKey = `${domain}::${keyword.toLowerCase()}`;

  return getOrFetch(sb, userId, CACHE_NS.GEO, cacheKey, CACHE_TTL.long, async () => {
    const auth = Buffer.from(
      `${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`,
    ).toString("base64");

    const res = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
      method:  "POST",
      headers: {
        Authorization:  `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{
        keyword,
        location_code: 2826, // United Kingdom
        language_code: "en",
        device:        "desktop",
        depth:         20,
      }]),
    });

    if (!res.ok) throw new Error(`DFS ${res.status}`);
    const json = await res.json();
    const items = json?.tasks?.[0]?.result?.[0]?.items ?? [];

    // Find the ai_overview / ai_summary SERP element if present.
    const overview = items.find((it: { type: string }) =>
      it.type === "ai_overview" || it.type === "ai_summary");
    if (!overview) {
      return { keyword, cited: false, answer: "", mentioned: [], source: "dfs_ai_overview" as const };
    }

    // Extract referenced URLs from the AI Overview.
    const refs: string[] = [];
    const collectFromArray = (arr: { url?: string; source?: { url?: string }; link?: string }[] | undefined) => {
      for (const r of arr ?? []) {
        const url = r?.url ?? r?.source?.url ?? r?.link;
        if (typeof url === "string") refs.push(url);
      }
    };
    collectFromArray(overview.references);
    collectFromArray(overview.items);

    const mentionedDomains = Array.from(new Set(refs.map(domainOf).filter(Boolean))) as string[];
    const cited = mentionedDomains.some(d => d === domain || d.endsWith(`.${domain}`));

    const answer = String(overview.text ?? overview.snippet ?? "").slice(0, 300);

    return {
      keyword,
      cited,
      answer:    answer.length === 300 ? `${answer}…` : answer,
      mentioned: mentionedDomains.slice(0, 8),
      source:    "dfs_ai_overview" as const,
    };
  });
}

// ---------------------------------------------------------------------------
// Simulated mode — Claude probe (clearly labelled in the UI as a simulation)
// ---------------------------------------------------------------------------
async function checkSimulated(
  sb: Parameters<typeof checkAndIncrement>[0],
  userId: string,
  domain: string,
  keyword: string,
): Promise<CitationResult> {
  const cacheKey = `sim::${domain}::${keyword.toLowerCase()}`;

  return getOrFetch(sb, userId, CACHE_NS.GEO, cacheKey, CACHE_TTL.medium, async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY!;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key":         apiKey,
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: "You are simulating what an AI search engine like Perplexity or Google AI Overviews would return. Respond as the AI giving a direct answer (2-3 paragraphs). Cite specific authoritative websites by name. Be specific with domain names.",
        messages: [{
          role:    "user",
          content: `Search query: "${keyword}"\n\nProvide a concise AI answer that cites specific websites and domains as sources.`,
        }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = await res.json();
    const answer = data?.content?.[0]?.text ?? "";

    const lower = answer.toLowerCase();
    const cited =
      lower.includes(domain.toLowerCase()) ||
      lower.includes(domain.replace(/^www\./, "").toLowerCase());

    const mentioned: string[] = [];
    const re = /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(answer)) !== null) {
      const d = m[1].toLowerCase();
      if (!mentioned.includes(d) && !d.startsWith("example")) mentioned.push(d);
    }

    return {
      keyword,
      cited,
      answer:    answer.length > 300 ? `${answer.slice(0, 300)}…` : answer,
      mentioned: mentioned.slice(0, 5),
      source:    "claude_simulation" as const,
    };
  });
}

function domainOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch { return ""; }
}
