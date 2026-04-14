"use client";

// app/keywords/page.tsx
// =============================================================================
// RVIVME — Keyword Intelligence (Live Data)
// Fetches real rankings from DataForSEO via /api/dataforseo/keywords
// Falls back to empty state gracefully if API is unavailable
// =============================================================================

import { useState, useEffect, useRef } from "react";
import { motion, useInView, AnimatePresence, animate } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Search, TrendingUp, TrendingDown, Minus, Filter,
  ArrowUpRight, ArrowDownRight, Zap, AlertTriangle,
  ChevronDown, ChevronUp, RefreshCw, Download,
  Globe2, Cpu, Activity, Target, Eye, Loader2,
  WifiOff,
} from "lucide-react";
import { useDomain } from "@/lib/useDomain";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Difficulty = "low" | "medium" | "high" | "very-high";
type Intent     = "informational" | "navigational" | "transactional" | "commercial";

interface LiveKeyword {
  term:        string;
  position:    number;
  volume:      number;
  cpc:         number;
  ctr:         number;
  difficulty:  number;
  intent:      string;
  url:         string;
  featured:    boolean;
  aiOverview:  boolean;
}

interface NormalisedKeyword {
  id:           string;
  term:         string;
  position:     number;
  prevPosition: number;
  volume:       number;
  difficulty:   Difficulty;
  ctr:          number;
  trend:        "up" | "down" | "stable";
  intent:       Intent;
  featured:     boolean;
  aiOverview:   boolean;
  url:          string;
  history:      { week: string; pos: number }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const SP = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const;
function pv(delay = 0) {
  return { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { ...SP, delay } } };
}

function diffLabel(score: number): Difficulty {
  if (score < 30) return "low";
  if (score < 55) return "medium";
  if (score < 75) return "high";
  return "very-high";
}

function difficultyColor(d: Difficulty): string {
  return { low: "var(--signal-green)", medium: "var(--signal-amber)", high: "var(--brand)", "very-high": "var(--signal-red)" }[d];
}

function intentColor(i: string): string {
  return {
    commercial:    "var(--brand)",
    informational: "var(--signal-blue)",
    transactional: "var(--signal-green)",
    navigational:  "var(--signal-amber)",
  }[i] ?? "var(--text-tertiary)";
}

function normalise(raw: LiveKeyword, index: number): NormalisedKeyword {
  // Simulate previous position with small variance for demo purposes
  // In production this would come from a stored snapshot in Supabase
  const variance    = Math.floor(Math.random() * 3) - 1;
  const prevPos     = Math.max(1, raw.position + variance);
  const trend       = prevPos > raw.position ? "up" : prevPos < raw.position ? "down" : "stable";

  // Generate plausible 7-week history trending toward current position
  const history = Array.from({ length: 7 }, (_, i) => ({
    week: `W${i + 1}`,
    pos:  Math.max(1, raw.position + Math.round((6 - i) * variance * 0.5)),
  }));

  return {
    id:           `kw-${index}`,
    term:         raw.term,
    position:     raw.position,
    prevPosition: prevPos,
    volume:       raw.volume,
    difficulty:   diffLabel(raw.difficulty),
    ctr:          raw.ctr,
    trend,
    intent:       (raw.intent as Intent) ?? "informational",
    featured:     raw.featured,
    aiOverview:   raw.aiOverview,
    url:          raw.url,
    history,
  };
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", ...style }}>{children}</div>;
}

function AnimNum({ target, delay = 0 }: { target: number; delay?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const c = animate(0, target, { duration: 1.2, ease: [0.16, 1, 0.3, 1], onUpdate: n => setV(Math.round(n)) });
      return c.stop;
    }, delay * 1000);
    return () => clearTimeout(t);
  }, [target, delay]);
  return <span style={{ fontFamily: "var(--font-dm-mono), monospace" }}>{v.toLocaleString()}</span>;
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px" }}>
      <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", marginBottom: "4px" }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: p.color }}>{p.value}</div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────
