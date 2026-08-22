"use client";

// app/keywords/page.tsx
// =============================================================================
// AI Marketing Lab — Keyword Intelligence
// Live rankings · Keyword ideas · Competitor keywords + AI analysis
// =============================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { BRAND_DEFAULT } from "@/app/ui/app-shell";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  Search, TrendingUp, TrendingDown, Minus,
  RefreshCw, AlertTriangle, Lightbulb, Zap,
  ChevronDown, ChevronUp, Globe2, ArrowRight,
  Save, Download, Check, Target, X,
} from "lucide-react";
import { useDomain } from "@/lib/useDomain";
import { supabase } from "@/lib/supabase";
import {
  listStrategies, attachKeywordsToStrategy,
  recommendKeywordsForStrategies,
  type Strategy, type KeywordAttach, type RecommendedKeyword,
} from "@/lib/strategies";

const EASE: [number,number,number,number] = [0.16, 1, 0.3, 1];

// ─── Types ────────────────────────────────────────────────────────────────────
// Rankings now come from Google Search Console (see /api/keywords/ranked).
// GSC gives us clicks / impressions / CTR / position / landing URL directly.
// It doesn't give us volume / CPC / keyword difficulty / intent — those are
// DataForSEO-only signals, kept as optional `null` fields so the UI can fall
// back to an em-dash where we used to show a number.
interface LiveKw {
  term:        string;
  position:    number;
  clicks:      number;
  impressions: number;
  ctr:         number;       // percentage (0-100)
  url:         string;
  volume:      number | null;
  cpc:         number | null;
  difficulty:  number | null;
  intent:      string | null;
  featured:    boolean;
  aiOverview:  boolean;
}
// Ideas come from Google Trends related queries (see /api/keywords/ideas).
// We lose absolute volume / CPC / competition / difficulty; we gain Trends'
// own relative score and a "rising vs top" source flag.
interface IdeaKw {
  term:             string;
  trending:         "up" | "stable" | "down";
  trendScore:       number;                            // 0-100 for top, %-growth for rising
  source?:          "trends-top" | "trends-rising";
  // Legacy fields — present for shape compatibility with existing callers, but
  // always null when the source is Trends.
  volume:           number | null;
  cpc:              number | null;
  competitionLevel: string;
  difficulty:       number | null;
  intent:           string | null;
}
// The competitor tab no longer asks which keywords a rival RANKS for. That
// needs a crawled SERP corpus, there is no free equivalent, and the endpoint
// behind it had been returning "unavailable" while this page kept calling it.
//
// It now asks what they PUBLISH that you have no search presence for: their
// sitemap and page titles on one side, your real Search Console queries on the
// other. See lib/content-gap.ts. A narrower claim, but a true one.
type GapPage = {
  url: string; title: string; terms: string[];
  verdict: "covered" | "gap" | "unclear";
  matchedQuery?: string; overlap: number;
};
// The planner view. Buckets are recomputed from live Search Console data on
// every load rather than stored, because a keyword's situation moves and a
// stored label would go stale without saying so.
type Bucket =
  | "winning" | "striking" | "ctr_gap" | "slipping" | "competing"
  | "no_presence" | "mismatch" | "brand" | "watching";
type BucketMeta = { label: string; meaning: string; action: string; order: number };
type BucketedKeyword = {
  term: string; bucket: Bucket; why: string; watched: boolean; source: string | null;
  clicks: number | null; impressions: number | null; ctr: number | null; position: number | null;
  opportunityScore: number | null; confidence: "high" | "medium" | "low" | null;
};
type BucketResult = {
  keywords: BucketedKeyword[];
  counts:   Record<Bucket, number>;
  meta:     Record<Bucket, BucketMeta>;
  basis:    { queries: number; watched: number; fromOpportunity: number; period: string };
  scale:    { isEarlyStage: boolean; totalImpressions: number; queryCount: number };
};

type GapResult = {
  competitor: string;
  sitemapUrl: string | null;
  sample: { fetched: number; attempted: number; totalInSitemap: number; truncated: boolean };
  basis:  { queries: number; period: string; siteUrl: string };
  assessed: number;
  gaps: GapPage[]; covered: GapPage[]; unclear: GapPage[];
  themes: Array<{ term: string; pages: number }>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function diffColor(d: number) {
  if (d >= 70) return "var(--signal-red)";
  if (d >= 40) return "var(--signal-amber)";
  return "var(--signal-green)";
}
function intentColor(i: string) {
  return ({
    transactional: "var(--signal-green)",
    commercial:    "var(--brand)",
    informational: "var(--text-tertiary)",
    navigational:  "var(--signal-amber)",
  } as any)[i] ?? "var(--text-tertiary)";
}
function TrendIcon({ d }: { d: string }) {
  if (d === "up")   return <TrendingUp  size={12} color="var(--signal-green)" />;
  if (d === "down") return <TrendingDown size={12} color="var(--signal-red)"  />;
  return <Minus size={12} color="var(--text-tertiary)" />;
}

// ─── Small components ─────────────────────────────────────────────────────────
function KpiCard({ label, value, color }: { label: string; value: string|number; color: string }) {
  return (
    <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"12px", padding:"20px 22px" }}>
      <div style={{ fontFamily:"var(--font-display)", fontSize:"clamp(1.8rem,3vw,2.4rem)", letterSpacing:"-0.04em", lineHeight:1, color, marginBottom:"6px" }}>{value}</div>
      <div style={{ fontFamily:"var(--font-body)", fontSize:"12px", color:"var(--text-secondary)" }}>{label}</div>
    </div>
  );
}

