"use client";

// app/dashboard/page.tsx
// =============================================================================
// AI Marketing Lab — Intelligence Dashboard v2
// Real GA4 + GSC data · AI-generated strategies · GEO tracking · Backlinks
// =============================================================================

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { motion, useInView, animate, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, CheckCircle2, TrendingUp, TrendingDown,
  Activity, Globe2, ShieldCheck, Cpu, Zap,
  ArrowRight, RefreshCw, AlertCircle, XCircle,
  Link2, Brain, Eye, Search, ArrowUpRight,
} from "lucide-react";
import { GA4Panel }  from "./ga4-panel";
import { GSCPanel }  from "./gsc-panel";
import { useDomain } from "@/lib/useDomain";
import {
  saveAndActivateStrategy, getActiveStrategy,
  type Strategy as SavedStrategy, type BaselineMetrics,
} from "@/lib/strategies";

// ── Types ──────────────────────────────────────────────────────────────────────
interface TrafficDataPoint {
  month: string; actual: number|null; forecast: number|null;
  lower: number|null; upper: number|null;
}
interface GA4TrendPoint { date: string; sessions: number; users: number; }
interface Strategy {
  title: string; rationale: string;
  impact: number; effort: number; timeframe: string; category: string;
}
interface GeoResult {
  keyword: string; cited: boolean;
  answer: string; mentioned: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const SP = { type: "spring" as const, stiffness: 260, damping: 30, mass: 0.9 };
function pv(delay: number) {
  return { hidden: { opacity:0, y:16 }, visible: { opacity:1, y:0, transition: { ...SP, delay } } };
}
function formatK(n: number) { return n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n); }
function impactColor(s: number) { return s>=8.5?"var(--signal-green)":s>=6.5?"var(--brand)":"var(--signal-amber)"; }
function effortColor(s: number)  { return s>=7.5?"var(--signal-red)":s>=5.0?"var(--signal-amber)":"var(--signal-green)"; }

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"12px", ...style }}>{children}</div>;
}

// ── Active strategy banner ────────────────────────────────────────────────────
// Sits above the data panels. Surfaces the currently active strategy and links
// straight into its plan view. If nothing is active, renders nothing.
function ActiveStrategyBanner({ brandColor }: { brandColor: string }) {
  const [active,  setActive]  = useState<SavedStrategy | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await getActiveStrategy();
        if (alive) setActive(s);
      } catch { /* probably no auth yet; hide silently */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (loading || !active) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        gap:"12px", flexWrap:"wrap",
        background: "var(--surface)",
        border: `1px solid rgba(var(--brand-rgb), 0.40)`,
        borderRadius: "14px",
        padding: "16px 20px", marginBottom: "20px",
        position:"relative", overflow:"hidden",
        boxShadow: "0 0 22px var(--brand-glow)",
      }}
    >
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2,
        background: `linear-gradient(90deg, transparent, ${brandColor}, transparent)` }}/>
      <div style={{ display:"flex", alignItems:"center", gap:"12px", minWidth:0, flex:1 }}>
        <span style={{
          display:"inline-flex", alignItems:"center", justifyContent:"center",
          fontFamily:"var(--font-mono)", fontSize:"11px", fontWeight:600, letterSpacing:"0.08em",
          color:brandColor, background:"rgba(var(--brand-rgb), 0.12)",
          border:"1px solid rgba(var(--brand-rgb), 0.35)",
          padding:"4px 10px", borderRadius:7, minWidth:38, textAlign:"center",
        }}>{active.acronym ?? "STR"}</span>
        <div style={{ minWidth:0 }}>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:10, letterSpacing:"0.12em",
            color:brandColor, textTransform:"uppercase", marginBottom:3 }}>
            Active strategy
          </div>
          <div style={{
            fontFamily:"var(--font-body)", fontSize:14, fontWeight:600, color:"var(--text-primary)",
            lineHeight:1.3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
          }}>{active.title}</div>
        </div>
      </div>
      <Link href={`/strategies/${active.id}`} style={{
        display:"inline-flex", alignItems:"center", gap:6,
        fontFamily:"var(--font-body)", fontSize:12, fontWeight:500,
        color:"#fff", background:brandColor, textDecoration:"none",
        borderRadius:7, padding:"7px 14px", flexShrink:0,
      }}>
        Open plan <ArrowUpRight size={12}/>
      </Link>
    </motion.div>
  );
}
function SectionLabel({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"14px" }}>
      <span style={{ fontFamily:"var(--font-mono)", fontSize:"11px", fontWeight:600, color:"var(--text-tertiary)", letterSpacing:"0.12em", textTransform:"uppercase" }}>{label}</span>
      {action}
    </div>
  );
}

// ── Animated number ────────────────────────────────────────────────────────────
function AnimatedNumber({ target, decimals=0, delay=0 }: { target:number; decimals?:number; delay?:number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const ctrl = animate(0, target, { duration:1.4, ease:[0.16,1,0.3,1], onUpdate:v=>setDisplay(parseFloat(v.toFixed(decimals))) });
      return ctrl.stop;
    }, delay*1000);
    return () => clearTimeout(t);
  }, [target, decimals, delay]);
  return <span style={{ fontFamily:"var(--font-mono)" }}>{decimals>0?display.toFixed(decimals):Math.round(display).toLocaleString()}</span>;
}

