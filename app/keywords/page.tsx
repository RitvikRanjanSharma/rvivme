"use client";

// app/keywords/page.tsx
// =============================================================================
// AI Marketing Labs — Keyword Intelligence
// Live rankings · Keyword ideas · Competitor keywords + AI analysis
// =============================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  Search, TrendingUp, TrendingDown, Minus,
  RefreshCw, AlertTriangle, Lightbulb, Zap,
  ChevronDown, ChevronUp, Globe2, ArrowRight,
} from "lucide-react";
import { useDomain } from "@/lib/useDomain";

const EASE: [number,number,number,number] = [0.16, 1, 0.3, 1];

// ─── Types ────────────────────────────────────────────────────────────────────
interface LiveKw {
  term: string; position: number; volume: number;
  cpc: number; difficulty: number; intent: string;
  url: string; featured: boolean; aiOverview: boolean;
}
interface IdeaKw {
  term: string; volume: number; cpc: number;
  competitionLevel: string; difficulty: number;
  intent: string; trending: string;
}
interface CompKw {
  term: string; volume: number; difficulty: number;
  cpc: number; competitionLevel: string; intent: string;
  competitorPos: number; aiReason?: string;
}

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

// ─── AI reason card ───────────────────────────────────────────────────────────
function AiReasonCard({ kw, domain, brandColor }: { kw: CompKw; domain: string; brandColor: string }) {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [reason,  setReason]  = useState(kw.aiReason ?? "");

  async function loadReason() {
    if (reason || loading) { setOpen(!open); return; }
    setOpen(true); setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 150,
          messages: [{
            role: "user",
            content: `You are an SEO strategist. In 2-3 sentences explain why the keyword "${kw.term}" (volume: ${kw.volume}/mo, difficulty: ${kw.difficulty}/100, intent: ${kw.intent}) is a strategic opportunity for "${domain}". Be direct and specific. No fluff.`,
          }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text ?? "Analysis unavailable.";
      setReason(text);
    } catch {
      setReason("Unable to generate analysis. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={loadReason} style={{
        display:"inline-flex", alignItems:"center", gap:"5px",
        fontFamily:"var(--font-mono)", fontSize:"9px", letterSpacing:"0.08em",
        color: brandColor, background:`rgba(var(--brand-rgb),0.08)`,
        border:`1px solid rgba(var(--brand-rgb),0.20)`,
        borderRadius:"100px", padding:"3px 9px", cursor:"pointer",
        transition:"all 0.16s",
      }}>
        <Zap size={9} />
        {open ? "HIDE" : "WHY THIS?"}
        {open ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }} exit={{ opacity:0, height:0 }}
            transition={{ duration:0.25 }}
            style={{ overflow:"hidden" }}
          >
            <div style={{ marginTop:"8px", padding:"10px 12px", background:"var(--card)", border:"1px solid var(--border)", borderRadius:"8px", maxWidth:"480px" }}>
              {loading
                ? <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                    <div style={{ width:"12px", height:"12px", border:`1.5px solid rgba(var(--brand-rgb),0.3)`, borderTopColor:brandColor, borderRadius:"50%", animation:"spin 0.7s linear infinite", flexShrink:0 }} />
                    <span style={{ fontFamily:"var(--font-body)", fontSize:"12px", color:"var(--text-tertiary)" }}>Analysing…</span>
                  </div>
                : <p style={{ fontFamily:"var(--font-body)", fontSize:"12px", color:"var(--text-secondary)", lineHeight:1.65, margin:0 }}>{reason}</p>
              }
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Keyword table (reusable) ─────────────────────────────────────────────────
function KwTable({ keywords, cols, emptyMsg, brandColor, compDomain, yourDomain, showAi = false }: {
  keywords: any[]; cols: string[]; emptyMsg: string; brandColor: string;
  compDomain?: string; yourDomain?: string; showAi?: boolean;
}) {
  if (keywords.length === 0) return <EmptyState msg={emptyMsg} brandColor={brandColor} />;
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ borderCollapse:"collapse", width:"100%" }}>
        <thead>
          <tr>
            {cols.map(h => (
              <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontFamily:"var(--font-mono)", fontSize:"9px", color:"var(--text-tertiary)", letterSpacing:"0.1em", textTransform:"uppercase", borderBottom:"1px solid var(--border)", whiteSpace:"nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keywords.map((kw, i) => (
            <tr key={kw.term + i}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--muted)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
            >
              <td style={{ padding:"13px 14px", borderBottom: i < keywords.length-1 ? "1px solid var(--border)" : "none", maxWidth:"260px" }}>
                <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:500, color:"var(--text-primary)", marginBottom: showAi ? "8px" : 0 }}>{kw.term}</div>
                {showAi && compDomain && yourDomain && (
                  <AiReasonCard kw={kw} domain={yourDomain} brandColor={brandColor} />
                )}
              </td>
              <td style={{ padding:"13px 14px", borderBottom: i < keywords.length-1 ? "1px solid var(--border)" : "none" }}>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:"12px", color:"var(--text-secondary)" }}>{(kw.volume||0).toLocaleString()}</span>
              </td>
              {kw.position !== undefined && (
                <td style={{ padding:"13px 14px", borderBottom: i < keywords.length-1 ? "1px solid var(--border)" : "none" }}>
                  <span style={{ fontFamily:"var(--font-mono)", fontSize:"13px", fontWeight:500, color: kw.position <= 3 ? "var(--signal-green)" : kw.position <= 10 ? brandColor : "var(--text-secondary)" }}>#{kw.position}</span>
                </td>
              )}
              {kw.competitorPos !== undefined && (
                <td style={{ padding:"13px 14px", borderBottom: i < keywords.length-1 ? "1px solid var(--border)" : "none" }}>
                  <span style={{ fontFamily:"var(--font-mono)", fontSize:"12px", color:"var(--signal-amber)" }}>#{kw.competitorPos}</span>
                </td>
              )}
              <td style={{ padding:"13px 14px", borderBottom: i < keywords.length-1 ? "1px solid var(--border)" : "none" }}>
                <DiffBar d={kw.difficulty} />
              </td>
              <td style={{ padding:"13px 14px", borderBottom: i < keywords.length-1 ? "1px solid var(--border)" : "none" }}>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:"11px", color:"var(--text-secondary)" }}>£{(kw.cpc||0).toFixed(2)}</span>
              </td>
              <td style={{ padding:"13px 14px", borderBottom: i < keywords.length-1 ? "1px solid var(--border)" : "none" }}>
                <IntentBadge i={kw.intent} />
              </td>
              {kw.trending !== undefined && (
                <td style={{ padding:"13px 14px", borderBottom: i < keywords.length-1 ? "1px solid var(--border)" : "none" }}>
                  <TrendIcon d={kw.trending} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function KeywordsPage() {
  const { domain, loading: domainLoading } = useDomain();
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [activeTab,  setActiveTab]  = useState<"rankings"|"ideas"|"competitors">("rankings");

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
  const [gapKws,      setGapKws]      = useState<CompKw[]>([]);
  const [oppKws,      setOppKws]      = useState<CompKw[]>([]);
  const [compKwLoading, setCompKwLoading] = useState(false);
  const [compKwError,   setCompKwError]   = useState<string|null>(null);
  const [compSection,   setCompSection]   = useState<"gap"|"opp">("gap");

  useEffect(() => {
    const b = localStorage.getItem("aiml-brand") || localStorage.getItem("rvivme-brand");
    if (b) setBrandColor(b);
  }, []);

  // Load rankings
  const loadRankings = useCallback(async () => {
    if (!domain || domainLoading) return;
    setRankLoading(true); setRankError(null);
    try {
      const res  = await fetch("/api/dataforseo/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, limit: 50 }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed");
      setRankings(data.keywords ?? []);
    } catch (e: any) { setRankError(e.message); }
    finally { setRankLoading(false); }
  }, [domain, domainLoading]);

  useEffect(() => { if (activeTab === "rankings") loadRankings(); }, [activeTab, loadRankings]);

  // Load ideas
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
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed");
      setIdeas(data.keywords ?? []);
    } catch (e: any) { setIdeaError(e.message); }
    finally { setIdeaLoading(false); }
  }

  // Load competitor keywords
  async function loadCompetitorKws() {
    if (!compDomain.trim()) return;
    setCompKwLoading(true); setCompKwError(null);
    try {
      const cd  = compDomain.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
      const res = await fetch("/api/dataforseo/competitor-keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yourDomain: domain, competitorDomain: cd, limit: 50 }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed");
      setGapKws(data.gapKeywords ?? []);
      setOppKws(data.oppKeywords ?? []);
    } catch (e: any) { setCompKwError(e.message); }
    finally { setCompKwLoading(false); }
  }

  const filtered = rankings.filter(k =>
    !rankFilter || k.term.toLowerCase().includes(rankFilter.toLowerCase())
  );

  const avgPos  = rankings.length ? (rankings.reduce((s,k) => s + k.position, 0) / rankings.length).toFixed(1) : "—";
  const top10   = rankings.filter(k => k.position <= 10).length;
  const snippets = rankings.filter(k => k.featured).length;

  return (
    <div style={{ background:"var(--bg)", minHeight:"100vh", padding:"32px 24px 80px", maxWidth:"1280px", margin:"0 auto" }}>

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
          ["rankings",    "Rankings"],
          ["ideas",       "Keyword Ideas"],
          ["competitors", "Competitor Keywords"],
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
                    cols={["Keyword","Volume","Position","Difficulty","CPC","Intent"]}
                    emptyMsg="No keyword data yet. Make sure your website URL is set in Settings."
                    brandColor={brandColor}
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
                Keyword Ideas — Google Ads data via DataForSEO
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
                    cols={["Keyword","Volume","Difficulty","CPC","Competition","Intent","Trend"]}
                    emptyMsg='Click "Get keyword ideas" to discover opportunities.'
                    brandColor={brandColor}
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
                Competitor Keyword Analysis
              </div>
              <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-secondary)", marginBottom:"14px" }}>
                Enter a competitor domain to discover keywords they rank for that you don't — and quick-win opportunities with low competition.
              </div>
              <div style={{ display:"flex", gap:"10px", flexWrap:"wrap" }}>
                <input value={compDomain} onChange={e => setCompDomain(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") loadCompetitorKws(); }}
                  placeholder="competitor.com"
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
                  {compKwLoading ? "Analysing…" : "Analyse"}
                </button>
              </div>
            </div>

            {compKwError && (
              <div style={{ display:"flex", alignItems:"center", gap:"8px", padding:"12px 16px", background:"rgba(255,171,0,0.08)", border:"1px solid rgba(255,171,0,0.25)", borderRadius:"10px", marginBottom:"16px" }}>
                <AlertTriangle size={14} color="var(--signal-amber)" />
                <span style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--signal-amber)" }}>{compKwError}</span>
              </div>
            )}

            {(gapKws.length > 0 || oppKws.length > 0) && (
              <>
                {/* Section tabs */}
                <div style={{ display:"flex", gap:"12px", marginBottom:"16px" }}>
                  <button onClick={() => setCompSection("gap")} style={{
                    display:"flex", alignItems:"center", gap:"7px",
                    fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:500,
                    color: compSection === "gap" ? "#fff" : "var(--text-secondary)",
                    background: compSection === "gap" ? brandColor : "transparent",
                    border:`1px solid ${compSection === "gap" ? brandColor : "var(--border)"}`,
                    borderRadius:"8px", padding:"9px 18px", cursor:"pointer", transition:"all 0.16s",
                  }}>
                    <Globe2 size={13} />
                    Keyword Gap
                    <span style={{ fontFamily:"var(--font-mono)", fontSize:"10px", background:"rgba(255,255,255,0.2)", padding:"1px 6px", borderRadius:"100px" }}>{gapKws.length}</span>
                  </button>
                  <button onClick={() => setCompSection("opp")} style={{
                    display:"flex", alignItems:"center", gap:"7px",
                    fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:500,
                    color: compSection === "opp" ? "#fff" : "var(--text-secondary)",
                    background: compSection === "opp" ? "var(--signal-green)" : "transparent",
                    border:`1px solid ${compSection === "opp" ? "var(--signal-green)" : "var(--border)"}`,
                    borderRadius:"8px", padding:"9px 18px", cursor:"pointer", transition:"all 0.16s",
                  }}>
                    <Zap size={13} />
                    Quick Wins
                    <span style={{ fontFamily:"var(--font-mono)", fontSize:"10px", background:"rgba(255,255,255,0.2)", padding:"1px 6px", borderRadius:"100px" }}>{oppKws.length}</span>
                  </button>
                </div>

                {/* Section description */}
                <div style={{ padding:"12px 16px", background:"var(--muted)", borderRadius:"8px", marginBottom:"16px" }}>
                  {compSection === "gap"
                    ? <span style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-secondary)" }}>
                        Keywords <strong style={{ color:"var(--text-primary)" }}>{compDomain}</strong> ranks for that <strong style={{ color:"var(--text-primary)" }}>{domain}</strong> does not. High-volume opportunities to close the gap. Click <strong style={{ color:brandColor }}>WHY THIS?</strong> for AI analysis.
                      </span>
                    : <span style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-secondary)" }}>
                        Low-difficulty keywords (under 40) where you can rank faster. These are the easiest wins — competitor ranks but the keyword isn't heavily contested. AI analysis explains each opportunity.
                      </span>
                  }
                </div>

                {/* Table */}
                <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"12px", overflow:"hidden" }}>
                  <KwTable
                    keywords={compSection === "gap" ? gapKws : oppKws}
                    cols={["Keyword","Volume","Their Pos","Difficulty","CPC","Intent"]}
                    emptyMsg="No keywords found for this section."
                    brandColor={brandColor}
                    compDomain={compDomain}
                    yourDomain={domain}
                    showAi={true}
                  />
                </div>
              </>
            )}

            {!compKwLoading && gapKws.length === 0 && oppKws.length === 0 && !compKwError && (
              <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"12px" }}>
                <EmptyState msg="Enter a competitor domain above to see keyword gaps and quick win opportunities." brandColor={brandColor} />
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
