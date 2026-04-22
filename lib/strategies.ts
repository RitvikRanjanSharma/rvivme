// lib/strategies.ts
// =============================================================================
// AI Marketing Lab — Strategy engine (browser-side)
// All strategy CRUD + AI-assisted flows. Uses the browser Supabase client so
// RLS gates access; the only server hop is /api/claude (the keyed proxy).
//
// This module owns:
//   - persistence of Strategy rows (save / activate / archive)
//   - the strategy↔keyword junction
//   - the AI-generated checklist
//   - progress computation (checklist done% + GSC delta vs. baseline)
//   - AI keyword-fit recommendations across a user's active strategies
//   - acronym derivation used as a visual badge everywhere
// =============================================================================

import { supabase } from "./supabase";
import type { Database } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
type StrategyRow     = Database["public"]["Tables"]["ai_strategies"]["Row"];
type ChecklistRow    = Database["public"]["Tables"]["strategy_checklist"]["Row"];
type StrategyKwRow   = Database["public"]["Tables"]["strategy_keywords"]["Row"];

export type Strategy         = StrategyRow;
export type StrategyChecklist = ChecklistRow;
export type StrategyKeyword  = StrategyKwRow;

export type BaselineMetrics = {
  capturedAt:  string;
  domain:      string;
  ga4?:        { sessions: number; users: number };
  gsc?:        { clicks: number; impressions: number; avgPosition: number; ctr: number };
  keywordPos?: Record<string, number>; // keyword → position at activation time
};

export type StrategyWithProgress = Strategy & {
  progress: {
    checklistTotal: number;
    checklistDone:  number;
    checklistPct:   number;
    gscDelta: null | {
      avgPositionDelta: number;  // negative = better
      clicksDelta:      number;
      ctrDelta:         number;
      coverage:         number;  // 0..1, share of target keywords with current data
    };
    overallPct: number;
  };
  keywords:  StrategyKeyword[];
  checklist: StrategyChecklist[];
};

// ─── Acronym derivation ───────────────────────────────────────────────────────
// The brief wants keyword badges on /keywords to reference the strategy by
// acronym, so the derivation needs to be stable and readable. We prefer the
// category (Claude already emits it) and fall back to initials from the title.
const STOPWORDS = new Set([
  "a","an","and","at","by","for","from","in","of","on","or","our","that","the",
  "to","with","your","target","use","via","into","on","off","up","down",
]);