// ── Forecast model ─────────────────────────────────────────────────────────────
function buildChartData(trend: GA4TrendPoint[]) {
  if (trend.length === 0) {
    // No GA4 data connected — return an empty, zeroed structure so the UI
    // can show a proper empty state. Absolutely no fabricated traffic numbers.
    return {
      data:         [] as TrafficDataPoint[],
      currentMTD:   0,
      forecast6M:   0,
      growthPct:    0,
      confidence:   0,
      handoffMonth: "",
    };
  }

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthly: Record<string,number[]> = {};
  trend.forEach(p => {
    const d = new Date(p.date);
    const k = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    if (!monthly[k]) monthly[k] = [];
    monthly[k].push(p.sessions);
  });

  const historicalData: TrafficDataPoint[] = Object.entries(monthly).map(([month, sessions]) => ({
    month: month.split(" ")[0], actual: sessions.reduce((a,b)=>a+b,0),
    forecast:null, lower:null, upper:null,
  }));

  const values = historicalData.map(d => d.actual ?? 0).filter(v=>v>0);
  const last    = values[values.length-1] ?? 0;
  const growthRates = values.slice(1).map((v,i) => v/Math.max(values[i],1));
  const geoMean = growthRates.length > 0
    ? Math.pow(growthRates.reduce((a,b)=>a*b,1), 1/growthRates.length) : 1.05;
  const clampedRate = Math.max(0.97, Math.min(1.30, geoMean));
  const handoffMonth = historicalData[historicalData.length-1]?.month ?? "";

  historicalData[historicalData.length-1] = {
    ...historicalData[historicalData.length-1],
    forecast: last, lower: Math.round(last*0.92), upper: Math.round(last*1.08),
  };

  const now = new Date();
  const forecastData: TrafficDataPoint[] = Array.from({length:6},(_,i) => {
    const fd = new Date(now.getFullYear(), now.getMonth()+i+1, 1);
    const fv = Math.round(last*Math.pow(clampedRate,i+1));
    const u  = 0.06+i*0.04;
    return { month: MONTHS[fd.getMonth()]+(i===5?"+":" ").trim(), actual:null, forecast:fv, lower:Math.round(fv*(1-u)), upper:Math.round(fv*(1+u)) };
  });

  const forecast6M = forecastData[5]?.forecast ?? last;
  return {
    data: [...historicalData,...forecastData],
    currentMTD: last, forecast6M,
    growthPct: Math.round(((forecast6M-last)/Math.max(last,1))*100),
    confidence: Math.max(60, Math.min(92, 92-values.length*2)),
    handoffMonth,
  };
}

// ── Chart tooltip ──────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:"8px", padding:"10px 14px" }}>
      <div style={{ fontFamily:"var(--font-mono)", fontSize:"10px", color:"var(--text-tertiary)", letterSpacing:"0.1em", marginBottom:"8px", textTransform:"uppercase" }}>{label}</div>
      {payload.map((p: any) => p.value!=null ? (
        <div key={p.name} style={{ display:"flex", justifyContent:"space-between", gap:"20px", marginBottom:"3px" }}>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:"11px", color:p.color }}>{p.name}</span>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:"12px", fontWeight:500, color:"var(--text-primary)" }}>{Number(p.value).toLocaleString()}</span>
        </div>
      ):null)}
    </div>
  );
}

// ── Score bar ──────────────────────────────────────────────────────────────────
function ScoreBar({ value, max=10, color, label }: { value:number; max?:number; color:string; label:string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
      <span style={{ fontFamily:"var(--font-mono)", fontSize:"10px", color:"var(--text-tertiary)", width:"46px", flexShrink:0 }}>{label}</span>
      <div style={{ flex:1, height:"4px", background:"var(--border)", borderRadius:"2px", overflow:"hidden" }}>
        <motion.div initial={{ width:0 }} animate={{ width:`${(value/max)*100}%` }} transition={{ duration:0.8, ease:[0.16,1,0.3,1], delay:0.3 }} style={{ height:"100%", background:color, borderRadius:"2px" }} />
      </div>
      <span style={{ fontFamily:"var(--font-mono)", fontSize:"12px", fontWeight:500, color, width:"26px", textAlign:"right", flexShrink:0 }}>{value.toFixed(1)}</span>
    </div>
  );
}

