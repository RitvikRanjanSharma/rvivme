"use client";

// app/keywords/page.tsx
// =============================================================================
// AI Marketing Labs — Keyword Intelligence
// Live DataForSEO data · Keyword ideas (Keyword Planner equivalent)
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, TrendingUp, TrendingDown, Minus,
  RefreshCw, AlertTriangle, ChevronDown, ChevronUp,
  Zap, Target, Lightbulb, ArrowUpRight,
} from "lucide-react";
import { useDomain } from "@/lib/useDomain";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;
function pv(delay = 0) {
  return {
    hidden:  { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 30, delay } },
  };
}

interface LiveKeyword {
  term:       string;
  position:   number;
  volume:     number;
  ctr:        number;
  difficulty: number;
  intent:     string;
  url:        string;
  featured:   boolean;
  aiOverview: boolean;
}

interface IdeaKeyword {
  term:             string;
  volume:           number;
  cpc:              number;
  competition:      number;
  competitionLevel: string;
  difficulty:       number;
  intent:           string;
  trending:         "up" | "down" | "stable";
}

function difficultyColor(d: number): string {
  if (d >= 70) return "var(--signal-red)";
  if (d >= 40) return "var(--signal-amber)";
  return "var(--signal-green)";
}

function intentColor(i: string): string {
  return { transactional: "var(--signal-green)", commercial: "var(--brand)", informational: "var(--text-tertiary)", navigational: "var(--signal-amber)" }[i] ?? "var(--text-tertiary)";
}

function TrendIcon({ dir }: { dir: string }) {
  if (dir === "up")   return <TrendingUp  size={12} color="var(--signal-green)" />;
  if (dir === "down") return <TrendingDown size={12} color="var(--signal-red)" />;
  return <Minus size={12} color="var(--text-tertiary)" />;
}

function EmptyState({ message, brandColor }: { message: string; brandColor: string }) {
  return (
    <div style={{ padding: "60px 32px", textAlign: "center" }}>
      <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: `rgba(var(--brand-rgb),0.08)`, border: `1px solid rgba(var(--brand-rgb),0.20)`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
        <Search size={18} color={brandColor} />
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-secondary)" }}>{message}</div>
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "20px 22px" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem,3vw,2.4rem)", letterSpacing: "-0.04em", lineHeight: 1, color, marginBottom: "6px" }}>{value}</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-secondary)" }}>{label}</div>
      {sub && <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)", marginTop: "4px", letterSpacing: "0.06em" }}>{sub}</div>}
    </div>
  );
}

