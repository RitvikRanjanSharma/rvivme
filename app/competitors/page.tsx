"use client";

// app/competitors/page.tsx
// =============================================================================
// RVIVME — Competitor Intelligence (Live Data)
// Fetches real competitor domains from DataForSEO
// Falls back to empty state gracefully if API is unavailable
// =============================================================================

import { useState, useEffect, useRef } from "react";
import { motion, useInView, AnimatePresence, animate } from "framer-motion";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Globe2, TrendingUp, TrendingDown, Cpu, Shield,
  ExternalLink, AlertTriangle, CheckCircle2, Plus,
  BarChart3, Link2, FileText, Zap, Eye, ArrowUpRight,
  RefreshCw, WifiOff, Loader2,
} from "lucide-react";
import { useDomain } from "@/lib/useDomain";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface LiveCompetitor {
  domain:            string;
  competitor_url:    string;
  discovered_via_ai: boolean;
  domain_authority:  number;
  monthly_traffic:   number;
  keywords:          number;
  overlap:           number;
  content_gap:       number;
  threat:            "low" | "medium" | "high" | "critical";
  trend:             "up" | "down" | "stable";
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const SP = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const;
function pv(delay = 0) {
  return { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { ...SP, delay } } };
}

function threatColor(t: LiveCompetitor["threat"]): string {
  return { low: "var(--signal-green)", medium: "var(--signal-amber)", high: "var(--brand)", critical: "var(--signal-red)" }[t];
}

function fmtNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", ...style }}>{children}</div>;
}

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

function AnimNum({ target, delay = 0 }: { target: number; delay?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const c = animate(0, target, { duration: 1.2, ease: [0.16, 1, 0.3, 1], onUpdate: n => setV(Math.round(n)) });
      return c.stop;
    }, delay * 1000);
    return () => clearTimeout(t);
  }, [target, delay]);
  return <span style={{ fontFamily: "var(--font-dm-mono), monospace" }}>{fmtNum(v)}</span>;
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px" }}>
      <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", marginBottom: "6px" }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "16px", marginBottom: "2px" }}>
          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: p.color }}>{p.name}</span>
          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-primary)", fontWeight: 500 }}>{p.value}k</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary KPIs
// ─────────────────────────────────────────────────────────────────────────────
function SummaryKpis({ competitors, loading, brandColor }: { competitors: LiveCompetitor[]; loading: boolean; brandColor: string }) {
  const avgOverlap = competitors.length > 0
    ? Math.round(competitors.reduce((s, c) => s + c.overlap, 0) / competitors.length)
    : 0;
  const totalGap = competitors.reduce((s, c) => s + c.content_gap, 0);
  const critical = competitors.filter(c => c.threat === "critical" || c.threat === "high").length;

  const kpis = [
    { label: "Competitors Found",   value: competitors.length },
    { label: "High Threat",         value: critical           },
    { label: "Avg. Keyword Overlap",value: avgOverlap, suffix: "%" },
    { label: "Total Content Gap",   value: totalGap           },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "24px" }}>
      {kpis.map((k, i) => (
        <motion.div key={k.label} variants={pv(0.08 + i * 0.07)} initial="hidden" animate="visible">
          <Panel style={{ padding: "16px 18px" }}>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <Skeleton height="28px" width="60%" />
                <Skeleton height="12px" width="80%" />
              </div>
            ) : (
              <>
                <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "24px", fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.02em", lineHeight: 1, marginBottom: "4px" }}>
                  <AnimNum target={k.value} delay={0.1 + i * 0.07} />{k.suffix ?? ""}
                </div>
                <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>{k.label}</div>
              </>
            )}
          </Panel>
        </motion.div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Radar comparison
// ─────────────────────────────────────────────────────────────────────────────
function RadarComparison({ competitor, domain, brandColor }: { competitor: LiveCompetitor; domain: string; brandColor: string }) {
  const norm = (v: number, max: number) => Math.min(100, Math.round((v / Math.max(max, 1)) * 100));
  const data = [
    { metric: "Authority",  you: 20,                                   rival: norm(competitor.domain_authority, 100) },
    { metric: "Traffic",    you: 5,                                    rival: norm(competitor.monthly_traffic, 500000) },
    { metric: "Keywords",   you: 10,                                   rival: norm(competitor.keywords, 50000) },
    { metric: "Overlap",    you: norm(competitor.overlap, 100),        rival: norm(competitor.overlap, 100) },
    { metric: "GEO Score",  you: 40,                                   rival: competitor.domain_authority > 60 ? 75 : 50 },
    { metric: "Content",    you: 15,                                   rival: 70 },
  ];

  return (
    <Panel style={{ padding: "22px 24px" }}>
      <div style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "3px" }}>Head-to-Head</div>
      <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.08em", marginBottom: "12px" }}>
        {domain.toUpperCase()} vs {competitor.domain.toUpperCase()}
      </div>
      <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
        {[{ label: "You", color: brandColor }, { label: competitor.domain, color: "var(--signal-red)" }].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div style={{ width: "10px", height: "2px", background: l.color, borderRadius: "1px" }} />
            <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)" }}>{l.label}</span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
          <PolarGrid stroke="var(--chart-grid)" />
          <PolarAngleAxis dataKey="metric" tick={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: 9, fill: "var(--chart-tick)" }} />
          <Radar name="You" dataKey="you" stroke={brandColor} fill={brandColor} fillOpacity={0.15} strokeWidth={1.5} />
          <Radar name={competitor.domain} dataKey="rival" stroke="var(--signal-red)" fill="var(--signal-red)" fillOpacity={0.10} strokeWidth={1.5} />
        </RadarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gap summary