// ── Connection banner ──────────────────────────────────────────────────────────
// `reason` is forwarded from /api/ga4 and /api/gsc and distinguishes the two
// failure modes:
//   "not_configured" → the user hasn't stored a property ID yet.
//   "api_error"      → they stored one but Google rejected the call (usually
//                      because the shared service account doesn't have Viewer
//                      access on that property, or the URL is mis-formatted).
type ConnReason = null | "not_configured" | "api_error";
function ConnectionBanner({
  ga4Connected, gscConnected,
  ga4Reason,    gscReason,
  ga4Message,   gscMessage,
}: {
  ga4Connected: boolean; gscConnected: boolean;
  ga4Reason:    ConnReason; gscReason:  ConnReason;
  ga4Message:   string | null; gscMessage: string | null;
}) {
  if (ga4Connected && gscConnected) return null;

  // Build a single line that speaks to what is actually wrong.
  const lines: string[] = [];
  if (!ga4Connected) {
    if (ga4Reason === "api_error") {
      lines.push(`GA4 connection error — ${ga4Message ?? "check service account access."}`);
    } else {
      lines.push("Google Analytics 4 not configured.");
    }
  }
  if (!gscConnected) {
    if (gscReason === "api_error") {
      lines.push(`Search Console connection error — ${gscMessage ?? "check service account access."}`);
    } else {
      lines.push("Google Search Console not configured.");
    }
  }

  return (
    <motion.div initial={{ opacity:0,y:-10 }} animate={{ opacity:1,y:0 }}
      style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", padding:"10px 16px", background:"rgba(255,171,0,0.06)", border:"1px solid rgba(255,171,0,0.20)", borderRadius:"10px", marginBottom:"20px", gap:"12px", flexWrap:"wrap" }}
    >
      <div style={{ display:"flex", alignItems:"flex-start", gap:"8px", minWidth: 0 }}>
        <AlertTriangle size={14} color="var(--signal-amber)" style={{ marginTop: "2px", flexShrink: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
          <span style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--signal-amber)", fontWeight:500 }}>
            Data limited
          </span>
          {lines.map((l, i) => (
            <span key={i} style={{ fontFamily:"var(--font-body)", fontSize:"12px", color:"var(--signal-amber)", opacity: 0.9 }}>
              {l}
            </span>
          ))}
        </div>
      </div>
      <a href="/settings?tab=integrations" style={{ display:"flex", alignItems:"center", gap:"5px", fontFamily:"var(--font-body)", fontSize:"12px", fontWeight:600, color:"var(--signal-amber)", background:"rgba(255,171,0,0.10)", border:"1px solid rgba(255,171,0,0.25)", borderRadius:"6px", padding:"5px 12px", cursor:"pointer", textDecoration:"none", whiteSpace:"nowrap" }}>
        Configure <ArrowRight size={11} />
      </a>
    </motion.div>
  );
}

// ── Projection chart ───────────────────────────────────────────────────────────
function ProjectionChart({ brandColor, ga4Trend, ga4Loading }: { brandColor:string; ga4Trend:GA4TrendPoint[]; ga4Loading:boolean }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const inView   = useInView(chartRef, { once:true, margin:"-60px" });
  const { data, currentMTD, forecast6M, growthPct, confidence, handoffMonth } = buildChartData(ga4Trend);
  const isReal = ga4Trend.length > 0;

  // Empty-state — GA4 not connected and not currently loading.
  if (!isReal && !ga4Loading) {
    return (
      <motion.div ref={chartRef} variants={pv(0.2)} initial="hidden" animate="visible">
        <Panel style={{ padding:"32px 24px" }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-start", gap:"4px", marginBottom:"20px" }}>
            <div style={{ fontFamily:"var(--font-body)", fontSize:"15px", fontWeight:600, color:"var(--text-primary)" }}>
              Organic Traffic · 6-Month AI Projection
            </div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:"11px", color:"var(--text-tertiary)", letterSpacing:"0.08em" }}>
              AWAITING GA4 CONNECTION
            </div>
          </div>

          <div style={{
            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
            padding:"44px 24px", background:"var(--card)", border:"1px dashed var(--border)",
            borderRadius:"10px", textAlign:"center", gap:"10px",
          }}>
            <Activity size={18} color="var(--text-tertiary)" />
            <div style={{ fontFamily:"var(--font-body)", fontSize:"14px", fontWeight:500, color:"var(--text-primary)" }}>
              No traffic data yet
            </div>
            <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-secondary)", lineHeight:1.6, maxWidth:"460px" }}>
              Connect Google Analytics 4 to see your actual sessions projected six months forward with honest confidence intervals.
            </div>
            <a href="/settings?tab=integrations" style={{
              display:"inline-flex", alignItems:"center", gap:"6px",
              fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:500,
              color:"#fff", background:brandColor, textDecoration:"none",
              padding:"8px 18px", borderRadius:"100px", marginTop:"4px",
              transition:"opacity 0.16s",
            }}>
              Connect GA4 <ArrowRight size={12}/>
            </a>
          </div>
        </Panel>
      </motion.div>
    );
  }

  return (
    <motion.div ref={chartRef} variants={pv(0.2)} initial="hidden" animate="visible">
      <Panel style={{ padding:"24px 24px 16px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"24px", flexWrap:"wrap", gap:"12px" }}>
          <div>
            <div style={{ fontFamily:"var(--font-body)", fontSize:"15px", fontWeight:600, color:"var(--text-primary)", marginBottom:"4px" }}>
              Organic Traffic · 6-Month AI Projection
            </div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:"11px", color:isReal?"var(--signal-green)":"var(--text-tertiary)", letterSpacing:"0.08em" }}>
              {ga4Loading?"LOADING GA4 DATA…":`LIVE GA4 · AI FORECAST v1.0 · ${confidence}% CONFIDENCE`}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"16px" }}>
            {[{label:"Historical",dashed:false,color:brandColor},{label:"Forecast",dashed:true,color:brandColor},{label:"CI Band",dashed:false,color:"var(--border)"}].map(({label,dashed,color})=>(
              <div key={label} style={{ display:"flex", alignItems:"center", gap:"5px" }}>
                <svg width="18" height="10"><line x1="0" y1="5" x2="18" y2="5" stroke={color} strokeWidth={dashed?1.5:2} strokeDasharray={dashed?"4 3":undefined} opacity={label==="CI Band"?0.6:1}/></svg>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:"10px", color:"var(--text-tertiary)", letterSpacing:"0.06em" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top:4, right:4, left:-8, bottom:0 }}>
            <defs>
              <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={brandColor} stopOpacity={0.28}/>
                <stop offset="100%" stopColor={brandColor} stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="grad2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={brandColor} stopOpacity={0.14}/>
                <stop offset="100%" stopColor={brandColor} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="2 6" vertical={false}/>
            <XAxis dataKey="month" tick={{ fontFamily:"var(--font-mono)", fontSize:10, fill:"var(--text-tertiary)" }} axisLine={{ stroke:"var(--border)" }} tickLine={false}/>
            <YAxis tick={{ fontFamily:"var(--font-mono)", fontSize:10, fill:"var(--text-tertiary)" }} axisLine={false} tickLine={false} tickFormatter={formatK}/>
            <Tooltip content={<ChartTooltip/>}/>
            <Area type="monotone" dataKey="upper"    stroke="none" fill="url(#grad2)" fillOpacity={0.4} dot={false} legendType="none" animationDuration={inView?1200:0}/>
            <Area type="monotone" dataKey="lower"    stroke="none" fill="var(--bg)"   fillOpacity={1}   dot={false} legendType="none" animationDuration={inView?1200:0}/>
            <Area type="monotone" dataKey="actual"   name="Historical"  stroke={brandColor} strokeWidth={2} fill="url(#grad1)" dot={false} activeDot={{ r:4, fill:brandColor, stroke:"var(--bg)", strokeWidth:2 }} animationDuration={inView?1000:0}/>
            <Area type="monotone" dataKey="forecast" name="AI Forecast" stroke={brandColor} strokeWidth={1.5} strokeDasharray="5 4" strokeOpacity={0.75} fill="none" dot={false} activeDot={{ r:3 }} animationDuration={inView?1400:0}/>
            <ReferenceLine x={handoffMonth} stroke="var(--text-tertiary)" strokeDasharray="2 4" strokeWidth={1} label={{ value:"FORECAST →", position:"top", fontFamily:"var(--font-mono)", fontSize:9, fill:"var(--text-tertiary)", dy:-6 }}/>
          </AreaChart>
        </ResponsiveContainer>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"1px", background:"var(--border)", borderTop:"1px solid var(--border)", marginTop:"20px", borderRadius:"0 0 10px 10px", overflow:"hidden" }}>
          {[{label:"Current MTD",value:currentMTD,suffix:""},{label:"Forecast +6M",value:forecast6M,suffix:""},{label:"Growth",value:growthPct,suffix:"%"},{label:"Confidence",value:confidence,suffix:"%"}].map((s,i)=>(
            <div key={s.label} style={{ background:"var(--surface)", padding:"14px 16px", textAlign:"center" }}>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:"18px", fontWeight:500, color:"var(--text-primary)", letterSpacing:"-0.02em", marginBottom:"3px" }}>
                {ga4Loading?"—":<><AnimatedNumber target={s.value} decimals={s.suffix==="%"?1:0} delay={0.4+i*0.08}/>{s.suffix}</>}
              </div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:"9px", color:"var(--text-tertiary)", letterSpacing:"0.1em", textTransform:"uppercase" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </Panel>
    </motion.div>
  );
}