export function deriveAcronym(input: { title?: string; category?: string }): string {
  const fromCategory = (input.category ?? "").replace(/[^a-zA-Z ]/g," ").trim();
  const source       = fromCategory.length >= 3 ? fromCategory : (input.title ?? "");
  const letters = source
    .split(/\s+/)
    .map(w => w.toLowerCase())
    .filter(w => w && !STOPWORDS.has(w))
    .map(w => w[0]!.toUpperCase())
    .join("");
  // Two-to-four letters reads well on a small badge.
  const clipped = letters.slice(0, 4);
  return clipped.length >= 2 ? clipped : (source.replace(/\s+/g,"").slice(0,3).toUpperCase() || "STR");
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
export async function listStrategies(opts?: { activeOnly?: boolean }) {
  let q = supabase.from("ai_strategies").select("*").order("created_at", { ascending: false });
  if (opts?.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data as Strategy[];
}

export async function getStrategy(id: string) {
  const { data, error } = await supabase
    .from("ai_strategies").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Strategy;
}

export async function getActiveStrategy(): Promise<Strategy | null> {
  const { data, error } = await supabase
    .from("ai_strategies").select("*").eq("is_active", true).maybeSingle();
  if (error) throw error;
  return (data as unknown as Strategy | null) ?? null;
}

export type StrategyDraft = {
  title:     string;
  rationale: string;
  impact:    number;   // 0..10
  effort:    number;   // 0..10
  timeframe: string;
  category:  string;
  domain:    string;
  baseline?: BaselineMetrics;
};

// Rethrow Supabase / Postgrest errors as real Error instances. PostgrestError
// fields are non-enumerable, so `console.error(e)` would otherwise print `{}`.
function rethrowPg(ctx: string, err: unknown): never {
  const e = err as { message?: string; code?: string; details?: string; hint?: string };
  const parts = [
    e?.message ?? "Unknown error",
    e?.code     ? `(code ${e.code})`         : "",
    e?.details  ? `· details: ${e.details}`  : "",
    e?.hint     ? `· hint: ${e.hint}`        : "",
  ].filter(Boolean);
  const wrapped = new Error(`${ctx}: ${parts.join(" ")}`);
  // Preserve original Postgrest fields for programmatic inspection.
  (wrapped as Error & Record<string, unknown>).cause    = err;
  (wrapped as Error & Record<string, unknown>).pgCode   = e?.code;
  (wrapped as Error & Record<string, unknown>).pgHint   = e?.hint;
  (wrapped as Error & Record<string, unknown>).pgDetail = e?.details;
  throw wrapped;
}

// Save + immediately activate. Enforces "one active per user" by demoting any
// existing active row first (the partial unique index would reject otherwise).
export async function saveAndActivateStrategy(draft: StrategyDraft): Promise<Strategy> {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) rethrowPg("auth.getUser failed", authErr);
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in — please refresh and log back in.");

  // Demote current active. If the is_active column doesn't exist yet (i.e. the
  // user hasn't run migration 005), this surfaces a crystal-clear error.
  const { error: demoteErr } = await supabase
    .from("ai_strategies")
    .update({ is_active: false } as never)
    .eq("user_id", userId)
    .eq("is_active", true);
  if (demoteErr) rethrowPg("Could not demote current active strategy", demoteErr);

  const row = {
    user_id:          userId,
    title:            draft.title,
    rationale:        draft.rationale,
    impact_score:     Number(draft.impact.toFixed(1)),
    effort_score:     Number(draft.effort.toFixed(1)),
    domain:           draft.domain,
    category:         draft.category,
    timeframe:        draft.timeframe,
    acronym:          deriveAcronym(draft),
    status:           "active",
    is_active:        true,
    actioned_at:      new Date().toISOString(),
    baseline_metrics: draft.baseline ?? null,
  };

  const { data, error } = await supabase
    .from("ai_strategies").insert(row as never).select("*").single();
  if (error) rethrowPg("Could not insert strategy", error);
  return data as unknown as Strategy;
}

export async function setActiveStrategy(id: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in");

  await supabase
    .from("ai_strategies")
    .update({ is_active: false } as never)
    .eq("user_id", userId)
    .eq("is_active", true);

  const { error } = await supabase
    .from("ai_strategies")
    .update({ is_active: true, status: "active" } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function archiveStrategy(id: string): Promise<void> {
  const { error } = await supabase
    .from("ai_strategies")
    .update({ is_active: false, status: "dismissed" } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function markStrategyCompleted(id: string): Promise<void> {
  const { error } = await supabase
    .from("ai_strategies")
    .update({ is_active: false, status: "completed" } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteStrategy(id: string): Promise<void> {
  const { error } = await supabase.from("ai_strategies").delete().eq("id", id);
  if (error) throw error;
}

// ─── Checklist ────────────────────────────────────────────────────────────────
export async function getChecklist(strategyId: string): Promise<ChecklistRow[]> {
  const { data, error } = await supabase
    .from("strategy_checklist")
    .select("*")
    .eq("strategy_id", strategyId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data as ChecklistRow[];
}

export async function toggleChecklistItem(itemId: string, done: boolean): Promise<void> {
  const { error } = await supabase
    .from("strategy_checklist")
    .update({
      is_completed: done,
      completed_at: done ? new Date().toISOString() : null,
    } as never)
    .eq("id", itemId);
  if (error) throw error;
}

// AI-generated checklist. We ask Claude for between 4 and 7 concrete steps,
// tailored to the strategy and the site's current state. The caller (strategy
// detail page) typically runs this once after activation and again any time
// the user hits "Regenerate plan".
export async function generateAndSavePlan(params: {
  strategy: Strategy;
  siteContext: {
    clicks?:      number;
    impressions?: number;
    avgPosition?: number;
    ctr?:         number;
    sessions?:    number;
    topQueries?:  string[];
    contentCount?: number;  // e.g. published blog posts
  };
  replace?: boolean;
}): Promise<ChecklistRow[]> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in");

  const { strategy, siteContext, replace = true } = params;

  const prompt = `You are an expert SEO and GEO strategist helping a small team execute a single strategy end-to-end.

STRATEGY
Title: ${strategy.title}
Category: ${strategy.category ?? "general"}
Rationale: ${strategy.rationale}
Timeframe: ${strategy.timeframe ?? "14-30 days"}
Impact: ${strategy.impact_score}/10 | Effort: ${strategy.effort_score}/10

SITE CONTEXT
Domain: ${strategy.domain ?? "unknown"}
GSC clicks (28d): ${siteContext.clicks ?? 0}
GSC impressions: ${siteContext.impressions ?? 0}
GSC avg position: ${siteContext.avgPosition ?? 0}
GSC CTR: ${siteContext.ctr ?? 0}%
GA4 sessions (30d): ${siteContext.sessions ?? 0}
Published posts: ${siteContext.contentCount ?? 0}
Top queries: ${(siteContext.topQueries ?? []).slice(0,5).join(", ") || "none yet"}

Produce 4 to 7 implementation steps. The site is NEW, so lean heavily on content creation (blogs, landing pages) and quick technical wins. Be specific — use the actual domain/queries where helpful.

Return ONLY valid JSON, an array, no markdown, no preamble:
[{"title":"...","description":"...","action_type":"blog|article|landing|social|meta|internal_link|outreach|tech|custom","action_payload":{"suggestedTitle":"","outline":["",""],"targetKeywords":[""]}}]

Rules:
- First step should almost always be the highest-leverage content piece (blog or landing).
- action_payload is optional but STRONGLY preferred for blog/article/landing/social steps.
- No step may exceed 240 chars in title.
- Descriptions should be 1-2 sentences, concrete and measurable.`;

  const res = await fetch("/api/claude", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ prompt, max_tokens: 1400 }),
  });
  const data = await res.json();
  if (data?.reason === "not_configured") throw new Error("AI is not configured on this workspace.");
  if (!res.ok || data.error)             throw new Error(data.error ?? "Plan generation failed");

  const raw    = (data.text ?? "[]").replace(/```json|```/g,"").trim();
  const parsed = JSON.parse(raw) as Array<{
    title: string; description?: string; action_type?: string; action_payload?: unknown;
  }>;

  if (replace) {
    await supabase.from("strategy_checklist").delete().eq("strategy_id", strategy.id);
  }

  const rows = parsed.slice(0, 12).map((item, i) => ({
    strategy_id:    strategy.id,
    user_id:        userId,
    position:       i,
    title:          String(item.title).slice(0, 240),
    description:    item.description ?? null,
    action_type:    (item.action_type as ChecklistRow["action_type"]) ?? "custom",
    action_payload: (item.action_payload as Record<string, unknown>) ?? null,
    is_completed:   false,
  }));

  const { data: inserted, error } = await supabase
    .from("strategy_checklist").insert(rows as never).select("*");
  if (error) throw error;
  return (inserted as unknown as ChecklistRow[]).sort((a,b) => a.position - b.position);
}

// ─── Keywords linkage ─────────────────────────────────────────────────────────
export async function getStrategyKeywords(strategyId: string): Promise<StrategyKwRow[]> {
  const { data, error } = await supabase
    .from("strategy_keywords")
    .select("*")
    .eq("strategy_id", strategyId)
    .order("added_at", { ascending: false });
  if (error) throw error;
  return data as StrategyKwRow[];
}

export type KeywordAttach = {
  keyword:      string;
  volume?:      number | null;
  difficulty?:  number | null;
  intent?:      string | null;
  source?:      StrategyKwRow["source"];
  baseline_pos?: number | null;
};

export async function attachKeywordsToStrategy(
  strategyId: string, keywords: KeywordAttach[],
): Promise<number> {
  if (!keywords.length) return 0;
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in");

  const rows = keywords.map(k => ({
    strategy_id:  strategyId,
    user_id:      userId,
    keyword:      k.keyword.trim().toLowerCase(),
    volume:       k.volume        ?? null,
    difficulty:   k.difficulty    ?? null,
    intent:       k.intent        ?? null,
    source:       k.source        ?? "manual",
    baseline_pos: k.baseline_pos  ?? null,
  }));

  // Upsert on (strategy_id, keyword) so repeat picks don't error.
  const { error, count } = await supabase
    .from("strategy_keywords")
    .upsert(rows as never, { onConflict: "strategy_id,keyword", count: "exact", ignoreDuplicates: false });
  if (error) throw error;
  return count ?? rows.length;
}

export async function detachKeyword(strategyKeywordId: string): Promise<void> {
  const { error } = await supabase
    .from("strategy_keywords").delete().eq("id", strategyKeywordId);
  if (error) throw error;
}

// ─── AI keyword fit recommendations ───────────────────────────────────────────
// Given a candidate list (e.g. competitor gap keywords) and the user's active
// strategies, ask Claude which keywords fit which strategy. The UI uses this
// to render acronym badges next to rows on /keywords so the user can tell at
// a glance "this keyword belongs to LTK".
export type RecommendedKeyword = {
  keyword: string;
  matches: Array<{ strategyId: string; acronym: string; score: number }>;
};

export async function recommendKeywordsForStrategies(params: {
  keywords:   string[];
  strategies: Array<Pick<Strategy, "id" | "title" | "category" | "rationale" | "acronym">>;
}): Promise<RecommendedKeyword[]> {
  const { keywords, strategies } = params;
  if (!keywords.length || !strategies.length) {
    return keywords.map(k => ({ keyword: k, matches: [] }));
  }

  const stratBlock = strategies.map(s =>
    `[${s.acronym ?? "??"}] ${s.title} — ${s.category ?? "general"}. ${s.rationale?.slice(0,220) ?? ""}`
  ).join("\n");

  // Chunk to avoid blowing past max_tokens on large keyword lists.
  const chunkSize = 60;
  const out: RecommendedKeyword[] = [];
  for (let i = 0; i < keywords.length; i += chunkSize) {
    const slice = keywords.slice(i, i + chunkSize);

    const prompt = `You are a marketing analyst matching keywords to strategies.

STRATEGIES (each with a short acronym in brackets):
${stratBlock}

KEYWORDS:
${slice.map((k, idx) => `${idx+1}. ${k}`).join("\n")}

For EACH keyword, return at most 2 matching strategies where the keyword is a strong fit. If none match, return an empty matches array. Fit is 0.0 to 1.0.

Return ONLY valid JSON, no markdown:
[{"keyword":"...","matches":[{"acronym":"XYZ","score":0.82}]}]`;

    const res = await fetch("/api/claude", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ prompt, max_tokens: 1600 }),
    });
    const data = await res.json();
    if (data?.reason === "not_configured") {
      // Graceful fallback: no AI → no badges, just echo the keywords.
      return keywords.map(k => ({ keyword: k, matches: [] }));
    }
    if (!res.ok || data.error) throw new Error(data.error ?? "Keyword recommend failed");

    try {
      const raw    = (data.text ?? "[]").replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(raw) as Array<{
        keyword: string;
        matches: Array<{ acronym: string; score: number }>;
      }>;
      // Resolve acronym → strategyId and clamp scores.
      const byAcronym = new Map(strategies.map(s => [s.acronym ?? "", s]));
      parsed.forEach(row => {
        const resolved = (row.matches ?? [])
          .map(m => {
            const strat = byAcronym.get(m.acronym);
            return strat ? {
              strategyId: strat.id,
              acronym:    strat.acronym ?? m.acronym,
              score:      Math.max(0, Math.min(1, Number(m.score) || 0)),
            } : null;
          })
          .filter((m): m is RecommendedKeyword["matches"][number] => m !== null)
          .sort((a,b) => b.score - a.score)
          .slice(0, 2);
        out.push({ keyword: row.keyword, matches: resolved });
      });
    } catch (e) {
      console.warn("[recommendKeywordsForStrategies] parse failed", e);
      slice.forEach(k => out.push({ keyword: k, matches: [] }));
    }
  }
  return out;
}

// ─── Progress computation ─────────────────────────────────────────────────────
// Given a strategy, its checklist, its linked keywords, and the latest GSC
// snapshot, produce the numbers the detail page renders. Baseline lives on
// the strategy row and is snapshotted at activation. GSC "current" is whatever
// the caller has fresh — we don't re-query it here.
export type CurrentGsc = {
  avgPosition?: number;
  clicks?:      number;
  ctr?:         number;
  keywordPos?:  Record<string, number>;
};

export function computeProgress(
  strategy: Strategy,
  checklist: ChecklistRow[],
  keywords:  StrategyKwRow[],
  current:   CurrentGsc | null,
): StrategyWithProgress["progress"] {
  const checklistTotal = checklist.length;
  const checklistDone  = checklist.filter(c => c.is_completed).length;
  const checklistPct   = checklistTotal ? checklistDone / checklistTotal : 0;

  const baseline = (strategy.baseline_metrics as unknown as BaselineMetrics | null) ?? null;

  let gscDelta: StrategyWithProgress["progress"]["gscDelta"] = null;
  if (baseline?.gsc && current) {
    const b = baseline.gsc;
    const c = {
      avgPosition: current.avgPosition ?? b.avgPosition,
      clicks:      current.clicks      ?? b.clicks,
      ctr:         current.ctr         ?? b.ctr,
    };

    const keywordTargets = keywords.map(k => k.keyword);
    let coverageHits = 0;
    if (current.keywordPos && keywordTargets.length) {
      keywordTargets.forEach(k => { if (current.keywordPos![k] != null) coverageHits++; });
    }
    const coverage = keywordTargets.length ? coverageHits / keywordTargets.length : 0;

    gscDelta = {
      avgPositionDelta: Number((c.avgPosition - b.avgPosition).toFixed(2)),  // <0 = better
      clicksDelta:      c.clicks - b.clicks,
      ctrDelta:         Number((c.ctr - b.ctr).toFixed(2)),
      coverage:         Number(coverage.toFixed(2)),
    };
  }

  // Overall combines checklist and GSC pos delta (if present). Checklist is
  // 0..1 directly; GSC contributes a 0..1 "traction" score based on how much
  // the avg position improved (0 improvement = 0; -3 positions = 1.0).
  let overall = checklistPct;
  if (gscDelta) {
    const traction = Math.max(0, Math.min(1, -gscDelta.avgPositionDelta / 3));
    overall = checklistPct * 0.6 + traction * 0.4;
  }

  return {
    checklistTotal,
    checklistDone,
    checklistPct: Number(checklistPct.toFixed(3)),
    gscDelta,
    overallPct:   Number(overall.toFixed(3)),
  };
}
