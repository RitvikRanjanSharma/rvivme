"use client";

// app/dashboard/gsc-panel.tsx
// =============================================================================
// AI Marketing Lab — Google Search Console Panel
// Shows: impressions, clicks, CTR, avg position, top queries, top pages, trend
// =============================================================================

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Search, MousePointerClick, TrendingUp, TrendingDown,
  RefreshCw, AlertTriangle, Eye, Hash,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface GSCSummary {
  clicks:      number;
  impressions: number;
  ctr:         number;
  position:    number;
}

interface GSCQuery {
  query:       string;
  clicks:      number;
  impressions: number;
  ctr:         number;
  position:    number;
}

interface GSCPage {
  page:        string;
  clicks:      number;
  impressions: number;
  ctr:         number;
  position:    number;
}

interface GSCTrendPoint {
  date:        string;
  clicks:      number;
  impressions: number;
  ctr:         number;
  position:    number;
}

interface GSCData {
  success:    boolean;
  summary:    GSCSummary;
  topQueries: GSCQuery[];
  topPages:   GSCPage[];
  trend:      GSCTrendPoint[];
  period:     string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function positionColor(pos: number): string {
  if (pos <= 3)  return "var(--signal-green)";
  if (pos <= 10) return "var(--signal-amber)";
  return "var(--text-tertiary)";
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", ...style }}>{children}</div>;
}

function Skeleton({ width = "100%", height = "16px" }: { width?: string; height?: string }) {
  return <div style={{ width, height, background: "linear-gradient(90deg, var(--card) 25%, var(--muted) 50%, var(--card) 75%)", backgroundSize: "200% 100%", borderRadius: "4px", animation: "shimmer 1.4s ease-in-out infinite" }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI card
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, color, loading, hint }: {
  label: string; value: string; icon: React.ElementType;
  color: string; loading: boolean; hint?: string;
}) {
  return (
    <Panel style={{ padding: "18px 20px" }}>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Skeleton height="28px" width="55%" />
          <Skeleton height="12px" width="70%" />
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: `${color}15`, border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon size={15} color={color} />
            </div>
            {hint && <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>{hint}</span>}
          </div>
          <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "22px", fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.02em", lineHeight: 1, marginBottom: "4px" }}>
            {value}
          </div>
          <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>
            {label}
          </div>
        </>
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend chart — clicks + impressions
// ─────────────────────────────────────────────────────────────────────────────
function GscTrendChart({ data, brandColor, loading }: { data: GSCTrendPoint[]; brandColor: string; loading: boolean }) {
  const chartData = data.map(d => ({ ...d, dateLabel: fmtDate(d.date) }));

  return (
    <Panel style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <div style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>
            Search Performance · Last 28 Days
          </div>
          <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
            LIVE · GOOGLE SEARCH CONSOLE
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          {[{ label: "Clicks", color: brandColor }, { label: "Impressions", color: "rgba(148,163,184,0.5)" }].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <div style={{ width: "10px", height: "2px", background: l.color, borderRadius: "1px" }} />
              <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)" }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ height: "160px" }}><Skeleton height="100%" /></div>
      ) : chartData.length === 0 ? (
        <div style={{ height: "160px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-tertiary)" }}>No search data yet — GSC takes a few days to populate</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={chartData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gsc-clicks" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={brandColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={brandColor} stopOpacity={0}    />
              </linearGradient>
              <linearGradient id="gsc-impressions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="rgba(148,163,184,1)" stopOpacity={0.12} />
                <stop offset="100%" stopColor="rgba(148,163,184,1)" stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="dateLabel" tick={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: 9, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} interval={6} />
            <YAxis tick={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: 9, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} tickFormatter={fmtNum} />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px" }}
              labelStyle={{ color: "var(--text-tertiary)", marginBottom: "4px" }}
            />
            <Area type="monotone" dataKey="impressions" name="Impressions" stroke="rgba(148,163,184,0.5)" strokeWidth={1} fill="url(#gsc-impressions)" dot={false} />
            <Area type="monotone" dataKey="clicks"      name="Clicks"      stroke={brandColor}            strokeWidth={1.5} fill="url(#gsc-clicks)"      dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Top queries table
// ─────────────────────────────────────────────────────────────────────────────
function TopQueries({ queries, loading }: { queries: GSCQuery[]; loading: boolean }) {
  return (
    <Panel style={{ padding: "20px 22px" }}>
      <div style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "14px" }}>
        Top Search Queries
      </div>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[1,2,3,4,5].map(i => <Skeleton key={i} height="28px" />)}
        </div>
      ) : queries.length === 0 ? (
        <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.6 }}>
          No query data yet.<br />GSC typically shows data within 2–4 days of launch.
        </div>
      ) : (
        <>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 48px 64px 48px 52px", gap: "0 8px", marginBottom: "6px" }}>
            {["Query", "Clicks", "Impr.", "CTR", "Pos."].map(h => (
              <span key={h} style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: h !== "Query" ? "right" : "left" }}>{h}</span>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {queries.map((q, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 48px 64px 48px 52px", gap: "0 8px", padding: "6px 0", borderTop: "1px solid var(--border)" }}>
                <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.query}</span>
                <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-primary)", textAlign: "right" }}>{fmtNum(q.clicks)}</span>
                <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-secondary)", textAlign: "right" }}>{fmtNum(q.impressions)}</span>
                <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-secondary)", textAlign: "right" }}>{q.ctr}%</span>
                <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: positionColor(q.position), textAlign: "right", fontWeight: 500 }}>{q.position}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Top pages
// ─────────────────────────────────────────────────────────────────────────────
function TopPages({ pages, loading }: { pages: GSCPage[]; loading: boolean }) {
  return (
    <Panel style={{ padding: "20px 22px" }}>
      <div style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "14px" }}>
        Top Landing Pages
      </div>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[1,2,3,4,5].map(i => <Skeleton key={i} height="28px" />)}
        </div>
      ) : pages.length === 0 ? (
        <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-tertiary)" }}>No page data yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {pages.map((page, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 0", borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "2px" }}>
                  {page.page || "/"}
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)" }}>{fmtNum(page.impressions)} impr.</span>
                  <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)" }}>{page.ctr}% CTR</span>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{fmtNum(page.clicks)}</div>
                <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>CLICKS</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, minWidth: "32px" }}>
                <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "13px", fontWeight: 500, color: positionColor(page.position) }}>{page.position}</div>
                <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>POS</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main GSC Panel export