// ── Backlinks panel ────────────────────────────────────────────────────────────
function BacklinksPanel({ brandColor, domain }: { brandColor:string; domain:string }) {
  const [data,       setData]       = useState<any>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string|null>(null);
  const [planLocked, setPlanLocked] = useState(false);

  useEffect(() => {
    if (!domain) return;
    setLoading(true);
    setError(null);
    setPlanLocked(false);
    fetch(`/api/dataforseo/backlinks?domain=${encodeURIComponent(domain)}`)
      .then(r=>r.json())
      .then(d => {
        if (d.success) {
          setData(d);
        } else if (d.reason === "plan_access") {
          setPlanLocked(true);
        } else {
          setError(d.error ?? d.message ?? "Unable to load backlink data");
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [domain]);

  const kpis = data ? [
    { label: "Backlinks",         value: data.backlinks?.toLocaleString()       ?? "0" },
    { label: "Referring Domains", value: data.referringDomains?.toLocaleString() ?? "0" },
    { label: "Domain Rank",       value: data.domainRank ?? "—"                        },
    { label: "Referring IPs",     value: data.referringIPs?.toLocaleString()    ?? "0" },
  ] : [];

  return (
    <motion.div variants={pv(0.5)} initial="hidden" animate="visible">
      <SectionLabel label="Backlink Overview" action={
        <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
          <Link2 size={11} color="var(--text-tertiary)"/>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:"10px", color:"var(--text-tertiary)", letterSpacing:"0.1em" }}>VIA DATAFORSEO</span>
        </div>
      }/>
      {loading ? (
        <div style={{ display:"flex", justifyContent:"center", padding:"32px" }}>
          <div style={{ width:"20px", height:"20px", border:`2px solid var(--border)`, borderTopColor:brandColor, borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/>
        </div>
      ) : planLocked ? (
        <Panel style={{ padding:"24px", border:"1px dashed var(--border)", background:"transparent", textAlign:"center" }}>
          <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-secondary)", marginBottom:"4px" }}>
            Backlink data is not on your DataForSEO plan.
          </div>
          <a href="https://app.dataforseo.com/backlinks-subscription" target="_blank" rel="noreferrer" style={{ fontFamily:"var(--font-mono)", fontSize:"11px", letterSpacing:"0.1em", color:brandColor, textDecoration:"none" }}>
            ACTIVATE BACKLINKS API ↗
          </a>
        </Panel>
      ) : error ? (
        <div style={{ padding:"16px", background:"rgba(255,171,0,0.06)", border:"1px solid rgba(255,171,0,0.20)", borderRadius:"10px", fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--signal-amber)" }}>
          {error} — backlink data unavailable
        </div>
      ) : data ? (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"12px" }}>
          {kpis.map(kpi => (
            <Panel key={kpi.label} style={{ padding:"18px 20px" }}>
              <div style={{ fontFamily:"var(--font-display)", fontSize:"clamp(1.4rem,2.5vw,2rem)", letterSpacing:"-0.04em", lineHeight:1, color:"var(--text-primary)", marginBottom:"6px" }}>{kpi.value}</div>
              <div style={{ fontFamily:"var(--font-body)", fontSize:"12px", color:"var(--text-secondary)" }}>{kpi.label}</div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel style={{ padding:"24px", textAlign:"center" }}>
          <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-tertiary)" }}>Loading backlink data for {domain}…</div>
        </Panel>
      )}
    </motion.div>
  );
}

// ── GEO Citation Panel ─────────────────────────────────────────────────────────
function GeoCitationPanel({ brandColor, domain }: { brandColor:string; domain:string }) {
  const [results,         setResults]         = useState<GeoResult[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string|null>(null);
  const [citRate,         setCitRate]         = useState<number|null>(null);
  const [keywords,        setKeywords]        = useState("");
  const [ran,             setRan]             = useState(false);
  const [aiNotConfigured, setAiNotConfigured] = useState(false);

  async function runCheck() {
    const kws = keywords.split(",").map(s=>s.trim()).filter(Boolean);
    if (kws.length === 0) return;
    setLoading(true); setError(null); setRan(true); setAiNotConfigured(false);
    try {
      const res  = await fetch("/api/geo", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ domain, keywords: kws }),
      });
      const data = await res.json();
      if (data?.reason === "not_configured") { setAiNotConfigured(true); return; }
      if (!res.ok || data.error) throw new Error(data.error??"GEO check failed");
      setResults(data.results ?? []);
      setCitRate(data.citationRate ?? 0);
    } catch(e:any) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <motion.div variants={pv(0.55)} initial="hidden" animate="visible">
      <SectionLabel label="GEO — AI Citation Tracker" action={
        <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
          <Brain size={11} color={brandColor}/>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:"10px", color:brandColor, letterSpacing:"0.1em" }}>LIVE AI CHECK</span>
        </div>
      }/>
      <Panel style={{ overflow:"hidden" }}>
        {/* Header */}
        <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", background:`rgba(var(--brand-rgb),0.03)` }}>
          <p style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-secondary)", marginBottom:"12px", lineHeight:1.6 }}>
            Check whether <strong style={{ color:"var(--text-primary)" }}>{domain}</strong> is cited in AI-generated answers. Enter your target keywords below.
          </p>
          <div style={{ display:"flex", gap:"10px", flexWrap:"wrap" }}>
            <input value={keywords} onChange={e=>setKeywords(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter")runCheck();}}
              placeholder="seo platform uk, keyword research tool, geo optimisation"
              style={{ flex:"1 1 280px", padding:"9px 13px", fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-primary)", background:"var(--card)", border:"1px solid var(--border)", borderRadius:"8px", outline:"none", boxSizing:"border-box" as const }}
              onFocus={e=>e.currentTarget.style.borderColor="var(--brand)"}
              onBlur={e=> e.currentTarget.style.borderColor="var(--border)"}
            />
            <button onClick={runCheck} disabled={loading||!keywords.trim()} style={{
              display:"flex", alignItems:"center", gap:"7px",
              fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:500,
              color:"#fff", background:loading?"var(--muted)":brandColor,
              border:"none", borderRadius:"8px", padding:"9px 18px", cursor:"pointer", transition:"opacity 0.16s",
            }}>
              {loading?<div style={{ width:"12px",height:"12px",border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.7s linear infinite" }}/>:<Eye size={13}/>}
              {loading?"Checking…":"Check citations"}
            </button>
          </div>
        </div>

        {/* Results */}
        {error && <div style={{ padding:"14px 20px", fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--signal-amber)" }}>{error}</div>}

        {aiNotConfigured && (
          <div style={{ padding:"20px", borderTop:"1px solid var(--border)", borderBottom:"1px solid var(--border)", background:"transparent", textAlign:"center" }}>
            <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-secondary)", marginBottom:"4px" }}>
              GEO citation tracking is not configured.
            </div>
            <div style={{ fontFamily:"var(--font-body)", fontSize:"12px", color:"var(--text-tertiary)" }}>
              Add an <span style={{ fontFamily:"var(--font-mono)" }}>ANTHROPIC_API_KEY</span> to your server environment to enable it.
            </div>
          </div>
        )}

        {citRate !== null && (
          <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:"20px", flexWrap:"wrap" }}>
            <div>
              <div style={{ fontFamily:"var(--font-display)", fontSize:"2.5rem", letterSpacing:"-0.04em", lineHeight:1, color: citRate>=50?"var(--signal-green)":citRate>=20?"var(--signal-amber)":"var(--signal-red)", marginBottom:"4px" }}>{citRate}%</div>
              <div style={{ fontFamily:"var(--font-body)", fontSize:"12px", color:"var(--text-secondary)" }}>Citation rate across {results.length} queries</div>
            </div>
            <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-secondary)", maxWidth:"400px", lineHeight:1.6 }}>
              {citRate >= 50 ? "Strong AI visibility. Your domain is regularly cited in AI-generated answers." : citRate >= 20 ? "Moderate AI visibility. Room to improve GEO through structured content and schema." : "Low AI visibility. Focus on answer-ready content, FAQ schema, and topical authority."}
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:"12px" }}>
            {results.map((r,i) => (
              <div key={i} style={{ padding:"14px 16px", background:"var(--card)", border:`1px solid ${r.cited?"rgba(0,230,118,0.25)":"var(--border)"}`, borderRadius:"10px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"8px", flexWrap:"wrap", gap:"8px" }}>
                  <span style={{ fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:500, color:"var(--text-primary)" }}>{r.keyword}</span>
                  <span style={{
                    fontFamily:"var(--font-mono)", fontSize:"9px", letterSpacing:"0.1em",
                    color: r.cited?"var(--signal-green)":"var(--text-tertiary)",
                    background: r.cited?"rgba(0,230,118,0.08)":"var(--muted)",
                    border: `1px solid ${r.cited?"rgba(0,230,118,0.25)":"var(--border)"}`,
                    padding:"2px 8px", borderRadius:"100px",
                  }}>
                    {r.cited?"✓ CITED":"NOT CITED"}
                  </span>
                </div>
                {r.answer && (
                  <p style={{ fontFamily:"var(--font-body)", fontSize:"12px", color:"var(--text-tertiary)", lineHeight:1.6, margin:0 }}>
                    {r.answer}
                  </p>
                )}
                {r.mentioned.length > 0 && (
                  <div style={{ display:"flex", gap:"5px", marginTop:"8px", flexWrap:"wrap" }}>
                    {r.mentioned.map(d=>(
                      <span key={d} style={{
                        fontFamily:"var(--font-mono)", fontSize:"9px", letterSpacing:"0.06em",
                        color: d.includes(domain.replace("www.","").split(".")[0]) ? brandColor : "var(--text-tertiary)",
                        background: d.includes(domain.replace("www.","").split(".")[0]) ? `rgba(var(--brand-rgb),0.08)` : "var(--card)",
                        border: `1px solid ${d.includes(domain.replace("www.","").split(".")[0]) ? `rgba(var(--brand-rgb),0.25)` : "var(--border)"}`,
                        padding:"2px 7px", borderRadius:"100px",
                      }}>
                        {d}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!ran && !loading && (
          <div style={{ padding:"40px 32px", textAlign:"center" }}>
            <Brain size={24} color="var(--text-tertiary)" style={{ marginBottom:"12px" }}/>
            <div style={{ fontFamily:"var(--font-body)", fontSize:"14px", color:"var(--text-secondary)", marginBottom:"6px" }}>Enter your target keywords above</div>
            <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-tertiary)" }}>We'll check if AI engines cite {domain} in their answers</div>
          </div>
        )}
      </Panel>
    </motion.div>
  );
}

// ── AI Strategy Action Centre — Claude-generated ───────────────────────────────
function ActionCenter({ brandColor, domain, gscData, ga4Data }: {
  brandColor:string; domain:string; gscData:any; ga4Data:any;
}) {
  const router = useRouter();
  const [strategies,      setStrategies]      = useState<Strategy[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [generated,       setGenerated]       = useState(false);
  const [selected,        setSelected]        = useState<number|null>(null);
  const [error,           setError]           = useState<string|null>(null);
  const [aiNotConfigured, setAiNotConfigured] = useState(false);
  const [activatingIndex, setActivatingIndex] = useState<number|null>(null);

  async function activateStrategy(strat: Strategy, idx: number) {
    setActivatingIndex(idx); setError(null);
    try {
      // Snapshot current live metrics as the baseline — used later for delta.
      const baseline: BaselineMetrics = {
        capturedAt: new Date().toISOString(),
        domain,
        ga4: ga4Data?.summary ? {
          sessions: ga4Data.summary.sessions ?? 0,
          users:    ga4Data.summary.users    ?? 0,
        } : undefined,
        gsc: gscData?.summary ? {
          clicks:       gscData.summary.clicks       ?? 0,
          impressions:  gscData.summary.impressions  ?? 0,
          avgPosition:  gscData.summary.position     ?? 0,
          ctr:          gscData.summary.ctr          ?? 0,
        } : undefined,
        keywordPos: (() => {
          const out: Record<string, number> = {};
          (gscData?.topQueries ?? []).forEach((q: any) => {
            if (q?.query) out[q.query.toLowerCase()] = q.position;
          });
          return out;
        })(),
      };

      const saved = await saveAndActivateStrategy({
        title:     strat.title,
        rationale: strat.rationale,
        impact:    strat.impact,
        effort:    strat.effort,
        timeframe: strat.timeframe,
        category:  strat.category,
        domain,
        baseline,
      });
      // Route to the detail page so the user immediately sees progress + plan.
      router.push(`/strategies/${saved.id}`);
    } catch (e: any) {
      // PostgrestError objects have non-enumerable fields — serialize explicitly
      // so the browser console shows the real message/code/hint instead of "{}".
      const info = {
        message: e?.message,
        code:    e?.code    ?? e?.pgCode,
        details: e?.details ?? e?.pgDetail,
        hint:    e?.hint    ?? e?.pgHint,
        name:    e?.name,
      };
      console.error("[activateStrategy]", info, e);
      setError(e?.message ?? "Could not save strategy.");
    } finally {
      setActivatingIndex(null);
    }
  }

  async function generateStrategies() {
    setLoading(true); setError(null); setAiNotConfigured(false);
    try {
      const context = {
        domain,
        sessions:    ga4Data?.summary?.sessions    ?? 0,
        users:       ga4Data?.summary?.users        ?? 0,
        clicks:      gscData?.summary?.clicks       ?? 0,
        impressions: gscData?.summary?.impressions  ?? 0,
        avgPosition: gscData?.summary?.position     ?? 0,
        ctr:         gscData?.summary?.ctr          ?? 0,
        topQueries:  gscData?.topQueries?.slice(0,5).map((q:any)=>q.query).join(", ") ?? "none yet",
      };

      const prompt = `You are an expert SEO and GEO strategist. Based on this website's real performance data, generate 3 specific, actionable strategies.

Website: ${context.domain}
Sessions (30d): ${context.sessions}
Users (30d): ${context.users}
GSC Clicks (28d): ${context.clicks}
GSC Impressions: ${context.impressions}
Average Position: ${context.avgPosition}
CTR: ${context.ctr}%
Top Queries: ${context.topQueries}

Return ONLY valid JSON array with exactly 3 objects, no markdown, no explanation:
[{"title":"...","rationale":"...","impact":8.5,"effort":4.2,"timeframe":"14-30 days","category":"..."}]

Each strategy must be specific to this domain's actual data. Impact and effort are 0-10 scores.`;

      const res = await fetch("/api/claude", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ prompt, max_tokens: 1000 }),
      });
      const data = await res.json();
      if (data?.reason === "not_configured") {
        setAiNotConfigured(true);
        return;
      }
      if (!res.ok || data.error) throw new Error(data.error ?? "Strategy generation failed");
      const text  = data.text ?? "[]";
      const clean = text.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(clean);
      setStrategies(parsed);
      setGenerated(true);
    } catch(e:any) {
      console.error("[ActionCenter]", e);
      setError(e?.message ?? "Could not generate strategies. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  const generatedDate = new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",timeZone:"UTC"}).format(new Date()).toUpperCase();

  return (
    <motion.div variants={pv(0.65)} initial="hidden" animate="visible">
      <SectionLabel label="AI Strategy Action Centre" action={
        <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
          {generated && <span style={{ fontFamily:"var(--font-mono)", fontSize:"10px", color:"var(--text-tertiary)", letterSpacing:"0.1em" }}>GENERATED {generatedDate}</span>}
          <button onClick={generateStrategies} disabled={loading} style={{
            display:"flex", alignItems:"center", gap:"5px",
            fontFamily:"var(--font-mono)", fontSize:"10px", letterSpacing:"0.06em",
            color:brandColor, background:`rgba(var(--brand-rgb),0.08)`,
            border:`1px solid rgba(var(--brand-rgb),0.25)`,
            borderRadius:"6px", padding:"5px 10px", cursor:"pointer", transition:"all 0.16s",
          }}>
            {loading?<div style={{ width:"10px",height:"10px",border:`1.5px solid rgba(var(--brand-rgb),0.3)`,borderTopColor:brandColor,borderRadius:"50%",animation:"spin 0.7s linear infinite" }}/>:<Cpu size={10}/>}
            {loading?"GENERATING…":generated?"REGENERATE":"GENERATE WITH AI"}
          </button>
        </div>
      }/>

      {error && <div style={{ padding:"12px 16px", background:"rgba(255,171,0,0.06)", border:"1px solid rgba(255,171,0,0.20)", borderRadius:"8px", marginBottom:"14px", fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--signal-amber)" }}>{error}</div>}

      {aiNotConfigured && !loading && (
        <Panel style={{ padding:"28px", border:"1px dashed var(--border)", background:"transparent", textAlign:"center", marginBottom:"14px" }}>
          <Brain size={22} color="var(--text-tertiary)" style={{ marginBottom:"10px" }}/>
          <div style={{ fontFamily:"var(--font-body)", fontSize:"14px", color:"var(--text-secondary)", marginBottom:"4px" }}>
            AI strategy generation is not configured.
          </div>
          <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-tertiary)" }}>
            Add an <span style={{ fontFamily:"var(--font-mono)" }}>ANTHROPIC_API_KEY</span> to your server environment to enable it.
          </div>
        </Panel>
      )}

      {loading && (
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          {[1,2,3].map(i=>(
            <div key={i} style={{ height:"100px", background:`linear-gradient(90deg, var(--card) 25%, var(--muted) 50%, var(--card) 75%)`, backgroundSize:"200% 100%", borderRadius:"12px", animation:"shimmer 1.4s ease-in-out infinite" }}/>
          ))}
        </div>
      )}

      {!loading && strategies.length === 0 && !error && (
        <Panel style={{ padding:"40px 32px", textAlign:"center" }}>
          <Brain size={24} color="var(--text-tertiary)" style={{ marginBottom:"12px" }}/>
          <div style={{ fontFamily:"var(--font-body)", fontSize:"14px", color:"var(--text-secondary)", marginBottom:"6px" }}>
            AI-powered strategy recommendations
          </div>
          <div style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-tertiary)", marginBottom:"20px" }}>
            Generated from your real GA4 and GSC performance data
          </div>
          <button onClick={generateStrategies} style={{
            display:"inline-flex", alignItems:"center", gap:"7px",
            fontFamily:"var(--font-body)", fontSize:"14px", fontWeight:500,
            color:"#fff", background:brandColor, border:"none",
            borderRadius:"100px", padding:"12px 28px", cursor:"pointer", transition:"opacity 0.16s",
          }}>
            <Zap size={14}/> Generate strategies
          </button>
        </Panel>
      )}

      {!loading && strategies.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          {strategies.map((strat,i) => {
            const isSelected = selected===i;
            return (
              <div key={i} onClick={()=>setSelected(isSelected?null:i)}
                style={{ background:"var(--surface)", border:`1px solid ${isSelected?brandColor+"60":"var(--border)"}`, borderRadius:"12px", padding:"20px 22px", cursor:"pointer", transition:"border-color 0.25s, box-shadow 0.25s", boxShadow:isSelected?"0 0 24px var(--brand-glow)":"none", position:"relative", overflow:"hidden" }}
                onMouseEnter={e=>{ if(!isSelected)(e.currentTarget as HTMLElement).style.borderColor="var(--border-strong)"; }}
                onMouseLeave={e=>{ if(!isSelected)(e.currentTarget as HTMLElement).style.borderColor="var(--border)"; }}
              >
                {isSelected && <div style={{ position:"absolute", top:0, left:0, right:0, height:"2px", background:`linear-gradient(90deg, transparent, ${brandColor}, transparent)` }}/>}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"10px", gap:"12px" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"4px", flexWrap:"wrap" }}>
                      <span style={{ fontFamily:"var(--font-mono)", fontSize:"9px", fontWeight:500, color:brandColor, background:`rgba(var(--brand-rgb),0.10)`, border:`1px solid rgba(var(--brand-rgb),0.20)`, padding:"2px 8px", borderRadius:"100px", letterSpacing:"0.1em", textTransform:"uppercase" }}>{strat.category}</span>
                      <span style={{ fontFamily:"var(--font-mono)", fontSize:"9px", color:"var(--text-tertiary)", letterSpacing:"0.06em" }}>Est. {strat.timeframe}</span>
                    </div>
                    <h3 style={{ fontFamily:"var(--font-body)", fontSize:"14px", fontWeight:600, color:"var(--text-primary)", letterSpacing:"-0.01em", lineHeight:1.3, margin:0 }}>{strat.title}</h3>
                  </div>
                  <div style={{ display:"flex", gap:"8px", flexShrink:0 }}>
                    {[{label:"IMPACT",value:strat.impact,colorFn:impactColor},{label:"EFFORT",value:strat.effort,colorFn:effortColor}].map(({label,value,colorFn})=>(
                      <div key={label} style={{ textAlign:"center", padding:"7px 12px", background:"var(--card)", border:"1px solid var(--border)", borderRadius:"7px", minWidth:"54px" }}>
                        <div style={{ fontFamily:"var(--font-mono)", fontSize:"18px", fontWeight:500, color:colorFn(value), lineHeight:1, marginBottom:"2px" }}>{value.toFixed(1)}</div>
                        <div style={{ fontFamily:"var(--font-mono)", fontSize:"8px", color:"var(--text-tertiary)", letterSpacing:"0.12em" }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:"6px", marginBottom:"12px" }}>
                  <ScoreBar label="Impact" value={strat.impact} color={impactColor(strat.impact)}/>
                  <ScoreBar label="Effort" value={strat.effort} color={effortColor(strat.effort)}/>
                </div>
                <AnimatePresence>
                  {isSelected && (
                    <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }} exit={{ opacity:0, height:0 }} transition={{ duration:0.3 }} style={{ overflow:"hidden" }}>
                      <div style={{ borderTop:"1px solid var(--border)", paddingTop:"12px", marginTop:"4px" }}>
                        <p style={{ fontFamily:"var(--font-body)", fontSize:"13px", color:"var(--text-secondary)", lineHeight:1.75, margin:"0 0 14px" }}>{strat.rationale}</p>
                        <div style={{ display:"flex", alignItems:"center", gap:"8px", flexWrap:"wrap" }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); activateStrategy(strat, i); }}
                            disabled={activatingIndex !== null}
                            style={{
                              display:"flex", alignItems:"center", gap:"5px",
                              fontFamily:"var(--font-body)", fontSize:"13px", fontWeight:600,
                              color:"#fff", background:brandColor, border:"none",
                              borderRadius:"7px", padding:"8px 16px",
                              cursor: activatingIndex !== null ? "default" : "pointer",
                              opacity: activatingIndex !== null && activatingIndex !== i ? 0.5 : 1,
                              transition:"opacity 0.16s",
                            }}
                            onMouseEnter={e=>{ if(activatingIndex===null) (e.currentTarget as HTMLElement).style.opacity="0.85"; }}
                            onMouseLeave={e=>{ if(activatingIndex===null) (e.currentTarget as HTMLElement).style.opacity="1"; }}
                          >
                            {activatingIndex === i
                              ? <div style={{ width:"11px",height:"11px",border:"1.5px solid rgba(255,255,255,0.35)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.7s linear infinite" }}/>
                              : <Zap size={13} strokeWidth={2.5}/>}
                            {activatingIndex === i ? "Activating…" : "Activate Strategy"}
                          </button>
                          <span style={{ fontFamily:"var(--font-mono)", fontSize:"10px", color:"var(--text-tertiary)", letterSpacing:"0.08em" }}>
                            SAVES + OPENS PLAN · AI TRACKS PROGRESS
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {!isSelected && <div style={{ fontFamily:"var(--font-mono)", fontSize:"10px", color:"var(--text-tertiary)", letterSpacing:"0.06em" }}>CLICK TO EXPAND RATIONALE</div>}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { domain, loading: domainLoading } = useDomain();
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [ga4Trend,   setGa4Trend]   = useState<GA4TrendPoint[]>([]);
  const [ga4Loading, setGa4Loading] = useState(true);
  const [ga4Data,    setGa4Data]    = useState<any>(null);
  const [gscData,    setGscData]    = useState<any>(null);
  const [ga4Connected, setGa4Connected] = useState(true);
  const [gscConnected, setGscConnected] = useState(true);
  // Capture *why* a connection is reported as not working so the banner
  // can distinguish "not configured" from "configured but Google rejected
  // the call" (e.g. missing Viewer access on the service account).
  const [ga4Reason,  setGa4Reason]   = useState<ConnReason>(null);
  const [gscReason,  setGscReason]   = useState<ConnReason>(null);
  const [ga4Message, setGa4Message]  = useState<string | null>(null);
  const [gscMessage, setGscMessage]  = useState<string | null>(null);

  useEffect(() => {
    const b = localStorage.getItem("aiml-brand") || localStorage.getItem("rvivme-brand");
    if (b) setBrandColor(b);
    const onStorage = (e: StorageEvent) => {
      if ((e.key==="aiml-brand"||e.key==="rvivme-brand") && e.newValue) setBrandColor(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    fetch("/api/ga4")
      .then(r=>r.json())
      .then(data => {
        if (data.success) {
          setGa4Trend(data.trend ?? []);
          setGa4Data(data);
          setGa4Connected(true);
          setGa4Reason(null);
          setGa4Message(null);
        } else {
          setGa4Connected(false);
          setGa4Reason((data?.reason as ConnReason) ?? "not_configured");
          setGa4Message(data?.message ?? null);
        }
      })
      .catch(()=> { setGa4Connected(false); setGa4Reason("api_error"); setGa4Message("Network error reaching /api/ga4."); })
      .finally(()=>setGa4Loading(false));
    fetch("/api/gsc")
      .then(r=>r.json())
      .then(data => {
        if (data.success) {
          setGscData(data);
          setGscConnected(true);
          setGscReason(null);
          setGscMessage(null);
        } else {
          setGscConnected(false);
          setGscReason((data?.reason as ConnReason) ?? "not_configured");
          setGscMessage(data?.message ?? null);
        }
      })
      .catch(()=> { setGscConnected(false); setGscReason("api_error"); setGscMessage("Network error reaching /api/gsc."); });
  }, []);

  const dateStr = new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date());

  return (
    <div style={{ background:"var(--bg)", minHeight:"100vh", padding:"32px 24px 80px", maxWidth:"1280px", margin:"0 auto" }}>
      <ConnectionBanner
        ga4Connected={ga4Connected} gscConnected={gscConnected}
        ga4Reason={ga4Reason}       gscReason={gscReason}
        ga4Message={ga4Message}     gscMessage={gscMessage}
      />

      {/* Header */}
      <motion.div variants={pv(0)} initial="hidden" animate="visible" style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:"24px", flexWrap:"wrap", gap:"12px" }}>
        <div>
          <h1 style={{ fontFamily:"var(--font-display)", fontSize:"clamp(1.5rem,3vw,2.2rem)", letterSpacing:"-0.04em", lineHeight:1, fontWeight:400, color:"var(--text-primary)", marginBottom:"6px" }}>
            Intelligence Dashboard
          </h1>
          <div style={{ display:"flex", alignItems:"center", gap:"12px", flexWrap:"wrap" }}>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:"11px", color:"var(--text-tertiary)", letterSpacing:"0.06em" }}>{dateStr.toUpperCase()}</span>
            <div style={{ display:"flex", alignItems:"center", gap:"5px" }}>
              <div style={{ width:"6px",height:"6px",borderRadius:"50%",background:brandColor,animation:"brand-pulse 2.5s ease-in-out infinite" }}/>
              <span style={{ fontFamily:"var(--font-mono)", fontSize:"10px", color:brandColor, letterSpacing:"0.1em", textTransform:"uppercase" }}>Live · GA4 + GSC + DataForSEO</span>
            </div>
          </div>
        </div>
        {!domainLoading && domain && (
          <div style={{ display:"flex", alignItems:"center", gap:"8px", padding:"7px 12px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"8px" }}>
            <Globe2 size={12} color={brandColor}/>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:"11px", color:"var(--text-secondary)", letterSpacing:"0.06em" }}>{domain}</span>
          </div>
        )}
      </motion.div>

      <ActiveStrategyBanner brandColor={brandColor}/>

      <div style={{ display:"flex", flexDirection:"column", gap:"32px" }}>
        <ProjectionChart brandColor={brandColor} ga4Trend={ga4Trend} ga4Loading={ga4Loading}/>
        <GA4Panel brandColor={brandColor}/>
        <GSCPanel brandColor={brandColor}/>
        <BacklinksPanel brandColor={brandColor} domain={domain}/>
        <GeoCitationPanel brandColor={brandColor} domain={domain}/>
        <ActionCenter brandColor={brandColor} domain={domain} gscData={gscData} ga4Data={ga4Data}/>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes brand-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}
