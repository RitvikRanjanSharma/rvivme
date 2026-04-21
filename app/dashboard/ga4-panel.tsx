"use client";

// app/dashboard/ga4-panel.tsx
// =============================================================================
// AI Marketing Lab — GA4 Live Data Panel
// Drop this into the dashboard. Fetches from /api/ga4 on mount.
// Shows: sessions, users, bounce rate, avg session, top pages, sources
// =============================================================================

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";
import {
  Users, Eye, MousePointerClick, Clock,
  TrendingUp, RefreshCw, AlertTriangle, ExternalLink,
  Zap, Activity,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface GA4Summary {
  sessions:       number;
  users:          number;
  pageviews:      number;
  bounceRate:     number;
  avgSessionSecs: number;
  newUsers:       number;
}

interface GA4TrendPoint {
  date:     string;
  sessions: number;
  users:    number;
}

interface GA4Page {
  path:      string;
  pageviews: number;
  sessions:  number;
}

interface GA4Source {
  channel:  string;
  sessions: number;
  pct:      number;
}

interface GA4Data {
  success:  boolean;
  summary:  GA4Summary;
  trend:    GA4TrendPoint[];
  topPages: GA4Page[];
  sources:  GA4Source[];
  period:   string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}m ${s}s`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", ...style }}>{children}</div>;
}

function Skeleton({ width = "100%", height = "16px" }: { width?: string; height?: string }) {
  return (
    <div style={{ width, height, background: "linear-gradient(90deg, var(--card) 25%, var(--muted) 50%, var(--card) 75%)", backgroundSize: "200% 100%", borderRadius: "4px", animation: "shimmer 1.4s ease-in-out infinite" }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI card
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, color, loading }: {
  label:   string;
  value:   string;
  icon:    React.ElementType;
  color:   string;
  loading: boolean;
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
// Trend chart
// ─────────────────────────────────────────────────────────────────────────────
function TrendChart({ data, brandColor, loading }: { data: GA4TrendPoint[]; brandColor: string; loading: boolean }) {
  const chartData = data.map(d => ({ ...d, dateLabel: fmtDate(d.date) }));

  return (
    <Panel style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <div style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>
            Sessions & Users · Last 30 Days
          </div>
          <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
            LIVE · GOOGLE ANALYTICS 4
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          {[{ label: "Sessions", color: brandColor }, { label: "Users", color: "var(--signal-green)" }].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <div style={{ width: "10px", height: "2px", background: l.color, borderRadius: "1px" }} />
              <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)" }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ height: "180px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Skeleton height="140px" />
        </div>
      ) : chartData.length === 0 ? (
        <div style={{ height: "180px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-tertiary)" }}>No data yet</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="ga4-sessions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={brandColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={brandColor} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="ga4-users" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--signal-green)" stopOpacity={0.15} />
                <stop offset="100%" stopColor="var(--signal-green)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="dateLabel" tick={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: 9, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} interval={6} />
            <YAxis tick={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: 9, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} tickFormatter={fmtNum} />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px" }}
              labelStyle={{ color: "var(--text-tertiary)", marginBottom: "4px" }}
            />
            <Area type="monotone" dataKey="sessions" name="Sessions" stroke={brandColor} strokeWidth={1.5} fill="url(#ga4-sessions)" dot={false} />
            <Area type="monotone" dataKey="users" name="Users" stroke="var(--signal-green)" strokeWidth={1.5} fill="url(#ga4-users)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Top pages
// ─────────────────────────────────────────────────────────────────────────────
function TopPages({ pages, loading }: { pages: GA4Page[]; loading: boolean }) {
  const max = pages[0]?.pageviews ?? 1;
  return (
    <Panel style={{ padding: "20px 22px" }}>
      <div style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "14px" }}>
        Top Pages
      </div>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[1,2,3,4,5].map(i => <Skeleton key={i} height="32px" />)}
        </div>
      ) : pages.length === 0 ? (
        <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-tertiary)" }}>No page data yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {pages.map((page, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "3px" }}>
                  {page.path}
                </div>
                <div style={{ height: "3px", background: "var(--border)", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.round((page.pageviews / max) * 100)}%`, background: "var(--brand)", borderRadius: "2px" }} />
                </div>
              </div>
              <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-secondary)", flexShrink: 0 }}>
                {fmtNum(page.pageviews)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Traffic sources
// ─────────────────────────────────────────────────────────────────────────────
function TrafficSources({ sources, brandColor, loading }: { sources: GA4Source[]; brandColor: string; loading: boolean }) {
  const COLORS = [brandColor, "var(--signal-green)", "var(--signal-amber)", "var(--signal-red)", "#8b5cf6", "#06b6d4"];
  return (
    <Panel style={{ padding: "20px 22px" }}>
      <div style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "14px" }}>
        Traffic Sources
      </div>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[1,2,3,4].map(i => <Skeleton key={i} height="28px" />)}
        </div>
      ) : sources.length === 0 ? (
        <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-tertiary)" }}>No source data yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {sources.map((src, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: COLORS[i] ?? "var(--text-tertiary)", flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", color: "var(--text-secondary)", flex: 1 }}>{src.channel}</span>
              <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-primary)", fontWeight: 500 }}>{src.pct}%</span>
              <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)" }}>{fmtNum(src.sessions)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main GA4 Panel export