// ─────────────────────────────────────────────────────────────────────────────
export function GSCPanel({ brandColor }: { brandColor: string }) {
  const [data,        setData]        = useState<GSCData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState("—");

  async function fetchGSC() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gsc");
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Unknown error");
      setData(json);
      setLastUpdated(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " GMT");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchGSC(); }, []);

  const summary = data?.summary;

  return (
    <div>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "11px", fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Google Search Console · Live
          </span>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: loading ? "var(--signal-amber)" : error ? "var(--signal-red)" : "var(--signal-green)", boxShadow: `0 0 6px ${loading ? "rgba(255,171,0,0.5)" : error ? "rgba(255,23,68,0.5)" : "rgba(0,230,118,0.5)"}` }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
            UPDATED {lastUpdated}
          </span>
          <button onClick={fetchGSC} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "4px", fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "5px", padding: "4px 8px", cursor: "pointer", letterSpacing: "0.06em" }}>
            <RefreshCw size={9} style={{ animation: loading ? "spin 0.7s linear infinite" : "none" }} />
            REFRESH
          </button>
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "rgba(255,171,0,0.07)", border: "1px solid rgba(255,171,0,0.25)", borderRadius: "8px", marginBottom: "14px" }}
          >
            <AlertTriangle size={13} color="var(--signal-amber)" />
            <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", color: "var(--signal-amber)" }}>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "14px" }}>
        <KpiCard label="Total Clicks (28d)"       value={summary ? fmtNum(summary.clicks)      : "—"} icon={MousePointerClick} color={brandColor}           loading={loading} />
        <KpiCard label="Impressions (28d)"        value={summary ? fmtNum(summary.impressions)  : "—"} icon={Eye}               color="var(--signal-green)"  loading={loading} />
        <KpiCard label="Click-Through Rate"       value={summary ? `${summary.ctr}%`            : "—"} icon={TrendingUp}        color="var(--signal-amber)"  loading={loading} hint="AVG" />
        <KpiCard label="Average Position"         value={summary ? `#${summary.position}`       : "—"} icon={Hash}              color="var(--brand)"         loading={loading} hint="SERP" />
      </div>

      {/* Trend chart — full width */}
      <div style={{ marginBottom: "14px" }}>
        <GscTrendChart data={data?.trend ?? []} brandColor={brandColor} loading={loading} />
      </div>

      {/* Bottom row — queries + pages */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <TopQueries queries={data?.topQueries ?? []} loading={loading} />
        <TopPages   pages={data?.topPages    ?? []} loading={loading} />
      </div>

      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes spin    { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}