export default function KeywordsPage() {
  const { domain, loading: domainLoading } = useDomain();
  const [brandColor,  setBrandColor]  = useState("#2563eb");
  const [activeTab,   setActiveTab]   = useState<"rankings" | "ideas">("rankings");

  // Rankings state
  const [rankings,    setRankings]    = useState<LiveKeyword[]>([]);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankError,   setRankError]   = useState<string | null>(null);
  const [rankFilter,  setRankFilter]  = useState("");
  const [sortCol,     setSortCol]     = useState<"position"|"volume"|"difficulty">("position");
  const [sortAsc,     setSortAsc]     = useState(true);

  // Ideas state
  const [ideaSeed,    setIdeaSeed]    = useState("");
  const [ideas,       setIdeas]       = useState<IdeaKeyword[]>([]);
  const [ideaLoading, setIdeaLoading] = useState(false);
  const [ideaError,   setIdeaError]   = useState<string | null>(null);
  const [ideaMode,    setIdeaMode]    = useState<"seed"|"site">("site");

  useEffect(() => {
    const b = localStorage.getItem("aiml-brand") || localStorage.getItem("rvivme-brand");
    if (b) setBrandColor(b);
  }, []);

  const loadRankings = useCallback(async () => {
    if (!domain || domainLoading) return;
    setRankLoading(true); setRankError(null);
    try {
      const res  = await fetch(`/api/dataforseo/keywords?domain=${encodeURIComponent(domain)}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to load rankings");
      setRankings(data.keywords ?? []);
    } catch (e: any) {
      setRankError(e.message);
    } finally {
      setRankLoading(false);
    }
  }, [domain, domainLoading]);

  useEffect(() => { if (activeTab === "rankings") loadRankings(); }, [activeTab, loadRankings]);

  async function loadIdeas() {
    setIdeaLoading(true); setIdeaError(null);
    try {
      const body = ideaMode === "site"
        ? { mode: "site", domain }
        : { mode: "seed", seed: ideaSeed.split(",").map(s => s.trim()).filter(Boolean) };

      const res  = await fetch("/api/dataforseo/keyword-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to load keyword ideas");
      setIdeas(data.keywords ?? []);
    } catch (e: any) {
      setIdeaError(e.message);
    } finally {
      setIdeaLoading(false);
    }
  }

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  }

  const filtered = rankings
    .filter(k => !rankFilter || k.term.toLowerCase().includes(rankFilter.toLowerCase()))
    .sort((a, b) => {
      const va = a[sortCol] as number, vb = b[sortCol] as number;
      return sortAsc ? va - vb : vb - va;
    });

  const avgPos  = rankings.length ? (rankings.reduce((s,k) => s + k.position, 0) / rankings.length).toFixed(1) : "—";
  const top10   = rankings.filter(k => k.position <= 10).length;
  const featSnip = rankings.filter(k => k.featured).length;

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "32px 24px 80px", maxWidth: "1280px", margin: "0 auto" }}>

      {/* Header */}
      <motion.div variants={pv(0)} initial="hidden" animate="visible" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem,3.5vw,2.8rem)", letterSpacing: "-0.04em", lineHeight: 1, fontWeight: 400, color: "var(--text-primary)", marginBottom: "6px" }}>
            Keyword Intelligence
          </h1>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
            {domainLoading ? "Loading domain…" : domain}
          </div>
        </div>
        <button onClick={loadRankings} disabled={rankLoading} style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-secondary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 14px", cursor: "pointer", letterSpacing: "0.06em" }}>
          <RefreshCw size={11} style={{ animation: rankLoading ? "spin 0.7s linear infinite" : "none" }} /> REFRESH
        </button>
      </motion.div>

      {/* KPIs */}
      <motion.div variants={pv(0.06)} initial="hidden" animate="visible" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "24px" }}>
        <KpiCard label="Keywords Tracked"    value={rankings.length}  color={brandColor} />
        <KpiCard label="Average Position"    value={avgPos}           color="var(--text-primary)" />
        <KpiCard label="Top 10 Rankings"     value={top10}            color="var(--signal-green)" />
        <KpiCard label="Featured Snippets"   value={featSnip}         color="var(--signal-amber)" />
      </motion.div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "20px", borderBottom: "1px solid var(--border)", paddingBottom: "0" }}>
        {([["rankings","Rankings"], ["ideas","Keyword Ideas"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
            color: activeTab === id ? "var(--text-primary)" : "var(--text-secondary)",
            background: "transparent", border: "none", borderBottom: `2px solid ${activeTab === id ? brandColor : "transparent"}`,
            padding: "10px 16px", cursor: "pointer", transition: "color 0.16s", marginBottom: "-1px",
          }}>
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "rankings" && (
          <motion.div key="rankings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {/* Error */}
            {rankError && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", background: "rgba(255,171,0,0.08)", border: "1px solid rgba(255,171,0,0.25)", borderRadius: "10px", marginBottom: "16px" }}>
                <AlertTriangle size={14} color="var(--signal-amber)" />
                <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--signal-amber)" }}>{rankError}</span>
              </div>
            )}

            {/* Table */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" }}>
              {/* Search bar */}
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "10px" }}>
                <Search size={13} color="var(--text-tertiary)" />
                <input value={rankFilter} onChange={e => setRankFilter(e.target.value)} placeholder="Filter keywords…"
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-primary)" }}
                />
              </div>

              {rankLoading ? (
                <div style={{ padding: "48px", display: "flex", justifyContent: "center" }}>
                  <div style={{ width: "20px", height: "20px", border: "2px solid var(--border)", borderTopColor: brandColor, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState message={rankings.length === 0 ? "No rankings data yet. Try refreshing." : "No keywords match your filter."} brandColor={brandColor} />
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead>
                      <tr>
                        {[
                          { label: "Keyword",    col: null          },
                          { label: "Position",   col: "position"    },
                          { label: "Volume",     col: "volume"      },
                          { label: "Difficulty", col: "difficulty"  },
                          { label: "Intent",     col: null          },
                          { label: "Flags",      col: null          },
                        ].map(({ label, col }) => (
                          <th key={label} onClick={() => col && toggleSort(col as any)}
                            style={{ padding: "10px 14px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: "1px solid var(--border)", cursor: col ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap" }}>
                            {label} {col && sortCol === col ? (sortAsc ? "↑" : "↓") : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((kw, i) => (
                        <tr key={kw.term}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--muted)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                        >
                          <td style={{ padding: "13px 14px", borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{kw.term}</span>
                          </td>
                          <td style={{ padding: "13px 14px", borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 500, color: kw.position <= 3 ? "var(--signal-green)" : kw.position <= 10 ? brandColor : "var(--text-secondary)" }}>
                              #{kw.position}
                            </span>
                          </td>
                          <td style={{ padding: "13px 14px", borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)" }}>{kw.volume.toLocaleString()}</span>
                          </td>
                          <td style={{ padding: "13px 14px", borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{ width: "48px", height: "4px", background: "var(--muted)", borderRadius: "2px", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${kw.difficulty}%`, background: difficultyColor(kw.difficulty), borderRadius: "2px", transition: "width 0.3s" }} />
                              </div>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: difficultyColor(kw.difficulty) }}>{kw.difficulty}</span>
                            </div>
                          </td>
                          <td style={{ padding: "13px 14px", borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: intentColor(kw.intent), background: `${intentColor(kw.intent)}15`, padding: "2px 7px", borderRadius: "100px", letterSpacing: "0.08em", textTransform: "capitalize" }}>{kw.intent}</span>
                          </td>
                          <td style={{ padding: "13px 14px", borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <div style={{ display: "flex", gap: "5px" }}>
                              {kw.featured   && <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--signal-amber)", background: "rgba(255,171,0,0.10)", border: "1px solid rgba(255,171,0,0.25)", padding: "2px 6px", borderRadius: "100px", letterSpacing: "0.06em" }}>SNIPPET</span>}
                              {kw.aiOverview && <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: brandColor, background: `rgba(var(--brand-rgb),0.08)`, border: `1px solid rgba(var(--brand-rgb),0.20)`, padding: "2px 6px", borderRadius: "100px", letterSpacing: "0.06em" }}>AI</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === "ideas" && (
          <motion.div key="ideas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {/* Mode selector + input */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "20px", marginBottom: "20px" }}>
              <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "14px" }}>
                Keyword Ideas — powered by Google Ads data via DataForSEO
              </div>

              <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                {(["site","seed"] as const).map(m => (
                  <button key={m} onClick={() => setIdeaMode(m)} style={{
                    fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.08em",
                    padding: "6px 14px", borderRadius: "100px", cursor: "pointer",
                    border: `1px solid ${ideaMode === m ? brandColor : "var(--border)"}`,
                    background: ideaMode === m ? `rgba(var(--brand-rgb),0.08)` : "transparent",
                    color: ideaMode === m ? brandColor : "var(--text-secondary)",
                    transition: "all 0.16s",
                  }}>
                    {m === "site" ? "FROM WEBSITE" : "FROM KEYWORDS"}
                  </button>
                ))}
              </div>

              {ideaMode === "site" ? (
                <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)" }}>
                  Will generate keyword ideas based on your website: <strong style={{ color: "var(--text-primary)" }}>{domain}</strong>
                </div>
              ) : (
                <input value={ideaSeed} onChange={e => setIdeaSeed(e.target.value)} placeholder="Enter seed keywords, comma separated (e.g. seo tools, keyword research)"
                  style={{ width: "100%", padding: "10px 13px", fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-primary)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", outline: "none", boxSizing: "border-box" as const }}
                  onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
                  onBlur={e =>  e.currentTarget.style.borderColor = "var(--border)"}
                />
              )}

              <button onClick={loadIdeas} disabled={ideaLoading || (ideaMode === "seed" && !ideaSeed.trim())} style={{
                marginTop: "14px", display: "flex", alignItems: "center", gap: "7px",
                fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
                color: "#fff", background: ideaLoading ? "var(--muted)" : brandColor,
                border: "none", borderRadius: "8px", padding: "10px 20px", cursor: "pointer", transition: "opacity 0.16s",
              }}>
                {ideaLoading ? <div style={{ width: "12px", height: "12px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> : <Lightbulb size={13} />}
                {ideaLoading ? "Fetching ideas…" : "Get keyword ideas"}
              </button>
            </div>

            {/* Error */}
            {ideaError && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", background: "rgba(255,171,0,0.08)", border: "1px solid rgba(255,171,0,0.25)", borderRadius: "10px", marginBottom: "16px" }}>
                <AlertTriangle size={14} color="var(--signal-amber)" />
                <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--signal-amber)" }}>{ideaError}</span>
              </div>
            )}

            {/* Ideas table */}
            {ideas.length > 0 && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
                    {ideas.length} IDEAS FOUND · GOOGLE ADS DATA
                  </span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead>
                      <tr>
                        {["Keyword","Volume","CPC","Competition","Difficulty","Trend","Intent"].map(h => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ideas.map((kw, i) => (
                        <tr key={kw.term}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--muted)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                        >
                          <td style={{ padding: "12px 14px", borderBottom: i < ideas.length-1 ? "1px solid var(--border)":"none" }}>
                            <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{kw.term}</span>
                          </td>
                          <td style={{ padding: "12px 14px", borderBottom: i < ideas.length-1 ? "1px solid var(--border)":"none" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)" }}>{kw.volume.toLocaleString()}</span>
                          </td>
                          <td style={{ padding: "12px 14px", borderBottom: i < ideas.length-1 ? "1px solid var(--border)":"none" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)" }}>£{kw.cpc.toFixed(2)}</span>
                          </td>
                          <td style={{ padding: "12px 14px", borderBottom: i < ideas.length-1 ? "1px solid var(--border)":"none" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: "100px", color: kw.competitionLevel === "LOW" ? "var(--signal-green)" : kw.competitionLevel === "HIGH" ? "var(--signal-red)" : "var(--signal-amber)", background: kw.competitionLevel === "LOW" ? "rgba(0,230,118,0.08)" : kw.competitionLevel === "HIGH" ? "rgba(255,23,68,0.08)" : "rgba(255,171,0,0.08)" }}>
                              {kw.competitionLevel}
                            </span>
                          </td>
                          <td style={{ padding: "12px 14px", borderBottom: i < ideas.length-1 ? "1px solid var(--border)":"none" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <div style={{ width: "40px", height: "4px", background: "var(--muted)", borderRadius: "2px", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${kw.difficulty}%`, background: difficultyColor(kw.difficulty), borderRadius: "2px" }} />
                              </div>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: difficultyColor(kw.difficulty) }}>{kw.difficulty}</span>
                            </div>
                          </td>
                          <td style={{ padding: "12px 14px", borderBottom: i < ideas.length-1 ? "1px solid var(--border)":"none" }}>
                            <TrendIcon dir={kw.trending} />
                          </td>
                          <td style={{ padding: "12px 14px", borderBottom: i < ideas.length-1 ? "1px solid var(--border)":"none" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: intentColor(kw.intent), background: `${intentColor(kw.intent)}15`, padding: "2px 7px", borderRadius: "100px", letterSpacing: "0.08em", textTransform: "capitalize" }}>{kw.intent}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!ideaLoading && ideas.length === 0 && !ideaError && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px" }}>
                <EmptyState message='Click "Get keyword ideas" to discover opportunities using Google Ads data.' brandColor={brandColor} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