// ─────────────────────────────────────────────────────────────────────────────
export function GA4Panel({ brandColor }: { brandColor: string }) {
  const [data,        setData]        = useState<GA4Data | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState("—");

  async function fetchGA4() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ga4");
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

  useEffect(() => { fetchGA4(); }, []);

  const summary = data?.summary;

  return (
    <div>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "11px", fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Google Analytics 4 · Live
          </span>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: loading ? "var(--signal-amber)" : "var(--signal-green)", boxShadow: `0 0 6px ${loading ? "rgba(255,171,0,0.5)" : "rgba(0,230,118,0.5)"}` }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
            UPDATED {lastUpdated}
          </span>
          <button
            onClick={fetchGA4}
            disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: "4px", fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "5px", padding: "4px 8px", cursor: "pointer", letterSpacing: "0.06em" }}
          >
            <RefreshCw size={9} style={{ animation: loading ? "spin 0.7s linear infinite" : "none" }} />
            REFRESH
          </button>
        </div>
      </div>

      {/* Error state */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "rgba(255,171,0,0.07)", border: "1px solid rgba(255,171,0,0.25)", borderRadius: "8px", marginBottom: "14px" }}
          >
            <AlertTriangle size={13} color="var(--signal-amber)" />
            <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", color: "var(--signal-amber)" }}>
              {error}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "14px" }}>
        <KpiCard label="Sessions (30d)"       value={summary ? fmtNum(summary.sessions)            : "—"} icon={Activity}          color={brandColor}            loading={loading} />
        <KpiCard label="Users (30d)"          value={summary ? fmtNum(summary.users)               : "—"} icon={Users}             color="var(--signal-green)"   loading={loading} />
        <KpiCard label="Pageviews (30d)"      value={summary ? fmtNum(summary.pageviews)           : "—"} icon={Eye}               color="var(--signal-amber)"   loading={loading} />
        <KpiCard label="Avg. Session"         value={summary ? fmtDuration(summary.avgSessionSecs) : "—"} icon={Clock}             color="var(--brand)"          loading={loading} />
      </div>

      {/* Trend chart — full width */}
      <div style={{ marginBottom: "14px" }}>
        <TrendChart data={data?.trend ?? []} brandColor={brandColor} loading={loading} />
      </div>

      {/* Bottom row — top pages + sources */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <TopPages    pages={data?.topPages ?? []} loading={loading} />
        <TrafficSources sources={data?.sources ?? []} brandColor={brandColor} loading={loading} />
      </div>

      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes spin    { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}