// ─────────────────────────────────────────────────────────────────────────────
function GapSummary({ competitor, brandColor }: { competitor: LiveCompetitor; brandColor: string }) {
  const gaps = [
    { label: "Content Gap (pages)",    value: competitor.content_gap,                      icon: FileText, color: "var(--signal-amber)" },
    { label: "Keyword Gap",            value: fmtNum(Math.max(0, competitor.keywords - 10)),icon: BarChart3,color: brandColor            },
    { label: "Traffic Deficit (est.)", value: fmtNum(competitor.monthly_traffic),           icon: TrendingUp, color: "var(--signal-red)" },
  ];

  return (
    <Panel style={{ padding: "22px 24px" }}>
      <div style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "3px" }}>Gap Summary</div>
      <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.08em", marginBottom: "16px" }}>
        vs {competitor.domain.toUpperCase()} · DEFICIT
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {gaps.map(g => {
          const Icon = g.icon;
          return (
            <div key={g.label} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "7px", background: `${g.color}12`, border: `1px solid ${g.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={14} color={g.color} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", color: "var(--text-secondary)", marginBottom: "2px" }}>{g.label}</div>
                <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "18px", fontWeight: 500, color: g.color, lineHeight: 1 }}>{g.value}</div>
              </div>
            </div>
          );
        })}
      </div>
      <button style={{ marginTop: "14px", width: "100%", padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 600, color: "#fff", background: `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 60%, #000))`, border: "none", borderRadius: "8px", cursor: "pointer", boxShadow: "0 0 16px var(--brand-glow)", transition: "all 0.2s" }}>
        <Zap size={13} strokeWidth={2.5} />
        Generate Closure Strategy
      </button>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Competitor table
// ─────────────────────────────────────────────────────────────────────────────
function CompetitorTable({ competitors, loading, brandColor, selected, onSelect, onRefresh, lastUpdated }: {
  competitors: LiveCompetitor[];
  loading:     boolean;
  brandColor:  string;
  selected:    LiveCompetitor | null;
  onSelect:    (c: LiveCompetitor) => void;
  onRefresh:   () => void;
  lastUpdated: string;
}) {
  return (
    <motion.div variants={pv(0.3)} initial="hidden" animate="visible" style={{ marginBottom: "20px" }}>
      <Panel>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <span style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "11px", fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Competitor Registry · DataForSEO Live
          </span>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
              {lastUpdated}
            </span>
            <button
              onClick={onRefresh}
              disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: "5px", fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "5px", padding: "4px 10px", cursor: loading ? "not-allowed" : "pointer", letterSpacing: "0.06em" }}
            >
              <RefreshCw size={10} style={{ animation: loading ? "spin 0.7s linear infinite" : "none" }} />
              REFRESH
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                <Skeleton width="180px" height="14px" />
                <Skeleton width="60px"  height="14px" />
                <Skeleton width="50px"  height="14px" />
                <Skeleton width="70px"  height="14px" />
                <Skeleton width="60px"  height="14px" />
              </div>
            ))}
          </div>
        ) : competitors.length === 0 ? (
          <div style={{ padding: "60px 24px", textAlign: "center" }}>
            <WifiOff size={24} color="var(--text-tertiary)" style={{ margin: "0 auto 12px", display: "block" }} />
            <div style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>
              No competitors detected yet
            </div>
            <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--text-secondary)", maxWidth: "400px", margin: "0 auto" }}>
              Competitor discovery requires your domain to rank for at least a handful of keywords. As rvivme.com gains organic visibility, competitors will appear here automatically.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Domain", "Threat", "DA", "Est. Traffic", "Keywords", "Overlap", ""].map(h => (
                    <th key={h} style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", fontWeight: 500, color: "var(--text-tertiary)", letterSpacing: "0.12em", textTransform: "uppercase", padding: "10px 14px", textAlign: "left", borderBottom: "1px solid var(--border)", background: "var(--surface)", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {competitors.map((c, i) => {
                  const isSelected = selected?.domain === c.domain;
                  return (
                    <tr
                      key={c.domain}
                      onClick={() => onSelect(c)}
                      style={{ cursor: "pointer", background: isSelected ? "var(--card)" : "transparent", borderBottom: "1px solid var(--border)", transition: "background 0.15s" }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)"; }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: isSelected ? `rgba(var(--brand-rgb),0.15)` : "var(--card)", border: `1px solid ${isSelected ? `rgba(var(--brand-rgb),0.30)` : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-syne), sans-serif", fontSize: "10px", fontWeight: 700, color: isSelected ? brandColor : "var(--text-secondary)", flexShrink: 0 }}>
                            {c.domain.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{c.domain}</div>
                            <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)" }}>{c.competitor_url}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", fontWeight: 500, color: threatColor(c.threat), background: `${threatColor(c.threat)}15`, border: `1px solid ${threatColor(c.threat)}30`, padding: "2px 8px", borderRadius: "100px", letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                          {c.threat}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>{c.domain_authority}</span>
                        <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", marginLeft: "2px" }}>/100</span>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "13px", color: "var(--text-secondary)" }}>{fmtNum(c.monthly_traffic)}</div>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "13px", color: "var(--text-secondary)" }}>{fmtNum(c.keywords)}</div>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <div style={{ width: "40px", height: "4px", background: "var(--border)", borderRadius: "2px", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${c.overlap}%`, background: c.overlap > 60 ? "var(--signal-amber)" : brandColor, borderRadius: "2px" }} />
                          </div>
                          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-secondary)" }}>{c.overlap}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <a href={c.competitor_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "26px", height: "26px", background: "transparent", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text-tertiary)", textDecoration: "none", transition: "all 0.15s" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = brandColor; (e.currentTarget as HTMLElement).style.color = brandColor; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; }}
                        >
                          <ExternalLink size={11} />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)" }}>
          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
            {loading ? "DISCOVERING COMPETITORS..." : `${competitors.length} COMPETITORS DISCOVERED · DATAFORSEO LIVE`}
          </span>
        </div>
      </Panel>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function CompetitorsPage() {
  const [brandColor,   setBrandColor]   = useState("#3b82f6");
  const [competitors,  setCompetitors]  = useState<LiveCompetitor[]>([]);
  const [selected,     setSelected]     = useState<LiveCompetitor | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [lastUpdated,  setLastUpdated]  = useState("—");
  const { domain, loading: domainLoading } = useDomain();

  useEffect(() => {
    const stored = localStorage.getItem("rvivme-brand");
    if (stored) setBrandColor(stored);
  }, []);

  async function fetchCompetitors() {
    if (domainLoading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/dataforseo/competitors", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ domain, limit: 10 }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Unknown error");

      setCompetitors(data.competitors);
      if (data.competitors.length > 0) setSelected(data.competitors[0]);
      setLastUpdated(`UPDATED ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} GMT`);
    } catch (err: any) {
      setError(err.message);
      setCompetitors([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!domainLoading) fetchCompetitors();
  }, [domain, domainLoading]);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "32px 24px 80px", maxWidth: "1280px", margin: "0 auto" }}>

      {/* Header */}
      <motion.div variants={pv(0)} initial="hidden" animate="visible" style={{ marginBottom: "24px" }}>
        <h1 style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "clamp(1.5rem,3vw,2rem)", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1, marginBottom: "6px" }}>
          Competitor Intelligence
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
            {domainLoading ? "LOADING DOMAIN..." : domain.toUpperCase()}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: loading ? "var(--signal-amber)" : "var(--signal-green)", boxShadow: `0 0 8px ${loading ? "rgba(255,171,0,0.5)" : "rgba(0,230,118,0.5)"}` }} />
            <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: loading ? "var(--signal-amber)" : "var(--signal-green)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {loading ? "Discovering" : "Live · DataForSEO"}
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
              {error} — Check your DataForSEO credentials in Settings.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <SummaryKpis competitors={competitors} loading={loading} brandColor={brandColor} />
      <CompetitorTable competitors={competitors} loading={loading} brandColor={brandColor} selected={selected} onSelect={setSelected} onRefresh={fetchCompetitors} lastUpdated={lastUpdated} />

      {/* Detail panels — only show when competitor selected */}
      <AnimatePresence mode="wait">
        {selected && !loading && (
          <motion.div
            key={selected.domain}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}
          >
            <RadarComparison competitor={selected} domain={domain} brandColor={brandColor} />
            <GapSummary competitor={selected} brandColor={brandColor} />
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