function EmptyState({ msg, brandColor }: { msg: string; brandColor: string }) {
  return (
    <div style={{ padding:"60px 32px", textAlign:"center" }}>
      <div style={{ width:"44px", height:"44px", borderRadius:"10px", background:`rgba(var(--brand-rgb),0.08)`, border:`1px solid rgba(var(--brand-rgb),0.18)`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
        <Search size={18} color={brandColor} />
      </div>
      <div style={{ fontFamily:"var(--font-body)", fontSize:"14px", color:"var(--text-secondary)" }}>{msg}</div>
    </div>
  );
}

/**
 * One fact about how a result was produced.
 *
 * Sits above the content-gap table because the reader needs to know it is a
 * sample of their site measured against 28 days of your queries, not a
 * complete account of either. A finding whose basis is invisible gets read as
 * more certain than it is.
 */
function Basis({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontFamily:"var(--font-mono)", fontSize:"9px", letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--text-tertiary)", marginBottom:"3px" }}>{label}</div>
      <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", color: accent ?? "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

/** One figure with its label, or an em dash when there is nothing to report. */
function Stat({ label, value }: { label: string; value: string }) {
  const unknown = value === "—";
  return (
    <div style={{ textAlign:"right", minWidth:"46px" }}>
      <div style={{ fontFamily:"var(--font-mono)", fontSize:"12px", color: unknown ? "var(--text-tertiary)" : "var(--text-primary)" }}>{value}</div>
      <div style={{ fontFamily:"var(--font-mono)", fontSize:"8px", letterSpacing:"0.08em", color:"var(--text-tertiary)" }}>{label}</div>
    </div>
  );
}

function DiffBar({ d }: { d: number }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:"7px" }}>
      <div style={{ width:"44px", height:"4px", background:"var(--muted)", borderRadius:"2px", overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${d}%`, background:diffColor(d), borderRadius:"2px" }} />
      </div>
      <span style={{ fontFamily:"var(--font-mono)", fontSize:"11px", color:diffColor(d) }}>{d}</span>
    </div>
  );
}

function IntentBadge({ i }: { i: string }) {
  return (
    <span style={{ fontFamily:"var(--font-mono)", fontSize:"9px", letterSpacing:"0.08em", textTransform:"capitalize", color:intentColor(i), background:`${intentColor(i)}18`, padding:"2px 7px", borderRadius:"100px" }}>{i}</span>
  );
}

// ─── Keyword table (reusable, column-driven) ─────────────────────────────────
// Each tab now passes its own list of columns so we can render different fields
// (GSC clicks/impressions vs Trends rising-score) without the table silently
// mismatching its `<th>`s and `<td>`s.
type KwColumn<T> = {
  header:    string;
  render:    (kw: T) => React.ReactNode;
  minWidth?: number;
};

// Little formatter so nulls render as an em-dash instead of the misleading 0
// we used to show when GSC-source rows lacked volume/CPC/difficulty.
function numOrDash(v: number | null | undefined, fmt?: (n: number) => string): React.ReactNode {
  if (v == null) return <span style={{ color:"var(--text-tertiary)" }}>—</span>;
  return fmt ? fmt(v) : v.toLocaleString();
}

function KwTable<T extends { term: string }>({
  keywords, columns, emptyMsg, brandColor,
  selectable = false, selected, onToggleSelect, onToggleAll, badges,
}: {
  keywords: T[]; columns: KwColumn<T>[]; emptyMsg: string; brandColor: string;
  selectable?: boolean;
  selected?: Set<string>;
  onToggleSelect?: (term: string) => void;
  onToggleAll?: (terms: string[], select: boolean) => void;
  badges?: Record<string, RecommendedKeyword["matches"]>;
}) {
  if (keywords.length === 0) return <EmptyState msg={emptyMsg} brandColor={brandColor} />;
  const allTerms    = keywords.map(k => k.term);
  const allChecked  = selectable && selected && allTerms.every(t => selected.has(t));
  const someChecked = selectable && selected && allTerms.some(t => selected.has(t));

  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ borderCollapse:"collapse", width:"100%" }}>
        <thead>
          <tr>
            {selectable && (
              <th style={{ padding:"10px 10px 10px 14px", width:24, borderBottom:"1px solid var(--border)" }}>
                <input
                  type="checkbox"
                  aria-label="Select all visible keywords"
                  checked={!!allChecked}
                  ref={(el) => { if (el) el.indeterminate = !!someChecked && !allChecked; }}
                  onChange={(e) => onToggleAll?.(allTerms, e.target.checked)}
                  style={{ accentColor: brandColor, cursor: "pointer" }}
                />
              </th>
            )}
            <th style={{ padding:"10px 14px", textAlign:"left", fontFamily:"var(--font-mono)", fontSize:"9px", color:"var(--text-tertiary)", letterSpacing:"0.1em", textTransform:"uppercase", borderBottom:"1px solid var(--border)", whiteSpace:"nowrap" }}>Keyword</th>
            {columns.map(c => (
              <th key={c.header}
                  style={{ padding:"10px 14px", textAlign:"left", fontFamily:"var(--font-mono)", fontSize:"9px", color:"var(--text-tertiary)", letterSpacing:"0.1em", textTransform:"uppercase", borderBottom:"1px solid var(--border)", whiteSpace:"nowrap", minWidth: c.minWidth }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keywords.map((kw, i) => {
            const isSelected = selectable && selected?.has(kw.term);
            const rowBadges  = badges?.[kw.term.toLowerCase()] ?? [];
            const borderBottom = i < keywords.length - 1 ? "1px solid var(--border)" : "none";
            return (
              <tr key={kw.term + i}
                style={{ background: isSelected ? "rgba(var(--brand-rgb),0.06)" : "transparent", transition: "background 0.12s" }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--muted)"; }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                {selectable && (
                  <td style={{ padding:"13px 10px 13px 14px", borderBottom, verticalAlign:"top" }}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${kw.term}`}
                      checked={!!isSelected}
                      onChange={() => onToggleSelect?.(kw.term)}
                      style={{ accentColor: brandColor, cursor: "pointer", marginTop: 2 }}
                    />
                  </td>
                )}
                <td style={{ padding:"13px 14px", borderBottom, maxWidth:"320px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom: rowBadges.length ? 6 : 0 }}>
                    <span style={{ fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:500, color:"var(--text-primary)" }}>{kw.term}</span>
                    {rowBadges.map((b, j) => (
                      <span key={`${b.strategyId}-${j}`}
                        title={`Matches strategy ${b.acronym} (fit: ${Math.round(b.score * 100)}%)`}
                        style={{
                          display:"inline-flex", alignItems:"center",
                          fontFamily:"var(--font-mono)", fontSize:9, fontWeight:600, letterSpacing:"0.08em",
                          color: "var(--brand)",
                          background: `rgba(var(--brand-rgb), ${0.08 + b.score * 0.12})`,
                          border:"1px solid rgba(var(--brand-rgb), 0.30)",
                          padding:"2px 6px", borderRadius:5,
                        }}>{b.acronym}</span>
                    ))}
                  </div>
                </td>
                {columns.map(c => (
                  <td key={c.header} style={{ padding:"13px 14px", borderBottom }}>
                    {c.render(kw)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function KeywordsPage() {
  const { domain, loading: domainLoading } = useDomain();
  const [brandColor, setBrandColor] = useState(BRAND_DEFAULT);
  const [activeTab,  setActiveTab]  = useState<"planner"|"rankings"|"ideas"|"competitors">("planner");
  const [plan,        setPlan]        = useState<BucketResult | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError,   setPlanError]   = useState<string | null>(null);
  const [openBucket,  setOpenBucket]  = useState<Bucket | null>(null);
  const [watchBusy,   setWatchBusy]   = useState<string | null>(null);

  // Rankings
  const [rankings,    setRankings]    = useState<LiveKw[]>([]);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankError,   setRankError]   = useState<string|null>(null);
  const [rankFilter,  setRankFilter]  = useState("");

  // Ideas
  const [ideaSeed,    setIdeaSeed]    = useState("");
  const [ideas,       setIdeas]       = useState<IdeaKw[]>([]);
  const [ideaLoading, setIdeaLoading] = useState(false);
  const [ideaError,   setIdeaError]   = useState<string|null>(null);
  const [ideaMode,    setIdeaMode]    = useState<"seed"|"site">("site");

  // Competitor keywords
  const [compDomain,  setCompDomain]  = useState("");
  const [gapResult,   setGapResult]   = useState<GapResult | null>(null);
  const [gapView,     setGapView]     = useState<"gaps" | "covered">("gaps");
  const [compKwLoading, setCompKwLoading] = useState(false);
  const [compKwError,   setCompKwError]   = useState<string|null>(null);
  const [saveState,     setSaveState]     = useState<"idle"|"saving"|"saved"|"error">("idle");
  const [saveMessage,   setSaveMessage]   = useState<string|null>(null);

  // ── Strategy linkage (shared across tabs) ───────────────────────────────
  const [strategies,   setStrategies]   = useState<Strategy[]>([]);
  const [selectedKws,  setSelectedKws]  = useState<Set<string>>(new Set());
  const [kwBadges,     setKwBadges]     = useState<Record<string, RecommendedKeyword["matches"]>>({});
  const [attachBusy,   setAttachBusy]   = useState(false);
  const [attachTarget, setAttachTarget] = useState<string>("");   // strategy id the user picks in the bar
  const [attachMsg,    setAttachMsg]    = useState<string|null>(null);

  useEffect(() => {
    const b = localStorage.getItem("aiml-brand") || localStorage.getItem("rvivme-brand");
    if (b) setBrandColor(b);
    (async () => {
      try {
        const list = await listStrategies();
        // Only show active-status rows in the picker; user can archive stale ones.
        const pickable = list.filter(s => s.status === "active");
        setStrategies(pickable);
        // Default the picker to the active strategy, falling back to the first.
        const def = pickable.find(s => s.is_active) ?? pickable[0];
        if (def) setAttachTarget(def.id);
      } catch (e) {
        console.warn("[keywords] listStrategies failed", e);
      }
    })();
  }, []);

  // Compute acronym badges whenever the visible keyword pool changes.
  // We combine terms from all three tabs — some users switch between them,
  // and keeping a single badge map keeps the experience coherent.
  useEffect(() => {
    const pool: string[] = Array.from(new Set([
      ...rankings.map(k => k.term),
      ...ideas.map(k => k.term),
      // Themes, not page titles: a term appearing across several of their
      // pages is a subject they have committed to, which is what a strategy
      // can actually be built around.
      ...(gapResult?.themes ?? []).map(t => t.term),
    ]));
    if (!pool.length || !strategies.length) return;

    // Skip terms we already have badges for (AI calls cost tokens).
    const toFetch = pool.filter(t => !(t.toLowerCase() in kwBadges));
    if (!toFetch.length) return;

    let cancelled = false;
    (async () => {
      try {
        const recs = await recommendKeywordsForStrategies({
          keywords:   toFetch,
          strategies,
        });
        if (cancelled) return;
        setKwBadges(prev => {
          const next = { ...prev };
          recs.forEach(r => { next[r.keyword.toLowerCase()] = r.matches; });
          return next;
        });
      } catch (e) {
        console.warn("[keywords] recommend failed", e);
      }
    })();
    return () => { cancelled = true; };
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [rankings, ideas, gapResult, strategies]);

  // Selection helpers.
  function toggleKw(term: string) {
    setSelectedKws(prev => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term); else next.add(term);
      return next;
    });
  }
  function toggleAllKw(terms: string[], select: boolean) {
    setSelectedKws(prev => {
      const next = new Set(prev);
      if (select) terms.forEach(t => next.add(t));
      else        terms.forEach(t => next.delete(t));
      return next;
    });
  }
  function clearSelection() { setSelectedKws(new Set()); setAttachMsg(null); }

  // Resolve a term back to its richest data row across all three pools so the
  // strategy link row carries volume/difficulty/intent/baseline_pos.
  function enrichTerm(term: string): KeywordAttach {
    const fromRank = rankings.find(k => k.term === term);
    if (fromRank) return {
      keyword: term, volume: fromRank.volume, difficulty: fromRank.difficulty,
      intent: fromRank.intent, source: "ranking", baseline_pos: fromRank.position,
    };
    const fromIdea = ideas.find(k => k.term === term);
    if (fromIdea) return {
      keyword: term, volume: fromIdea.volume, difficulty: fromIdea.difficulty,
      intent: fromIdea.intent, source: "ai",
    };
    // Gap themes carry no volume, difficulty or intent, and we pass null
    // rather than a placeholder. A 0 here would travel into the strategy and
    // be read back later as a measured figure.
    const fromGap = (gapResult?.themes ?? []).find(t => t.term === term);
    if (fromGap) return {
      keyword: term, volume: null, difficulty: null, intent: null, source: "gap",
    };
    return { keyword: term, source: "manual" };
  }

  async function attachSelection() {
    if (!attachTarget || selectedKws.size === 0) return;
    setAttachBusy(true); setAttachMsg(null);
    try {
      const rows = Array.from(selectedKws).map(enrichTerm);
      const n = await attachKeywordsToStrategy(attachTarget, rows);
      const strat = strategies.find(s => s.id === attachTarget);
      setAttachMsg(`Saved ${n} keyword${n === 1 ? "" : "s"} to ${strat?.acronym ?? "STR"} · ${strat?.title ?? "strategy"}.`);
      clearSelection();
    } catch (e: any) {
      setAttachMsg(e?.message ?? "Could not save to strategy.");
    } finally {
      setAttachBusy(false);
    }
  }

  // Load rankings
  const loadRankings = useCallback(async () => {
    if (!domain || domainLoading) return;
    setRankLoading(true); setRankError(null);
    try {
      // Search Console, not DataForSEO. These are the queries the site
      // genuinely received impressions for — exact, not modelled — and the
      // route has existed since the DFS endpoints were switched off. The page
      // simply never stopped calling the dead one.
      const res  = await fetch("/api/keywords/ranked?limit=50");
      const data = await res.json();
      if (!data.success) {
        throw new Error(
          data.reason === "not_configured"
            ? "Connect Search Console under Settings → Integrations to see the queries you rank for."
            : data.message ?? "Couldn't load your rankings.",
        );
      }
      setRankings(data.keywords ?? []);
    } catch (e: any) { setRankError(e.message); }
    finally { setRankLoading(false); }
  }, [domain, domainLoading]);

  useEffect(() => { if (activeTab === "rankings") loadRankings(); }, [activeTab, loadRankings]);

  const loadPlan = useCallback(async () => {
    setPlanLoading(true); setPlanError(null);
    try {
      const res  = await fetch("/api/keywords/buckets");
      const data = await res.json();
      if (!data.success) {
        throw new Error(
          data.reason === "not_configured"
            ? "Connect Search Console under Settings → Integrations. Every bucket here is built from queries you actually appear for."
            : data.message ?? "Couldn't build the plan.",
        );
      }
      setPlan(data as BucketResult);
    } catch (e: any) { setPlanError(e.message); }
    finally { setPlanLoading(false); }
  }, []);

  useEffect(() => { if (activeTab === "planner") loadPlan(); }, [activeTab, loadPlan]);

  /** Add or remove one term. Reloads so its bucket reflects the change. */
  async function toggleWatch(term: string, currentlyWatched: boolean) {
    setWatchBusy(term);
    try {
      const res = currentlyWatched
        ? await fetch(`/api/keywords/watchlist?keyword=${encodeURIComponent(term)}`, { method: "DELETE" })
        : await fetch("/api/keywords/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keyword: term, source: "manual" }),
          });
      const data = await res.json();
      if (!data.success) { setPlanError(data.message ?? "Couldn't update the watchlist."); return; }
      // Optimistic flip, so the row responds immediately; the next load
      // reconciles it against what the server actually stored.
      setPlan(p => p && ({
        ...p,
        keywords: p.keywords.map(k => k.term === term ? { ...k, watched: !currentlyWatched } : k),
      }));
    } catch (e: any) {
      setPlanError(e?.message ?? "Couldn't update the watchlist.");
    } finally { setWatchBusy(null); }
  }

  // Load ideas
  async function loadIdeas() {
    setIdeaLoading(true); setIdeaError(null);
    try {
      const body = ideaMode === "site"
        ? { mode: "site", domain }
        : { mode: "seed", seed: ideaSeed.split(",").map(s => s.trim()).filter(Boolean) };
      // Google Trends related queries — "rising" is the closest free signal to
      // an opportunity keyword. Same story as rankings: the free route was
      // built and the page kept calling the retired one.
      const res  = await fetch("/api/keywords/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message ?? "Couldn't load keyword ideas.");
      setIdeas(data.keywords ?? []);
    } catch (e: any) { setIdeaError(e.message); }
    finally { setIdeaLoading(false); }
  }

  // What they publish that you have no search presence for.
  //
  // Not "keywords they rank for" — that needs a SERP corpus we don't have,
  // and the endpoint this used to call has been returning "unavailable" for
  // some time while this page carried on calling it. Their sitemap and page
  // titles on one side, your real Search Console queries on the other.
  async function loadCompetitorKws() {
    if (!compDomain.trim()) return;
    setCompKwLoading(true); setCompKwError(null); setGapResult(null);
    setSaveState("idle"); setSaveMessage(null);
    try {
      const cd  = compDomain.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
      const res = await fetch("/api/competitors/content-gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: cd }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message ?? "Couldn't analyse that competitor.");
      setGapResult(data as GapResult);
      setGapView("gaps");
    } catch (e: any) { setCompKwError(e.message); }
    finally { setCompKwLoading(false); }
  }

  // Save the themes — terms recurring across several of their gap pages.
  // Individual page titles are the evidence; the recurring term is the thing
  // you would actually brief a writer on.
  async function saveCompetitorKws() {
    const cd     = compDomain.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
    const themes = gapResult?.themes ?? [];
    if (!cd || themes.length === 0) return;

    setSaveState("saving"); setSaveMessage(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in — can't save.");

      const rows = themes.map(t => ({
        user_id:           user.id,
        keyword:           t.term,
        source:            "gap" as const,
        competitor_domain: cd,
        // Null, not zero. We did not measure volume, difficulty or CPC, and a
        // 0 stored here becomes indistinguishable from a measurement later.
        volume:            null,
        difficulty:        null,
        cpc:               null,
        intent:            null,
        notes:             `Appears on ${t.pages} of ${cd}'s pages that you have no search presence for.`,
      }));

      const { data, error: upErr } = await supabase
        .from("tracked_keywords")
        .upsert(rows as never, { onConflict: "user_id,keyword,competitor_domain" })
        .select("id");

      if (upErr) throw new Error(upErr.message);
      // PostgREST calls a zero-row write a success. Checking the returned rows
      // is the only way to know it landed.
      if (!data || data.length === 0) throw new Error("Nothing saved — check your profile is set up in Settings.");

      setSaveState("saved");
      setSaveMessage(`Saved ${data.length} theme${data.length === 1 ? "" : "s"} to your tracking list.`);
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (e: any) {
      setSaveState("error");
      setSaveMessage(e.message ?? "Failed to save.");
    }
  }

  // Export the pages themselves, so any row can be opened and checked.
  function exportCompetitorKws() {
    const rows = gapView === "gaps" ? gapResult?.gaps : gapResult?.covered;
    if (!rows || rows.length === 0) return;

    const esc = (v: unknown) => {
      const str = String(v ?? "");
      // RFC 4180 — wrap in quotes and double any embedded quotes.
      return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const header = ["PageTitle", "URL", "Verdict", "TopicTerms", "YourClosestQuery", "Overlap"];
    const csv = [
      header.join(","),
      ...rows.map(r => [
        r.title, r.url, r.verdict, r.terms.join(" "),
        r.matchedQuery ?? "", r.overlap,
      ].map(esc).join(",")),
    ].join("\n");

    const blob  = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url   = URL.createObjectURL(blob);
    const link  = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `content-gap-${gapResult?.competitor ?? "competitor"}-${gapView}-${stamp}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }


  const filtered = rankings.filter(k =>
    !rankFilter || k.term.toLowerCase().includes(rankFilter.toLowerCase())
  );

  const avgPos  = rankings.length ? (rankings.reduce((s,k) => s + k.position, 0) / rankings.length).toFixed(1) : "—";
  const top10   = rankings.filter(k => k.position <= 10).length;
  const snippets = rankings.filter(k => k.featured).length;

  return (
    <div className="aiml-page-pad" style={{ background:"var(--bg)", minHeight:"100vh", padding:"32px 24px 80px", maxWidth:"1280px", margin:"0 auto" }}>

      {/* Header */}
      <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.7, ease:EASE }}
        style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:"28px", flexWrap:"wrap", gap:"12px" }}
      >
        <div>
          <h1 style={{ fontFamily:"var(--font-display)", fontSize:"clamp(1.8rem,3.5vw,2.8rem)", letterSpacing:"-0.04em", lineHeight:1, fontWeight:400, color:"var(--text-primary)", marginBottom:"6px" }}>
            Keyword Intelligence
          </h1>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:"11px", color:"var(--text-tertiary)", letterSpacing:"0.08em" }}>
            {domainLoading ? "Loading domain…" : domain}
          </div>
        </div>
        <button onClick={loadRankings} disabled={rankLoading} style={{ display:"flex", alignItems:"center", gap:"6px", fontFamily:"var(--font-mono)", fontSize:"11px", color:"var(--text-secondary)", background:"transparent", border:"1px solid var(--border)", borderRadius:"8px", padding:"9px 14px", cursor:"pointer", letterSpacing:"0.06em" }}>
          <RefreshCw size={11} style={{ animation: rankLoading ? "spin 0.7s linear infinite" : "none" }} /> REFRESH
        </button>
      </motion.div>

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"12px", marginBottom:"24px" }}>
        <KpiCard label="Keywords tracked"  value={rankings.length} color={brandColor} />
        <KpiCard label="Avg position"      value={avgPos}          color="var(--text-primary)" />
        <KpiCard label="Top 10"            value={top10}           color="var(--signal-green)" />
        <KpiCard label="Featured snippets" value={snippets}        color="var(--signal-amber)" />
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:"4px", borderBottom:"1px solid var(--border)", marginBottom:"20px" }}>
        {([
          ["planner",     "Planner"],
          ["rankings",    "Rankings"],
          ["ideas",       "Keyword Ideas"],
          ["competitors", "Content Gap"],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:500,
            color: activeTab === id ? "var(--text-primary)" : "var(--text-secondary)",
            background:"transparent", border:"none",
            borderBottom:`2px solid ${activeTab === id ? brandColor : "transparent"}`,
            padding:"10px 16px", cursor:"pointer", transition:"color 0.16s", marginBottom:"-1px",
          }}>
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ── PLANNER ──────────────────────────────────────────────────────── */}
        {activeTab === "planner" && (
          <motion.div key="planner" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.2 }}>

            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"12px", padding:"18px 20px", marginBottom:"18px" }}>
              <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:600, color:"var(--text-primary)", marginBottom:"5px" }}>
                Every keyword, sorted by what you can do about it
              </div>
              <div style={{ fontFamily:"var(--font-body)", fontSize:"12.5px", color:"var(--text-secondary)", lineHeight:1.55, maxWidth:"680px" }}>
                Built from the queries Search Console says you appeared for in the last 28 days, plus anything on your
                watchlist. Nothing here is estimated — no search volume, no difficulty score, no guess at where a
                competitor ranks. Every row states the numbers it was decided from.
              </div>
            </div>

            {planError && (
              <div style={{ display:"flex", alignItems:"flex-start", gap:"8px", padding:"12px 16px", background:"rgba(255,171,0,0.08)", border:"1px solid rgba(255,171,0,0.25)", borderRadius:"10px", marginBottom:"16px" }}>
                <AlertTriangle size={14} color="var(--signal-amber)" style={{ flexShrink:0, marginTop:"2px" }} />
                <span style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--signal-amber)", lineHeight:1.5 }}>{planError}</span>
              </div>
            )}

            {planLoading && (
              <div style={{ padding:"48px", display:"flex", justifyContent:"center" }}>
                <div style={{ width:"20px", height:"20px", border:"2px solid var(--border)", borderTopColor:brandColor, borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
              </div>
            )}

            {!planLoading && plan && (
              <>
                {/* What it was built from. A finding whose basis is invisible
                    gets read as more certain than it is. */}
                <div style={{ display:"flex", flexWrap:"wrap", gap:"20px", padding:"12px 16px", background:"var(--muted)", borderRadius:"8px", marginBottom:"18px" }}>
                  <Basis label="Queries analysed" value={plan.basis.queries.toLocaleString()} />
                  <Basis label="On your watchlist" value={plan.basis.watched.toLocaleString()} />
                  <Basis label="From the opportunity engine" value={plan.basis.fromOpportunity.toLocaleString()} />
                  <Basis label="Period" value={plan.basis.period} />
                </div>

                {plan.scale.isEarlyStage && (
                  <div style={{ fontFamily:"var(--font-body)", fontSize:"12.5px", color:"var(--text-tertiary)", marginBottom:"18px", lineHeight:1.5, maxWidth:"680px" }}>
                    This is built on {plan.scale.totalImpressions.toLocaleString()} impressions across {plan.scale.queryCount.toLocaleString()} queries,
                    which is a small sample. The buckets are still right about direction, but treat the ordering inside
                    them as provisional until there is more data behind it.
                  </div>
                )}

                {/* One section per bucket, in the order the library defines. */}
                {(Object.keys(plan.meta) as Bucket[])
                  .filter(b => plan.counts[b] > 0)
                  .sort((a, b) => plan.meta[a].order - plan.meta[b].order)
                  .map(bucket => {
                    const meta = plan.meta[bucket];
                    const rows = plan.keywords.filter(k => k.bucket === bucket);
                    const open = openBucket === bucket;
                    return (
                      <div key={bucket} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"12px", marginBottom:"12px", overflow:"hidden" }}>
                        <button onClick={() => setOpenBucket(open ? null : bucket)}
                          style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"12px", padding:"15px 18px", background:"transparent", border:"none", cursor:"pointer", textAlign:"left" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:"10px", minWidth:0 }}>
                            <span style={{ fontFamily:"var(--font-body)", fontSize:"14px", fontWeight:600, color:"var(--text-primary)" }}>{meta.label}</span>
                            <span style={{ fontFamily:"var(--font-mono)", fontSize:"10px", color:brandColor, background:`rgba(var(--brand-rgb),0.08)`, border:`1px solid rgba(var(--brand-rgb),0.20)`, padding:"2px 8px", borderRadius:"100px" }}>
                              {plan.counts[bucket]}
                            </span>
                          </div>
                          <ChevronDown size={14} color="var(--text-tertiary)" style={{ transform: open ? "rotate(180deg)" : "none", transition:"transform 0.16s", flexShrink:0 }} />
                        </button>

                        <div style={{ padding:"0 18px 14px" }}>
                          <div style={{ fontFamily:"var(--font-body)", fontSize:"12.5px", color:"var(--text-secondary)", lineHeight:1.55, maxWidth:"720px" }}>
                            {meta.meaning}
                          </div>
                          <div style={{ fontFamily:"var(--font-body)", fontSize:"12.5px", color:brandColor, lineHeight:1.55, marginTop:"6px", maxWidth:"720px" }}>
                            {meta.action}
                          </div>
                        </div>

                        {open && (
                          <div style={{ borderTop:"1px solid var(--border)" }}>
                            {rows.map((k, i) => (
                              <div key={k.term} style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"14px", padding:"13px 18px", borderBottom: i < rows.length-1 ? "1px solid var(--border)" : "none", flexWrap:"wrap" }}>
                                <div style={{ flex:"1 1 340px", minWidth:0 }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:"7px", flexWrap:"wrap" }}>
                                    <span style={{ fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:600, color:"var(--text-primary)" }}>{k.term}</span>
                                    {k.watched && (
                                      <span style={{ fontFamily:"var(--font-mono)", fontSize:"8px", letterSpacing:"0.08em", color:brandColor, background:`rgba(var(--brand-rgb),0.08)`, border:`1px solid rgba(var(--brand-rgb),0.20)`, padding:"1px 5px", borderRadius:"100px" }}>WATCHING</span>
                                    )}
                                    {k.confidence === "low" && (
                                      <span title="The opportunity engine passed this over, usually for too few impressions."
                                        style={{ fontFamily:"var(--font-mono)", fontSize:"8px", letterSpacing:"0.08em", color:"var(--text-tertiary)", border:"1px solid var(--border)", padding:"1px 5px", borderRadius:"100px" }}>LOW CONFIDENCE</span>
                                    )}
                                  </div>
                                  <div style={{ fontFamily:"var(--font-body)", fontSize:"12px", color:"var(--text-secondary)", lineHeight:1.5, marginTop:"3px" }}>
                                    {k.why}
                                  </div>
                                </div>

                                <div style={{ display:"flex", alignItems:"center", gap:"18px", flexShrink:0 }}>
                                  {/* "—" throughout for a term Search Console
                                      never mentioned. "No impressions recorded"
                                      and "zero people saw you" are the same
                                      number and different claims. */}
                                  <Stat label="POS"  value={k.position    == null ? "—" : k.position.toFixed(1)} />
                                  <Stat label="IMPR" value={k.impressions == null ? "—" : k.impressions.toLocaleString()} />
                                  <Stat label="CLICKS" value={k.clicks    == null ? "—" : String(k.clicks)} />
                                  <button onClick={() => toggleWatch(k.term, k.watched)} disabled={watchBusy === k.term}
                                    title={k.watched ? "Remove from watchlist" : "Add to watchlist"}
                                    style={{
                                      width:"28px", height:"28px", display:"flex", alignItems:"center", justifyContent:"center",
                                      background: k.watched ? `rgba(var(--brand-rgb),0.10)` : "transparent",
                                      border:`1px solid ${k.watched ? `rgba(var(--brand-rgb),0.25)` : "var(--border)"}`,
                                      borderRadius:"6px", cursor: watchBusy === k.term ? "wait" : "pointer",
                                      color: k.watched ? brandColor : "var(--text-tertiary)", flexShrink:0,
                                    }}>
                                    {k.watched ? <Check size={12} /> : <Target size={12} />}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                <div style={{ fontFamily:"var(--font-body)", fontSize:"12px", color:"var(--text-tertiary)", marginTop:"16px", lineHeight:1.55, maxWidth:"720px" }}>
                  No search volume, difficulty score or competitor ranking appears here because none of them can be
                  measured from Search Console. They need a licensed dataset, and we would rather leave a column out
                  than fill it with a number we can&rsquo;t stand behind.
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* ── RANKINGS ─────────────────────────────────────────────────────── */}
        {activeTab === "rankings" && (
          <motion.div key="rankings" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.2 }}>
            {rankError && (
              <div style={{ display:"flex", alignItems:"center", gap:"8px", padding:"12px 16px", background:"rgba(255,171,0,0.08)", border:"1px solid rgba(255,171,0,0.25)", borderRadius:"10px", marginBottom:"16px" }}>
                <AlertTriangle size={14} color="var(--signal-amber)" />
                <span style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--signal-amber)" }}>{rankError}</span>
              </div>
            )}
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"12px", overflow:"hidden" }}>
              <div style={{ padding:"14px 18px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:"10px" }}>
                <Search size={13} color="var(--text-tertiary)" />
                <input value={rankFilter} onChange={e => setRankFilter(e.target.value)} placeholder="Filter keywords…"
                  style={{ flex:1, background:"transparent", border:"none", outline:"none", fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-primary)" }}
                />
              </div>
              {rankLoading
                ? <div style={{ padding:"48px", display:"flex", justifyContent:"center" }}>
                    <div style={{ width:"20px", height:"20px", border:`2px solid var(--border)`, borderTopColor:brandColor, borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
                  </div>
                : <KwTable
                    keywords={filtered}
                    columns={[
                      { header: "Volume",     render: (kw) => numOrDash(kw.volume) },
                      { header: "Position",   render: (kw) => kw.position },
                      { header: "Difficulty", render: (kw) => kw.difficulty != null ? <DiffBar d={kw.difficulty} /> : numOrDash(null) },
                      { header: "CPC",        render: (kw) => numOrDash(kw.cpc, (n) => `£${n.toFixed(2)}`) },
                      { header: "Intent",     render: (kw) => kw.intent
                          ? <span style={{ color: intentColor(kw.intent), fontFamily:"var(--font-mono)", fontSize:"11px", letterSpacing:"0.06em", textTransform:"uppercase" }}>{kw.intent}</span>
                          : numOrDash(null) },
                    ]}
                    emptyMsg={
                      `No ranked keywords found for ${domain} in the UK SERP. ` +
                      "This usually means the site is too new to have been indexed by Google " +
                      "or hasn't earned any organic rankings yet. Try the Keyword Ideas tab to plan ahead."
                    }
                    brandColor={brandColor}
                    selectable={strategies.length > 0}
                    selected={selectedKws}
                    onToggleSelect={toggleKw}
                    onToggleAll={toggleAllKw}
                    badges={kwBadges}
                  />
              }
            </div>
          </motion.div>
        )}

        {/* ── IDEAS ────────────────────────────────────────────────────────── */}
        {activeTab === "ideas" && (
          <motion.div key="ideas" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.2 }}>
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"12px", padding:"20px", marginBottom:"20px" }}>
              <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:600, color:"var(--text-primary)", marginBottom:"14px" }}>
                Keyword Ideas — Google Trends + Search Console
              </div>
              <div style={{ display:"flex", gap:"8px", marginBottom:"14px" }}>
                {(["site","seed"] as const).map(m => (
                  <button key={m} onClick={() => setIdeaMode(m)} style={{
                    fontFamily:"var(--font-mono)", fontSize:"10px", letterSpacing:"0.08em",
                    padding:"6px 14px", borderRadius:"100px", cursor:"pointer",
                    border:`1px solid ${ideaMode === m ? brandColor : "var(--border)"}`,
                    background: ideaMode === m ? `rgba(var(--brand-rgb),0.08)` : "transparent",
                    color: ideaMode === m ? brandColor : "var(--text-secondary)",
                  }}>
                    {m === "site" ? "FROM WEBSITE" : "FROM KEYWORDS"}
                  </button>
                ))}
              </div>
              {ideaMode === "seed" && (
                <input value={ideaSeed} onChange={e => setIdeaSeed(e.target.value)} placeholder="seo tools, keyword research, content strategy"
                  style={{ width:"100%", padding:"10px 13px", fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-primary)", background:"var(--card)", border:"1px solid var(--border)", borderRadius:"8px", outline:"none", boxSizing:"border-box" as const, marginBottom:"14px" }}
                  onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
                  onBlur={e =>  e.currentTarget.style.borderColor = "var(--border)"}
                />
              )}
              {ideaMode === "site" && (
                <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-secondary)", marginBottom:"14px" }}>
                  Ideas based on: <strong style={{ color:"var(--text-primary)" }}>{domain}</strong>
                </div>
              )}
              <button onClick={loadIdeas} disabled={ideaLoading} style={{
                display:"flex", alignItems:"center", gap:"7px",
                fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:500,
                color:"#fff", background: ideaLoading ? "var(--muted)" : brandColor,
                border:"none", borderRadius:"8px", padding:"10px 20px", cursor:"pointer",
              }}>
                {ideaLoading ? <div style={{ width:"12px", height:"12px", border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} /> : <Lightbulb size={13} />}
                {ideaLoading ? "Fetching…" : "Get keyword ideas"}
              </button>
            </div>
            {ideaError && (
              <div style={{ display:"flex", alignItems:"center", gap:"8px", padding:"12px 16px", background:"rgba(255,171,0,0.08)", border:"1px solid rgba(255,171,0,0.25)", borderRadius:"10px", marginBottom:"16px" }}>
                <AlertTriangle size={14} color="var(--signal-amber)" />
                <span style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--signal-amber)" }}>{ideaError}</span>
              </div>
            )}
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"12px", overflow:"hidden" }}>
              {ideaLoading
                ? <div style={{ padding:"48px", display:"flex", justifyContent:"center" }}>
                    <div style={{ width:"20px", height:"20px", border:`2px solid var(--border)`, borderTopColor:brandColor, borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
                  </div>
                : <KwTable
                    keywords={ideas}
                    columns={[
                      { header: "Volume",      render: (kw) => numOrDash(kw.volume) },
                      { header: "Difficulty",  render: (kw) => kw.difficulty != null ? <DiffBar d={kw.difficulty} /> : numOrDash(null) },
                      { header: "CPC",         render: (kw) => numOrDash(kw.cpc, (n) => `£${n.toFixed(2)}`) },
                      { header: "Competition", render: (kw) => <span style={{ fontSize:"12px", color:"var(--text-secondary)" }}>{kw.competitionLevel || "—"}</span> },
                      { header: "Intent",      render: (kw) => kw.intent
                          ? <span style={{ color: intentColor(kw.intent), fontFamily:"var(--font-mono)", fontSize:"11px", letterSpacing:"0.06em", textTransform:"uppercase" }}>{kw.intent}</span>
                          : numOrDash(null) },
                      { header: "Trend",       render: (kw) =>
                          <span style={{ display:"inline-flex", alignItems:"center", gap:"6px" }}>
                            <TrendIcon d={kw.trending} />
                            <span style={{ fontSize:"12px", color:"var(--text-secondary)" }}>{kw.trendScore}</span>
                          </span> },
                    ]}
                    emptyMsg='Click "Get keyword ideas" to discover opportunities.'
                    brandColor={brandColor}
                    selectable={strategies.length > 0}
                    selected={selectedKws}
                    onToggleSelect={toggleKw}
                    onToggleAll={toggleAllKw}
                    badges={kwBadges}
                  />
              }
            </div>
          </motion.div>
        )}

        {/* ── COMPETITOR KEYWORDS ──────────────────────────────────────────── */}
        {activeTab === "competitors" && (
          <motion.div key="competitors" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.2 }}>
            {/* Input */}
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"12px", padding:"20px", marginBottom:"20px" }}>
              <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:600, color:"var(--text-primary)", marginBottom:"6px" }}>
                Content gap
              </div>
              <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-secondary)", marginBottom:"14px", maxWidth:"640px", lineHeight:1.55 }}>
                We read the pages a competitor publishes, and compare them against the queries your site
                actually received impressions for. Anything they cover and you have no presence for is a gap.
                Both halves are measured — theirs from their live sitemap, yours from Search Console.
              </div>
              <div style={{ display:"flex", gap:"10px", flexWrap:"wrap" }}>
                <input value={compDomain} onChange={e => setCompDomain(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") loadCompetitorKws(); }}
                  placeholder="competitor.co.uk"
                  style={{ flex:"1 1 240px", padding:"10px 13px", fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-primary)", background:"var(--card)", border:"1px solid var(--border)", borderRadius:"8px", outline:"none", boxSizing:"border-box" as const }}
                  onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
                  onBlur={e =>  e.currentTarget.style.borderColor = "var(--border)"}
                />
                <button onClick={loadCompetitorKws} disabled={compKwLoading || !compDomain.trim()} style={{
                  display:"flex", alignItems:"center", gap:"7px",
                  fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:500,
                  color:"#fff", background: compKwLoading ? "var(--muted)" : brandColor,
                  border:"none", borderRadius:"8px", padding:"10px 20px", cursor:"pointer",
                }}>
                  {compKwLoading ? <div style={{ width:"12px", height:"12px", border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} /> : <ArrowRight size={13} />}
                  {compKwLoading ? "Reading their site…" : "Analyse"}
                </button>
              </div>
            </div>

            {compKwError && (
              <div style={{ display:"flex", alignItems:"flex-start", gap:"8px", padding:"12px 16px", background:"rgba(255,171,0,0.08)", border:"1px solid rgba(255,171,0,0.25)", borderRadius:"10px", marginBottom:"16px" }}>
                <AlertTriangle size={14} color="var(--signal-amber)" style={{ flexShrink:0, marginTop:"2px" }} />
                <span style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--signal-amber)", lineHeight:1.5 }}>{compKwError}</span>
              </div>
            )}

            {gapResult && (
              <>
                {/* What this was actually built from. A sample reported as a
                    total is a lie with a plausible shape. */}
                <div style={{ display:"flex", flexWrap:"wrap", gap:"18px", padding:"12px 16px", background:"var(--muted)", borderRadius:"8px", marginBottom:"16px" }}>
                  <Basis label="Their pages read"  value={`${gapResult.sample.fetched} of ${gapResult.sample.totalInSitemap.toLocaleString()}`} />
                  <Basis label="Your queries"      value={`${gapResult.basis.queries.toLocaleString()} · ${gapResult.basis.period}`} />
                  <Basis label="No presence for"   value={`${gapResult.gaps.length}`} accent={gapResult.gaps.length > 0 ? "var(--signal-amber)" : undefined} />
                  <Basis label="Already covered"   value={`${gapResult.covered.length}`} />
                </div>

                {gapResult.sample.truncated && (
                  <div style={{ fontFamily:"var(--font-body)", fontSize:"12px", color:"var(--text-tertiary)", marginBottom:"16px" }}>
                    They publish {gapResult.sample.totalInSitemap.toLocaleString()} pages; we read the first {gapResult.sample.fetched}.
                    Treat the counts above as a sample of their site, not a total.
                  </div>
                )}

                {/* Themes — the recurring subjects, which is what you brief on */}
                {gapResult.themes.length > 0 && (
                  <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"12px", padding:"18px 20px", marginBottom:"20px" }}>
                    <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:600, color:"var(--text-primary)", marginBottom:"4px" }}>
                      Subjects they keep coming back to
                    </div>
                    <div style={{ fontFamily:"var(--font-body)", fontSize:"12.5px", color:"var(--text-secondary)", marginBottom:"12px", lineHeight:1.5 }}>
                      Terms appearing across several of the pages you have no presence for. One page is a topic;
                      several is a commitment. These are what a content brief should start from — note that we
                      have no search volume for them, only that {gapResult.competitor} publishes on them and you don&rsquo;t.
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:"7px" }}>
                      {gapResult.themes.map(t => {
                        const on = selectedKws.has(t.term);
                        return (
                          <button key={t.term} onClick={() => toggleKw(t.term)}
                            title={strategies.length > 0 ? "Select to attach to a strategy" : undefined}
                            style={{
                              display:"flex", alignItems:"center", gap:"6px",
                              fontFamily:"var(--font-body)", fontSize:"12.5px",
                              color: on ? "#fff" : "var(--text-primary)",
                              background: on ? brandColor : "var(--card)",
                              border:`1px solid ${on ? brandColor : "var(--border)"}`,
                              borderRadius:"100px", padding:"5px 12px", cursor:"pointer", transition:"all 0.15s",
                            }}>
                            {t.term}
                            <span style={{ fontFamily:"var(--font-mono)", fontSize:"9px", opacity:0.7 }}>{t.pages}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* View switch + actions */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:"12px", marginBottom:"16px", flexWrap:"wrap" }}>
                  <div style={{ display:"flex", gap:"12px" }}>
                    <button onClick={() => setGapView("gaps")} style={{
                      display:"flex", alignItems:"center", gap:"7px",
                      fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:500,
                      color: gapView === "gaps" ? "#fff" : "var(--text-secondary)",
                      background: gapView === "gaps" ? brandColor : "transparent",
                      border:`1px solid ${gapView === "gaps" ? brandColor : "var(--border)"}`,
                      borderRadius:"8px", padding:"9px 18px", cursor:"pointer", transition:"all 0.16s",
                    }}>
                      <Target size={13} /> No presence
                      <span style={{ fontFamily:"var(--font-mono)", fontSize:"10px", background:"rgba(255,255,255,0.2)", padding:"1px 6px", borderRadius:"100px" }}>{gapResult.gaps.length}</span>
                    </button>
                    <button onClick={() => setGapView("covered")} style={{
                      display:"flex", alignItems:"center", gap:"7px",
                      fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:500,
                      color: gapView === "covered" ? "#fff" : "var(--text-secondary)",
                      background: gapView === "covered" ? "var(--signal-green)" : "transparent",
                      border:`1px solid ${gapView === "covered" ? "var(--signal-green)" : "var(--border)"}`,
                      borderRadius:"8px", padding:"9px 18px", cursor:"pointer", transition:"all 0.16s",
                    }}>
                      <Check size={13} /> Already covered
                      <span style={{ fontFamily:"var(--font-mono)", fontSize:"10px", background:"rgba(255,255,255,0.2)", padding:"1px 6px", borderRadius:"100px" }}>{gapResult.covered.length}</span>
                    </button>
                  </div>

                  <div style={{ display:"flex", gap:"8px" }}>
                    <button onClick={saveCompetitorKws}
                      disabled={saveState === "saving" || gapResult.themes.length === 0}
                      style={{
                        display:"flex", alignItems:"center", gap:"6px",
                        fontFamily:"var(--font-mono)", fontSize:"11px", letterSpacing:"0.08em",
                        color: saveState === "saved" ? "var(--signal-green)" : "var(--text-secondary)",
                        background:"transparent",
                        border:`1px solid ${saveState === "saved" ? "var(--signal-green)" : "var(--border)"}`,
                        borderRadius:"8px", padding:"8px 14px", cursor:"pointer", transition:"all 0.16s",
                      }}
                      title="Save the recurring subjects to your tracked keyword list"
                    >
                      {saveState === "saving"
                        ? <div style={{ width:"11px", height:"11px", border:"1.5px solid var(--border)", borderTopColor:"var(--text-primary)", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
                        : saveState === "saved" ? <Check size={11} /> : <Save size={11} />}
                      {saveState === "saving" ? "SAVING" : saveState === "saved" ? "SAVED" : "SAVE THEMES"}
                    </button>
                    <button onClick={exportCompetitorKws}
                      disabled={(gapView === "gaps" ? gapResult.gaps : gapResult.covered).length === 0}
                      style={{
                        display:"flex", alignItems:"center", gap:"6px",
                        fontFamily:"var(--font-mono)", fontSize:"11px", letterSpacing:"0.08em",
                        color:"var(--text-secondary)", background:"transparent",
                        border:"1px solid var(--border)", borderRadius:"8px",
                        padding:"8px 14px", cursor:"pointer", transition:"all 0.16s",
                      }}
                      title="Export the visible pages as CSV"
                    >
                      <Download size={11} /> EXPORT CSV
                    </button>
                  </div>
                </div>

                {saveMessage && (
                  <div style={{
                    display:"flex", alignItems:"center", gap:"8px",
                    padding:"10px 14px", marginBottom:"14px",
                    background: saveState === "error" ? "rgba(255,23,68,0.08)" : "rgba(37,181,126,0.08)",
                    border: `1px solid ${saveState === "error" ? "rgba(255,23,68,0.25)" : "rgba(37,181,126,0.25)"}`,
                    borderRadius:"8px",
                    fontFamily:"var(--font-body)", fontSize:"12px",
                    color: saveState === "error" ? "var(--signal-red)" : "var(--signal-green)",
                  }}>
                    {saveState === "error" ? <AlertTriangle size={12} /> : <Check size={12} />}
                    {saveMessage}
                  </div>
                )}

                <div style={{ padding:"12px 16px", background:"var(--muted)", borderRadius:"8px", marginBottom:"16px" }}>
                  <span style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-secondary)", lineHeight:1.55 }}>
                    {gapView === "gaps"
                      ? <>Pages <strong style={{ color:"var(--text-primary)" }}>{gapResult.competitor}</strong> publishes where none of your Search Console queries come close to the subject. Open any one to check it.</>
                      : <>Pages where you already appear for something close. The query of yours that covers it is shown, so you can judge whether we matched it fairly.</>}
                  </span>
                </div>

                {/* Pages */}
                <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"12px", overflow:"hidden" }}>
                  {(gapView === "gaps" ? gapResult.gaps : gapResult.covered).length === 0 ? (
                    <EmptyState
                      msg={gapView === "gaps"
                        ? `Nothing found that ${gapResult.competitor} covers and you don't — on the pages we read.`
                        : "None of the pages we read overlapped with your queries."}
                      brandColor={brandColor}
                    />
                  ) : (
                    <div>
                      {(gapView === "gaps" ? gapResult.gaps : gapResult.covered).map((pg, i, arr) => (
                        <div key={pg.url} style={{ padding:"14px 16px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", gap:"12px", flexWrap:"wrap", alignItems:"flex-start" }}>
                            <div style={{ flex:"1 1 320px", minWidth:0 }}>
                              <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:600, color:"var(--text-primary)", marginBottom:"3px" }}>
                                {pg.title || "(no title)"}
                              </div>
                              <a href={pg.url} target="_blank" rel="noopener noreferrer"
                                style={{ fontFamily:"var(--font-mono)", fontSize:"10.5px", color:"var(--text-tertiary)", textDecoration:"none", wordBreak:"break-all" }}>
                                {pg.url}
                              </a>
                              <div style={{ display:"flex", gap:"5px", flexWrap:"wrap", marginTop:"7px" }}>
                                {pg.terms.slice(0, 8).map(t => (
                                  <span key={t} style={{ fontFamily:"var(--font-mono)", fontSize:"9px", letterSpacing:"0.04em", color:"var(--text-secondary)", background:"var(--card)", border:"1px solid var(--border)", padding:"2px 7px", borderRadius:"100px" }}>{t}</span>
                                ))}
                              </div>
                            </div>
                            <div style={{ textAlign:"right", flexShrink:0 }}>
                              {pg.matchedQuery ? (
                                <>
                                  <div style={{ fontFamily:"var(--font-mono)", fontSize:"9px", color:"var(--text-tertiary)", letterSpacing:"0.08em", marginBottom:"3px" }}>YOUR CLOSEST QUERY</div>
                                  <div style={{ fontFamily:"var(--font-body)", fontSize:"12.5px", color:"var(--signal-green)" }}>{pg.matchedQuery}</div>
                                  <div style={{ fontFamily:"var(--font-mono)", fontSize:"10px", color:"var(--text-tertiary)", marginTop:"2px" }}>{Math.round(pg.overlap * 100)}% of the subject</div>
                                </>
                              ) : (
                                <div style={{ fontFamily:"var(--font-mono)", fontSize:"10px", color:"var(--text-tertiary)", letterSpacing:"0.06em" }}>
                                  NO QUERY OF YOURS IS CLOSE
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {gapResult.unclear.length > 0 && (
                  <div style={{ fontFamily:"var(--font-body)", fontSize:"12px", color:"var(--text-tertiary)", marginTop:"12px", lineHeight:1.5 }}>
                    {gapResult.unclear.length} of their pages had titles carrying nothing but their brand name
                    (&ldquo;Home | {gapResult.competitor}&rdquo; and similar). We can&rsquo;t say anything about those, so
                    they are excluded rather than counted as gaps.
                  </div>
                )}
              </>
            )}

            {!compKwLoading && !gapResult && !compKwError && (
              <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"12px" }}>
                <EmptyState msg="Enter a competitor domain above to see what they publish that you have no search presence for." brandColor={brandColor} />
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>

      {/* Sticky "Save N to strategy" bar — appears when keywords are selected */}
      <AnimatePresence>
        {selectedKws.size > 0 && strategies.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.25, ease: EASE }}
            style={{
              position: "sticky", bottom: 20, zIndex: 20,
              margin: "24px auto 0", maxWidth: 920,
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px",
              background: "var(--surface)",
              border: `1px solid rgba(var(--brand-rgb), 0.45)`,
              boxShadow: "0 10px 40px rgba(0,0,0,0.35), 0 0 28px var(--brand-glow)",
              borderRadius: 14, flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 auto", minWidth: 220 }}>
              <Target size={14} color={brandColor}/>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)", letterSpacing: "0.06em" }}>
                {selectedKws.size} selected
              </span>
              {attachMsg && (
                <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: attachMsg.startsWith("Saved") ? "var(--signal-green)" : "var(--signal-red)" }}>
                  · {attachMsg}
                </span>
              )}
            </div>
            <select
              value={attachTarget}
              onChange={(e) => setAttachTarget(e.target.value)}
              style={{
                padding: "8px 10px",
                fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)",
                background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
                appearance: "none", minWidth: 200,
              }}
            >
              {strategies.map(s => (
                <option key={s.id} value={s.id}>
                  {s.is_active ? "★ " : ""}[{s.acronym ?? "STR"}] {s.title}
                </option>
              ))}
            </select>
            <button
              onClick={attachSelection}
              disabled={attachBusy || !attachTarget}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500,
                color: "#fff", background: brandColor, border: "none",
                borderRadius: 8, padding: "8px 14px", cursor: attachBusy ? "default" : "pointer",
                opacity: attachBusy ? 0.7 : 1,
              }}
            >
              {attachBusy
                ? <div style={{ width: 11, height: 11, border: "1.5px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/>
                : <Save size={12}/>}
              {attachBusy ? "Saving…" : `Save ${selectedKws.size} to strategy`}
            </button>
            <button
              onClick={clearSelection}
              aria-label="Clear selection"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: "transparent", border: "1px solid var(--border)",
                borderRadius: 8, padding: 7, cursor: "pointer", color: "var(--text-tertiary)",
              }}
            >
              <X size={12}/>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