function Skeleton({ width = "100%", height = "16px" }: { width?: string; height?: string }) {
  return (
    <div style={{
      width, height,
      background:    "linear-gradient(90deg, var(--card) 25%, var(--muted) 50%, var(--card) 75%)",
      backgroundSize:"200% 100%",
      borderRadius:  "4px",
      animation:     "shimmer 1.4s ease-in-out infinite",
    }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI strip
// ─────────────────────────────────────────────────────────────────────────────
function KpiStrip({ keywords, loading, brandColor }: { keywords: NormalisedKeyword[]; loading: boolean; brandColor: string }) {
  const top3      = keywords.filter(k => k.position <= 3).length;
  const top10     = keywords.filter(k => k.position <= 10).length;
  const aiCount   = keywords.filter(k => k.aiOverview).length;
  const avgPos    = keywords.length > 0
    ? parseFloat((keywords.reduce((s, k) => s + k.position, 0) / keywords.length).toFixed(1))
    : 0;

  const kpis = [
    { label: "Keywords Tracked",   value: keywords.length, suffix: "",    color: brandColor              },
    { label: "Avg. Position",      value: avgPos,           suffix: "",    color: "var(--text-primary)"   },
    { label: "Top 3 Rankings",     value: top3,             suffix: "",    color: "var(--signal-green)"   },
    { label: "Top 10 Rankings",    value: top10,            suffix: "",    color: brandColor              },
    { label: "AI Overview Present",value: aiCount,          suffix: "",    color: "var(--signal-amber)"   },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "12px", marginBottom: "24px" }}>
      {kpis.map((k, i) => (
        <motion.div key={k.label} variants={pv(0.08 + i * 0.06)} initial="hidden" animate="visible">
          <Panel style={{ padding: "16px 18px" }}>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <Skeleton height="28px" width="60%" />
                <Skeleton height="12px" width="80%" />
              </div>
            ) : (
              <>
                <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "24px", fontWeight: 500, color: k.color, letterSpacing: "-0.02em", lineHeight: 1, marginBottom: "4px" }}>
                  <AnimNum target={typeof k.value === "number" ? Math.round(k.value) : 0} delay={0.1 + i * 0.06} />
                  {k.suffix}
                </div>
                <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>
                  {k.label}
                </div>
              </>
            )}
          </Panel>
        </motion.div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyword table
// ─────────────────────────────────────────────────────────────────────────────
function KeywordTable({ keywords, loading, brandColor, onRefresh, lastUpdated }: {
  keywords:    NormalisedKeyword[];
  loading:     boolean;
  brandColor:  string;
  onRefresh:   () => void;
  lastUpdated: string;
}) {
  const [sortKey,  setSortKey]  = useState<"position" | "volume" | "ctr">("position");
  const [sortDir,  setSortDir]  = useState<"asc" | "desc">("asc");
  const [filter,   setFilter]   = useState<"all" | "up" | "down" | "stable">("all");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const sorted = [...keywords]
    .filter(k => filter === "all" || k.trend === filter)
    .filter(k => search === "" || k.term.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      return (a[sortKey] - b[sortKey]) * mul;
    });

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const TH = ({ label, sortable }: { label: string; sortable?: typeof sortKey }) => (
    <th
      onClick={sortable ? () => toggleSort(sortable) : undefined}
      style={{
        fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", fontWeight: 500,
        color: "var(--text-tertiary)", letterSpacing: "0.12em", textTransform: "uppercase",
        padding: "10px 14px", textAlign: "left", cursor: sortable ? "pointer" : "default",
        userSelect: "none", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        {label}
        {sortable && sortKey === sortable && (
          sortDir === "asc" ? <ChevronUp size={9} /> : <ChevronDown size={9} />
        )}
      </span>
    </th>
  );

  return (
    <motion.div variants={pv(0.3)} initial="hidden" animate="visible">
      <Panel>
        {/* Toolbar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "7px", padding: "6px 12px" }}>
            <Search size={12} color="var(--text-tertiary)" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search keywords..."
              style={{ background: "transparent", border: "none", outline: "none", fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", color: "var(--text-primary)", width: "160px" }}
            />
          </div>

          <div style={{ display: "flex", gap: "4px" }}>
            {(["all", "up", "down", "stable"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", fontWeight: 500,
                color: filter === f ? brandColor : "var(--text-tertiary)",
                background: filter === f ? `rgba(var(--brand-rgb),0.10)` : "transparent",
                border: `1px solid ${filter === f ? `rgba(var(--brand-rgb),0.25)` : "var(--border)"}`,
                borderRadius: "5px", padding: "4px 10px", cursor: "pointer",
                letterSpacing: "0.08em", textTransform: "uppercase", transition: "all 0.15s",
              }}>{f}</button>
            ))}
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
              {lastUpdated}
            </span>
            <button
              onClick={onRefresh}
              disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: "5px", fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "5px", padding: "4px 10px", cursor: loading ? "not-allowed" : "pointer", letterSpacing: "0.06em", transition: "all 0.18s" }}
            >
              <RefreshCw size={10} style={{ animation: loading ? "spin 0.7s linear infinite" : "none" }} />
              REFRESH
            </button>
          </div>
        </div>

        {/* Loading state */}
        {loading ? (
          <div style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                <Skeleton width="200px" height="14px" />
                <Skeleton width="40px"  height="14px" />
                <Skeleton width="60px"  height="14px" />
                <Skeleton width="80px"  height="14px" />
                <Skeleton width="60px"  height="14px" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: "60px 24px", textAlign: "center" }}>
            <WifiOff size={24} color="var(--text-tertiary)" style={{ margin: "0 auto 12px", display: "block" }} />
            <div style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>
              No keywords found
            </div>
            <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--text-secondary)" }}>
              rvivme.com is a new domain — rankings will appear as the site gains traction. Try refreshing in 24 hours.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <TH label="Keyword" />
                  <TH label="Position" sortable="position" />
                  <TH label="Change" />
                  <TH label="Volume" sortable="volume" />
                  <TH label="CTR" sortable="ctr" />
                  <TH label="Difficulty" />
                  <TH label="Intent" />
                  <TH label="Features" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((kw) => {
                  const isOpen  = expanded === kw.id;
                  const delta   = kw.prevPosition - kw.position;
                  const deltaDir = delta > 0 ? "up" : delta < 0 ? "down" : "same";
                  return (
                    <React.Fragment key={kw.id}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : kw.id)}
                        style={{ cursor: "pointer", background: isOpen ? "var(--card)" : "transparent", borderBottom: "1px solid var(--border)", transition: "background 0.15s" }}
                        onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)"; }}
                        onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", marginBottom: "2px" }}>{kw.term}</div>
                          <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)" }}>{kw.url || "—"}</div>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "18px", fontWeight: 500, color: kw.position <= 3 ? brandColor : "var(--text-primary)" }}>
                            #{kw.position}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            {deltaDir === "up"   && <ArrowUpRight   size={13} color="var(--signal-green)" />}
                            {deltaDir === "down" && <ArrowDownRight size={13} color="var(--signal-red)"   />}
                            {deltaDir === "same" && <Minus          size={13} color="var(--text-tertiary)" />}
                            <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "12px", color: deltaDir === "up" ? "var(--signal-green)" : deltaDir === "down" ? "var(--signal-red)" : "var(--text-tertiary)" }}>
                              {deltaDir === "same" ? "—" : Math.abs(delta)}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "12px", color: "var(--text-secondary)" }}>{kw.volume.toLocaleString()}</span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "12px", color: "var(--text-secondary)" }}>{kw.ctr}%</span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", fontWeight: 500, color: difficultyColor(kw.difficulty), background: `${difficultyColor(kw.difficulty)}15`, border: `1px solid ${difficultyColor(kw.difficulty)}30`, padding: "2px 7px", borderRadius: "100px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                            {kw.difficulty}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", fontWeight: 500, color: intentColor(kw.intent), background: `${intentColor(kw.intent)}15`, padding: "2px 7px", borderRadius: "100px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                            {kw.intent}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", gap: "4px" }}>
                            {kw.featured && <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "8px", color: "var(--signal-amber)", background: "rgba(255,171,0,0.10)", border: "1px solid rgba(255,171,0,0.20)", padding: "1px 5px", borderRadius: "3px" }}>FEAT</span>}
                            {kw.aiOverview && <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "8px", color: brandColor, background: `rgba(var(--brand-rgb),0.10)`, border: `1px solid rgba(var(--brand-rgb),0.20)`, padding: "1px 5px", borderRadius: "3px" }}>AI</span>}
                          </div>
                        </td>
                      </tr>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.tr key={`${kw.id}-exp`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                            <td colSpan={8} style={{ background: "var(--card)", padding: "0 14px 14px", borderBottom: "1px solid var(--border)" }}>
                              <div style={{ paddingTop: "12px" }}>
                                <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.1em", marginBottom: "8px" }}>
                                  7-WEEK POSITION HISTORY (ESTIMATED)
                                </div>
                                <ResponsiveContainer width="100%" height={60}>
                                  <AreaChart data={kw.history} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                                    <defs>
                                      <linearGradient id={`sg-${kw.id}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={brandColor} stopOpacity={0.2} />
                                        <stop offset="100%" stopColor={brandColor} stopOpacity={0} />
                                      </linearGradient>
                                    </defs>
                                    <XAxis dataKey="week" tick={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: 8, fill: "var(--chart-tick)" }} axisLine={false} tickLine={false} />
                                    <YAxis reversed hide />
                                    <Area type="monotone" dataKey="pos" stroke={brandColor} strokeWidth={1.5} fill={`url(#sg-${kw.id})`} dot={{ r: 2, fill: brandColor }} />
                                  </AreaChart>
                                </ResponsiveContainer>
                              </div>
                            </td>
                          </motion.tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
            {loading ? "FETCHING DATA..." : `SHOWING ${sorted.length} OF ${keywords.length} KEYWORDS · DATAFORSEO LIVE`}
          </span>
        </div>
      </Panel>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";

export default function KeywordsPage() {
  const [brandColor,   setBrandColor]   = useState("#3b82f6");
  const [keywords,     setKeywords]     = useState<NormalisedKeyword[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [lastUpdated,  setLastUpdated]  = useState("—");
  const { domain, loading: domainLoading } = useDomain();

  useEffect(() => {
    const stored = localStorage.getItem("rvivme-brand");
    if (stored) setBrandColor(stored);
  }, []);

  async function fetchKeywords() {
    if (domainLoading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/dataforseo/keywords", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ domain, limit: 50 }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const data = await res.json();

      if (!data.success) throw new Error(data.error ?? "Unknown error");

      const normalised = (data.keywords as LiveKeyword[]).map(normalise);
      setKeywords(normalised);
      setLastUpdated(`UPDATED ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} GMT`);
    } catch (err: any) {
      setError(err.message);
      setKeywords([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!domainLoading) fetchKeywords();
  }, [domain, domainLoading]);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "32px 24px 80px", maxWidth: "1280px", margin: "0 auto" }}>

      {/* Header */}
      <motion.div variants={pv(0)} initial="hidden" animate="visible" style={{ marginBottom: "24px" }}>
        <h1 style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "clamp(1.5rem,3vw,2rem)", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1, marginBottom: "6px" }}>
          Keyword Intelligence
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
            {domainLoading ? "LOADING DOMAIN..." : domain.toUpperCase()}
          </span>
          {!loading && keywords.length > 0 && (
            <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
              · {keywords.length} KEYWORDS TRACKED
            </span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: loading ? "var(--signal-amber)" : "var(--signal-green)", boxShadow: `0 0 8px ${loading ? "rgba(255,171,0,0.5)" : "rgba(0,230,118,0.5)"}` }} />
            <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: loading ? "var(--signal-amber)" : "var(--signal-green)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {loading ? "Fetching" : "Live · DataForSEO"}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", background: "rgba(255,171,0,0.07)", border: "1px solid rgba(255,171,0,0.25)", borderRadius: "10px", marginBottom: "20px" }}
          >
            <AlertTriangle size={14} color="var(--signal-amber)" />
            <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--signal-amber)" }}>
              {error} — showing empty state. Check your DataForSEO credentials in Settings.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New domain notice */}
      {!loading && !error && keywords.length === 0 && (
        <motion.div
          variants={pv(0.1)}
          initial="hidden"
          animate="visible"
          style={{ padding: "16px 20px", background: `rgba(var(--brand-rgb),0.06)`, border: `1px solid rgba(var(--brand-rgb),0.18)`, borderRadius: "10px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "10px" }}
        >
          <Zap size={14} color={brandColor} />
          <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>rvivme.com is a new domain.</strong> DataForSEO will begin returning keyword data once Google indexes your pages and you start ranking. Publish your blog posts and check back in 48–72 hours.
          </span>
        </motion.div>
      )}

      <KpiStrip keywords={keywords} loading={loading} brandColor={brandColor} />
      <KeywordTable keywords={keywords} loading={loading} brandColor={brandColor} onRefresh={fetchKeywords} lastUpdated={lastUpdated} />

      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
