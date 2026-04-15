"use client";

// app/dashboard/page.tsx
// =============================================================================
// AI Marketing Labs — Primary AI Marketing Labs — Intelligence Dashboard
// Dynamic brand theming · Recharts area chart · Framer Motion entrance
// =============================================================================

import {
  useState,
  useEffect,
  useRef,
} from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { motion, useInView, animate, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Activity,
  Newspaper,
  Globe2,
  ShieldCheck,
  Cpu,
  Zap,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { GA4Panel } from "./ga4-panel";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface TrafficDataPoint {
  month:     string;
  actual:    number | null;
  forecast:  number | null;
  lower:     number | null;
  upper:     number | null;
}

interface MetricCard {
  id:       string;
  label:    string;
  value:    string | number;
  delta:    number;
  unit:     string;
  icon:     React.ElementType;
  severity: "neutral" | "warning" | "critical" | "positive";
  detail:   string;
}

interface HealthItem {
  label:    string;
  status:   "ok" | "warning" | "critical";
  detail:   string;
}

interface Strategy {
  id:           string;
  title:        string;
  rationale:    string;
  impact:       number;
  effort:       number;
  timeframe:    string;
  category:     string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock data — clinical corporate tone
// ─────────────────────────────────────────────────────────────────────────────
const TRAFFIC_DATA: TrafficDataPoint[] = [
  { month: "Sep",  actual: 18400, forecast: null,  lower: null,  upper: null  },
  { month: "Oct",  actual: 21700, forecast: null,  lower: null,  upper: null  },
  { month: "Nov",  actual: 19900, forecast: null,  lower: null,  upper: null  },
  { month: "Dec",  actual: 24300, forecast: null,  lower: null,  upper: null  },
  { month: "Jan",  actual: 27800, forecast: null,  lower: null,  upper: null  },
  { month: "Feb",  actual: 31200, forecast: null,  lower: null,  upper: null  },
  { month: "Mar",  actual: 34100, forecast: null,  lower: null,  upper: null  },
  // Forecast horizon begins at handoff point
  { month: "Apr",  actual: 34100, forecast: 34100, lower: 32800, upper: 35900 },
  { month: "May",  actual: null,  forecast: 38600, lower: 36100, upper: 41200 },
  { month: "Jun",  actual: null,  forecast: 43400, lower: 39800, upper: 47100 },
  { month: "Jul",  actual: null,  forecast: 49200, lower: 44000, upper: 54500 },
  { month: "Aug",  actual: null,  forecast: 55800, lower: 49200, upper: 62400 },
  { month: "Sep+", actual: null,  forecast: 63100, lower: 54800, upper: 71500 },
];

const AI_METRICS: MetricCard[] = [
  {
    id:       "keyword-volatility",
    label:    "Keyword Volatility Index",
    value:    72,
    delta:    14.3,
    unit:     "/100",
    icon:     Activity,
    severity: "warning",
    detail:   "17 tracked keywords experienced position shifts >3 in the past 24 hours. Primary instability detected in navigational query cluster.",
  },
  {
    id:       "competitor-alerts",
    label:    "Competitor News Alerts",
    value:    4,
    delta:    -1,
    unit:     " new",
    icon:     Newspaper,
    severity: "neutral",
    detail:   "Acme Analytics published a new product announcement indexed by Google News at 07:14 GMT. Rival Corp restructured their /resources hierarchy — potential authority shift.",
  },
  {
    id:       "niche-updates",
    label:    "Niche Industry Updates",
    value:    9,
    delta:    3,
    unit:     " signals",
    icon:     Globe2,
    severity: "positive",
    detail:   "Google Search Central blog published Core Web Vitals guidance update. Industry sentiment analysis indicates 62% positive coverage of AI-assisted search tools in your vertical.",
  },
];

const HEALTH_ITEMS: HealthItem[] = [
  { label: "SSL Certificate",         status: "ok",       detail: "Valid · Expires 14 Mar 2026 · Grade A"       },
  { label: "404 Errors (24hr)",       status: "ok",       detail: "0 new errors detected · Last scan 09:41 GMT" },
  { label: "Core Web Vitals",         status: "ok",       detail: "LCP 1.8s · FID 12ms · CLS 0.04 · All Pass"  },
  { label: "Crawl Anomalies",         status: "warning",  detail: "3 pages returning 302 redirect chains"        },
  { label: "Canonical Conflicts",     status: "warning",  detail: "7 self-referencing canonicals missing"        },
  { label: "Index Coverage",          status: "ok",       detail: "2,841 pages indexed · 0 excluded (critical)"  },
];

const STRATEGIES: Strategy[] = [
  {
    id:        "strat-01",
    title:     "Topical Authority Cluster Expansion — AI Tools Vertical",
    rationale: "Semantic gap analysis reveals 43 unaddressed sub-topics within your primary keyword cluster. Competitors currently rank for 67% of these terms. Constructing a structured hub-and-spoke content architecture targeting these sub-topics is projected to increase topical authority score from 61 to 84 within 90 days, driving an estimated 8,200 incremental monthly sessions.",
    impact:    9.2,
    effort:    6.8,
    timeframe: "60–90 days",
    category:  "Content Architecture",
  },
  {
    id:        "strat-02",
    title:     "Programmatic Schema Markup Deployment — FAQ & HowTo",
    rationale: "Audit confirms 91% of indexable pages lack structured data. Deploying FAQ and HowTo schema across the /resources and /blog directories is projected to increase SERP feature eligibility for 312 target queries. AI Overview citation probability increases by an estimated 34% upon implementation, based on current GEO analysis benchmarks.",
    impact:    7.5,
    effort:    3.2,
    timeframe: "7–14 days",
    category:  "Technical GEO",
  },
  {
    id:        "strat-03",
    title:     "Competitor Link Gap Remediation — Domain Authority Uplift",
    rationale: "Backlink gap analysis against the top 3 competitors identifies 1,847 referring domains linking to rivals that do not link to this domain. Of these, 214 are classified as high-authority (DA 60+) and editorially accessible. A targeted digital PR and link acquisition campaign addressing this gap is projected to increase Domain Authority from 42 to 55 over 6 months.",
    impact:    8.8,
    effort:    8.1,
    timeframe: "90–180 days",
    category:  "Authority Building",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const PANEL_SPRING = {
  type:      "spring",
  stiffness: 260,
  damping:   30,
  mass:      0.9,
} as const;

function panelVariants(delay: number) {
  return {
    hidden:  { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { ...PANEL_SPRING, delay } },
  };
}

function formatK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function impactColor(score: number): string {
  if (score >= 8.5) return "var(--signal-green)";
  if (score >= 6.5) return "var(--brand)";
  return "var(--signal-amber)";
}

function effortColor(score: number): string {
  if (score >= 7.5) return "var(--signal-red)";
  if (score >= 5.0) return "var(--signal-amber)";
  return "var(--signal-green)";
}

function severityColor(s: MetricCard["severity"]): string {
  const map: Record<MetricCard["severity"], string> = {
    neutral:  "var(--text-secondary)",
    warning:  "var(--signal-amber)",
    critical: "var(--signal-red)",
    positive: "var(--signal-green)",
  };
  return map[s];
}

function statusIcon(s: HealthItem["status"]) {
  if (s === "ok")       return <CheckCircle2 size={13} color="var(--signal-green)" />;
  if (s === "warning")  return <AlertCircle  size={13} color="var(--signal-amber)" />;
  return                       <XCircle      size={13} color="var(--signal-red)" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated number
// ─────────────────────────────────────────────────────────────────────────────
function AnimatedNumber({
  target,
  decimals = 0,
  delay = 0,
}: {
  target: number;
  decimals?: number;
  delay?: number;
}) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const ctrl = animate(0, target, {
        duration: 1.4,
        ease:     [0.16, 1, 0.3, 1],
        onUpdate: (v) => setDisplay(parseFloat(v.toFixed(decimals))),
      });
      return ctrl.stop;
    }, delay * 1000);
    return () => clearTimeout(t);
  }, [target, decimals, delay]);
  return (
    <span style={{ fontFamily: "var(--font-dm-mono), monospace" }}>
      {decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString()}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom chart tooltip
// ─────────────────────────────────────────────────────────────────────────────
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background:   "var(--card)",
      border:       "1px solid var(--border)",
      borderRadius: "8px",
      padding:      "10px 14px",
      boxShadow:    "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      <div style={{
        fontFamily:    "var(--font-dm-mono), monospace",
        fontSize:      "10px",
        color:         "var(--text-tertiary)",
        letterSpacing: "0.1em",
        marginBottom:  "8px",
        textTransform: "uppercase",
      }}>
        {label}
      </div>
      {payload.map((p) =>
        p.value != null ? (
          <div key={p.name} style={{
            display:        "flex",
            justifyContent: "space-between",
            gap:            "20px",
            marginBottom:   "3px",
          }}>
            <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: p.color }}>
              {p.name}
            </span>
            <span style={{
              fontFamily: "var(--font-dm-mono), monospace",
              fontSize:   "12px",
              fontWeight: 500,
              color:      "var(--text-primary)",
            }}>
              {Number(p.value).toLocaleString()}
            </span>
          </div>
        ) : null
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Score bar component
// ─────────────────────────────────────────────────────────────────────────────
function ScoreBar({
  value,
  max = 10,
  color,
  label,
}: {
  value: number;
  max?: number;
  color: string;
  label: string;
}) {
  const pct = (value / max) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <span style={{
        fontFamily:  "var(--font-dm-mono), monospace",
        fontSize:    "10px",
        color:       "var(--text-tertiary)",
        width:       "46px",
        flexShrink:  0,
        letterSpacing: "0.06em",
      }}>
        {label}
      </span>
      <div style={{
        flex:         1,
        height:       "4px",
        background:   "var(--border)",
        borderRadius: "2px",
        overflow:     "hidden",
      }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          style={{ height: "100%", background: color, borderRadius: "2px" }}
        />
      </div>
      <span style={{
        fontFamily: "var(--font-dm-mono), monospace",
        fontSize:   "12px",
        fontWeight: 500,
        color:      color,
        width:      "26px",
        textAlign:  "right",
        flexShrink: 0,
      }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper
// ─────────────────────────────────────────────────────────────────────────────
function Section({
  label,
  children,
  action,
}: {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   "14px",
      }}>
        <span style={{
          fontFamily:    "var(--font-syne), sans-serif",
          fontSize:      "11px",
          fontWeight:    700,
          color:         "var(--text-tertiary)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}>
          {label}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel card
// ─────────────────────────────────────────────────────────────────────────────
function Panel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      background:   "var(--surface)",
      border:       "1px solid var(--border)",
      borderRadius: "12px",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GA4 / GSC Connection banner
// ─────────────────────────────────────────────────────────────────────────────
function ConnectionBanner({
  ga4Connected,
  gscConnected,
}: {
  ga4Connected: boolean;
  gscConnected: boolean;
}) {
  if (ga4Connected && gscConnected) return null;
  const missing = [
    !ga4Connected && "Google Analytics 4",
    !gscConnected && "Google Search Console",
  ].filter(Boolean).join(" and ");

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...PANEL_SPRING, delay: 0.1 }}
      style={{
        display:       "flex",
        alignItems:    "center",
        justifyContent:"space-between",
        padding:       "10px 16px",
        background:    "rgba(255, 171, 0, 0.06)",
        border:        "1px solid rgba(255, 171, 0, 0.20)",
        borderRadius:  "10px",
        marginBottom:  "20px",
        gap:           "12px",
        flexWrap:      "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <AlertTriangle size={14} color="var(--signal-amber)" />
        <span style={{
          fontFamily: "var(--font-inter), sans-serif",
          fontSize:   "13px",
          color:      "var(--signal-amber)",
          fontWeight: 500,
        }}>
          Data limited — {missing}{" "}
          {missing.includes("and") ? "are" : "is"} not connected. Projections are
          based on aggregated industry benchmarks only.
        </span>
      </div>
      <button style={{
        display:       "flex",
        alignItems:    "center",
        gap:           "5px",
        fontFamily:    "var(--font-inter), sans-serif",
        fontSize:      "12px",
        fontWeight:    600,
        color:         "var(--signal-amber)",
        background:    "rgba(255, 171, 0, 0.10)",
        border:        "1px solid rgba(255, 171, 0, 0.25)",
        borderRadius:  "6px",
        padding:       "5px 12px",
        cursor:        "pointer",
        whiteSpace:    "nowrap",
        transition:    "all 0.18s",
      }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,171,0,0.18)"}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,171,0,0.10)"}
      >
        Connect now <ArrowRight size={11} />
      </button>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard header
// ─────────────────────────────────────────────────────────────────────────────
function DashboardHeader({ brandColor }: { brandColor: string }) {
  const dateStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date());

  return (
    <motion.div
      variants={panelVariants(0)}
      initial="hidden"
      animate="visible"
      style={{
        display:        "flex",
        alignItems:     "flex-end",
        justifyContent: "space-between",
        marginBottom:   "24px",
        flexWrap:       "wrap",
        gap:            "12px",
      }}
    >
      <div>
        <h1 style={{
          fontFamily:    "var(--font-syne), sans-serif",
          fontSize:      "clamp(1.5rem, 3vw, 2rem)",
          fontWeight:    800,
          color:         "var(--text-primary)",
          letterSpacing: "-0.03em",
          lineHeight:    1,
          marginBottom:  "6px",
        }}>
          AI Marketing Labs — Intelligence Dashboard
        </h1>
        <div style={{
          display:    "flex",
          alignItems: "center",
          gap:        "12px",
        }}>
          <span style={{
            fontFamily:    "var(--font-dm-mono), monospace",
            fontSize:      "11px",
            color:         "var(--text-tertiary)",
            letterSpacing: "0.06em",
          }}>
            {dateStr.toUpperCase()}
          </span>
          <div style={{
            display:    "flex",
            alignItems: "center",
            gap:        "5px",
          }}>
            <div style={{
              width:        "6px",
              height:       "6px",
              borderRadius: "50%",
              background:   brandColor,
              boxShadow:    `0 0 8px var(--brand-glow)`,
              animation:    "brand-pulse 2.5s ease-in-out infinite",
            }} />
            <span style={{
              fontFamily:    "var(--font-dm-mono), monospace",
              fontSize:      "10px",
              color:         brandColor,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}>
              Live · DataForSEO
            </span>
          </div>
        </div>
      </div>

      {/* Brand color indicator */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          "8px",
        padding:      "7px 12px",
        background:   "var(--surface)",
        border:       "1px solid var(--border)",
        borderRadius: "8px",
      }}>
        <div style={{
          width:        "14px",
          height:       "14px",
          borderRadius: "4px",
          background:   brandColor,
          boxShadow:    `0 0 10px var(--brand-glow)`,
          flexShrink:   0,
        }} />
        <span style={{
          fontFamily:    "var(--font-dm-mono), monospace",
          fontSize:      "11px",
          color:         "var(--text-secondary)",
          letterSpacing: "0.06em",
        }}>
          Brand: {brandColor.toUpperCase()}
        </span>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6-Month Projection Chart
// ─────────────────────────────────────────────────────────────────────────────
function ProjectionChart({ brandColor }: { brandColor: string }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const inView   = useInView(chartRef, { once: true, margin: "-60px" });
  const gradId   = "brand-area-gradient";
  const forecastGradId = "forecast-area-gradient";

  return (
    <motion.div
      ref={chartRef}
      variants={panelVariants(0.2)}
      initial="hidden"
      animate="visible"
    >
      <Panel style={{ padding: "24px 24px 16px" }}>
        <div style={{
          display:        "flex",
          justifyContent: "space-between",
          alignItems:     "flex-start",
          marginBottom:   "24px",
          flexWrap:       "wrap",
          gap:            "12px",
        }}>
          <div>
            <div style={{
              fontFamily:    "var(--font-syne), sans-serif",
              fontSize:      "15px",
              fontWeight:    700,
              color:         "var(--text-primary)",
              letterSpacing: "-0.01em",
              marginBottom:  "4px",
            }}>
              Organic Traffic · 6-Month AI Projection
            </div>
            <div style={{
              fontFamily:    "var(--font-dm-mono), monospace",
              fontSize:      "11px",
              color:         "var(--text-tertiary)",
              letterSpacing: "0.08em",
            }}>
              MODEL v1.0 · Confidence interval 85% · Source: DataForSEO + GSC estimate
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {[
              { label: "Historical",  dashed: false, color: brandColor         },
              { label: "AI Forecast", dashed: true,  color: brandColor         },
              { label: "CI Band",     dashed: false, color: "var(--border)"    },
            ].map(({ label, dashed, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <svg width="18" height="10">
                  <line
                    x1="0" y1="5" x2="18" y2="5"
                    stroke={color}
                    strokeWidth={dashed ? 1.5 : 2}
                    strokeDasharray={dashed ? "4 3" : undefined}
                    opacity={label === "CI Band" ? 0.6 : 1}
                  />
                </svg>
                <span style={{
                  fontFamily:    "var(--font-dm-mono), monospace",
                  fontSize:      "10px",
                  color:         "var(--text-tertiary)",
                  letterSpacing: "0.06em",
                }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <AreaChart
            data={TRAFFIC_DATA}
            margin={{ top: 4, right: 4, left: -8, bottom: 0 }}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={brandColor} stopOpacity={0.28} />
                <stop offset="75%"  stopColor={brandColor} stopOpacity={0.04} />
                <stop offset="100%" stopColor={brandColor} stopOpacity={0}    />
              </linearGradient>
              <linearGradient id={forecastGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={brandColor} stopOpacity={0.14} />
                <stop offset="100%" stopColor={brandColor} stopOpacity={0}    />
              </linearGradient>
            </defs>

            <CartesianGrid
              stroke="var(--chart-grid)"
              strokeDasharray="2 6"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={{
                fontFamily:    "var(--font-dm-mono), monospace",
                fontSize:      10,
                fill:          "var(--chart-tick)",
                letterSpacing: "0.04em",
              }}
              axisLine={{ stroke: "var(--chart-axis)" }}
              tickLine={false}
            />
            <YAxis
              tick={{
                fontFamily: "var(--font-dm-mono), monospace",
                fontSize:   10,
                fill:       "var(--chart-tick)",
              }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatK}
            />
            <Tooltip content={<ChartTooltip />} />

            {/* Confidence interval band */}
            <Area
              type="monotone"
              dataKey="upper"
              name="CI Upper"
              stroke="none"
              fill={`url(#${forecastGradId})`}
              fillOpacity={0.4}
              dot={false}
              legendType="none"
              animationDuration={inView ? 1200 : 0}
            />
            <Area
              type="monotone"
              dataKey="lower"
              name="CI Lower"
              stroke="none"
              fill="var(--bg)"
              fillOpacity={1}
              dot={false}
              legendType="none"
              animationDuration={inView ? 1200 : 0}
            />

            {/* Historical area */}
            <Area
              type="monotone"
              dataKey="actual"
              name="Historical"
              stroke={brandColor}
              strokeWidth={2}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 4, fill: brandColor, stroke: "var(--bg)", strokeWidth: 2 }}
              animationDuration={inView ? 1000 : 0}
              animationEasing="ease-out"
            />

            {/* AI Forecast dotted line */}
            <Area
              type="monotone"
              dataKey="forecast"
              name="AI Forecast"
              stroke={brandColor}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              strokeOpacity={0.75}
              fill="none"
              dot={false}
              activeDot={{ r: 3, fill: brandColor, stroke: "var(--bg)", strokeWidth: 2 }}
              animationDuration={inView ? 1400 : 0}
              animationEasing="ease-out"
            />

            {/* Handoff reference line */}
            <ReferenceLine
              x="Apr"
              stroke="var(--text-tertiary)"
              strokeDasharray="2 4"
              strokeWidth={1}
              label={{
                value:     "FORECAST →",
                position:  "top",
                fontFamily:"var(--font-dm-mono), monospace",
                fontSize:  9,
                fill:      "var(--text-tertiary)",
                dy:        -6,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Bottom KPI strip */}
        <div style={{
          display:       "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap:           "1px",
          background:    "var(--border)",
          borderTop:     "1px solid var(--border)",
          marginTop:     "20px",
          borderRadius:  "0 0 10px 10px",
          overflow:      "hidden",
        }}>
          {[
            { label: "Current MTD",      value: 34100,  suffix: "" },
            { label: "Forecast +6M",     value: 63100,  suffix: "" },
            { label: "Projected Growth", value: 85.0,   suffix: "%" },
            { label: "Confidence",       value: 85,     suffix: "%" },
          ].map((stat, i) => (
            <div key={stat.label} style={{
              background:  "var(--surface)",
              padding:     "14px 16px",
              textAlign:   "center",
            }}>
              <div style={{
                fontFamily:    "var(--font-dm-mono), monospace",
                fontSize:      "18px",
                fontWeight:    500,
                color:         "var(--text-primary)",
                letterSpacing: "-0.02em",
                marginBottom:  "3px",
              }}>
                <AnimatedNumber target={stat.value} decimals={stat.suffix === "%" ? 1 : 0} delay={0.4 + i * 0.08} />
                {stat.suffix}
              </div>
              <div style={{
                fontFamily:    "var(--font-dm-mono), monospace",
                fontSize:      "9px",
                color:         "var(--text-tertiary)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily AI Metrics Grid
// ─────────────────────────────────────────────────────────────────────────────
function MetricsGrid() {
  return (
    <Section
      label="Daily AI Signal Intelligence"
      action={
        <button style={{
          display:    "flex",
          alignItems: "center",
          gap:        "4px",
          fontFamily: "var(--font-dm-mono), monospace",
          fontSize:   "11px",
          color:      "var(--text-tertiary)",
          background: "transparent",
          border:     "none",
          cursor:     "pointer",
          padding:    "4px",
          transition: "color 0.18s",
        }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"}
        >
          <RefreshCw size={11} /> REFRESH
        </button>
      }
    >
      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap:                 "12px",
      }}>
        {AI_METRICS.map((metric, i) => {
          const Icon     = metric.icon;
          const sColor   = severityColor(metric.severity);
          const positive = metric.delta > 0;
          const DeltaIcon = positive ? TrendingUp : TrendingDown;
          return (
            <motion.div
              key={metric.id}
              variants={panelVariants(0.3 + i * 0.08)}
              initial="hidden"
              animate="visible"
            >
              <Panel style={{ padding: "20px", height: "100%", position: "relative", overflow: "hidden" }}>
                {/* Severity accent */}
                <div style={{
                  position:  "absolute",
                  top:       0,
                  left:      "20px",
                  right:     "20px",
                  height:    "1px",
                  background: `linear-gradient(90deg, transparent, ${sColor}55, transparent)`,
                }} />

                <div style={{
                  display:        "flex",
                  justifyContent: "space-between",
                  alignItems:     "flex-start",
                  marginBottom:   "14px",
                }}>
                  <div style={{
                    width:        "36px",
                    height:       "36px",
                    borderRadius: "8px",
                    background:   `${sColor}12`,
                    border:       `1px solid ${sColor}30`,
                    display:      "flex",
                    alignItems:   "center",
                    justifyContent: "center",
                  }}>
                    <Icon size={17} color={sColor} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <DeltaIcon
                      size={11}
                      color={positive ? "var(--signal-green)" : "var(--signal-red)"}
                    />
                    <span style={{
                      fontFamily: "var(--font-dm-mono), monospace",
                      fontSize:   "11px",
                      color:      positive ? "var(--signal-green)" : "var(--signal-red)",
                      fontWeight: 500,
                    }}>
                      {positive ? "+" : ""}{metric.delta}
                    </span>
                  </div>
                </div>

                <div style={{
                  fontFamily:    "var(--font-dm-mono), monospace",
                  fontSize:      "28px",
                  fontWeight:    500,
                  color:         "var(--text-primary)",
                  letterSpacing: "-0.025em",
                  lineHeight:    1,
                  marginBottom:  "4px",
                }}>
                  <AnimatedNumber target={typeof metric.value === "number" ? metric.value : 0} delay={0.3 + i * 0.08} />
                  <span style={{ fontSize: "14px", color: "var(--text-tertiary)", fontWeight: 400 }}>
                    {metric.unit}
                  </span>
                </div>

                <div style={{
                  fontFamily:    "var(--font-syne), sans-serif",
                  fontSize:      "12px",
                  fontWeight:    600,
                  color:         "var(--text-primary)",
                  marginBottom:  "10px",
                  letterSpacing: "-0.005em",
                }}>
                  {metric.label}
                </div>

                <p style={{
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize:   "12px",
                  color:      "var(--text-secondary)",
                  lineHeight: 1.65,
                  margin:     0,
                }}>
                  {metric.detail}
                </p>
              </Panel>
            </motion.div>
          );
        })}
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Technical Health Banner
// ─────────────────────────────────────────────────────────────────────────────
function TechnicalHealthBanner() {
  const hasWarnings = HEALTH_ITEMS.some(h => h.status !== "ok");
  const criticals   = HEALTH_ITEMS.filter(h => h.status === "critical").length;
  const warnings    = HEALTH_ITEMS.filter(h => h.status === "warning").length;

  return (
    <motion.div variants={panelVariants(0.55)} initial="hidden" animate="visible">
      <Panel style={{ overflow: "hidden" }}>
        {/* Banner header */}
        <div style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          padding:        "14px 20px",
          borderBottom:   "1px solid var(--border)",
          background:     hasWarnings
            ? "rgba(255, 171, 0, 0.04)"
            : "rgba(0, 230, 118, 0.04)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldCheck
              size={15}
              color={hasWarnings ? "var(--signal-amber)" : "var(--signal-green)"}
            />
            <span style={{
              fontFamily:    "var(--font-syne), sans-serif",
              fontSize:      "13px",
              fontWeight:    700,
              color:         "var(--text-primary)",
              letterSpacing: "-0.005em",
            }}>
              Technical Health Monitor
            </span>
            <span style={{
              fontFamily:    "var(--font-dm-mono), monospace",
              fontSize:      "10px",
              color:         hasWarnings ? "var(--signal-amber)" : "var(--signal-green)",
              background:    hasWarnings ? "rgba(255,171,0,0.10)" : "rgba(0,230,118,0.10)",
              border:        hasWarnings
                ? "1px solid rgba(255,171,0,0.25)"
                : "1px solid rgba(0,230,118,0.25)",
              padding:       "2px 8px",
              borderRadius:  "100px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}>
              {criticals > 0
                ? `${criticals} critical`
                : warnings > 0
                ? `${warnings} warnings`
                : "All Systems Nominal"}
            </span>
          </div>
          <div style={{
            fontFamily:    "var(--font-dm-mono), monospace",
            fontSize:      "10px",
            color:         "var(--text-tertiary)",
            letterSpacing: "0.06em",
          }}>
            LAST SCAN: 09:41 GMT
          </div>
        </div>

        {/* Health items */}
        <div style={{
          display:             "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap:                 "1px",
          background:          "var(--border)",
        }}>
          {HEALTH_ITEMS.map((item, i) => (
            <div key={i} style={{
              display:   "flex",
              alignItems:"flex-start",
              gap:       "8px",
              padding:   "12px 16px",
              background:"var(--surface)",
            }}>
              <div style={{ marginTop: "1px", flexShrink: 0 }}>{statusIcon(item.status)}</div>
              <div>
                <div style={{
                  fontFamily:    "var(--font-inter), sans-serif",
                  fontSize:      "12px",
                  fontWeight:    600,
                  color:         "var(--text-primary)",
                  marginBottom:  "2px",
                }}>
                  {item.label}
                </div>
                <div style={{
                  fontFamily: "var(--font-dm-mono), monospace",
                  fontSize:   "10px",
                  color:      "var(--text-tertiary)",
                  lineHeight: 1.5,
                }}>
                  {item.detail}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Center
// ─────────────────────────────────────────────────────────────────────────────
function ActionCenter({ brandColor }: { brandColor: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const generatedDate = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date())
    .toUpperCase();

  return (
    <Section
      label="AI Strategy Action Centre"
      action={
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Cpu size={11} color="var(--text-tertiary)" />
          <span style={{
            fontFamily:    "var(--font-dm-mono), monospace",
            fontSize:      "10px",
            color:         "var(--text-tertiary)",
            letterSpacing: "0.1em",
          }}>
            GENERATED {generatedDate}
          </span>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {STRATEGIES.map((strat, i) => {
          const isSelected = selected === strat.id;
          return (
            <motion.div
              key={strat.id}
              variants={panelVariants(0.6 + i * 0.1)}
              initial="hidden"
              animate="visible"
            >
              <div
                onClick={() => setSelected(isSelected ? null : strat.id)}
                style={{
                  background:   "var(--surface)",
                  border:       `1px solid ${isSelected ? brandColor + "60" : "var(--border)"}`,
                  borderRadius: "12px",
                  padding:      "20px 22px",
                  cursor:       "pointer",
                  transition:   "border-color 0.25s, box-shadow 0.25s",
                  boxShadow:    isSelected ? `0 0 24px var(--brand-glow)` : "none",
                  position:     "relative",
                  overflow:     "hidden",
                }}
                onMouseEnter={e => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = "var(--muted)";
                }}
                onMouseLeave={e => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                }}
              >
                {/* Selected indicator */}
                {isSelected && (
                  <div style={{
                    position:   "absolute",
                    top:        0,
                    left:       0,
                    right:      0,
                    height:     "2px",
                    background: `linear-gradient(90deg, transparent, ${brandColor}, transparent)`,
                  }} />
                )}

                {/* Strategy header */}
                <div style={{
                  display:        "flex",
                  justifyContent: "space-between",
                  alignItems:     "flex-start",
                  marginBottom:   "10px",
                  gap:            "12px",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span style={{
                        fontFamily:    "var(--font-dm-mono), monospace",
                        fontSize:      "9px",
                        fontWeight:    500,
                        color:         brandColor,
                        background:    `rgba(var(--brand-rgb), 0.10)`,
                        border:        `1px solid rgba(var(--brand-rgb), 0.20)`,
                        padding:       "2px 8px",
                        borderRadius:  "100px",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}>
                        {strat.category}
                      </span>
                      <span style={{
                        fontFamily:    "var(--font-dm-mono), monospace",
                        fontSize:      "9px",
                        color:         "var(--text-tertiary)",
                        letterSpacing: "0.06em",
                      }}>
                        Est. {strat.timeframe}
                      </span>
                    </div>
                    <h3 style={{
                      fontFamily:    "var(--font-syne), sans-serif",
                      fontSize:      "14px",
                      fontWeight:    700,
                      color:         "var(--text-primary)",
                      letterSpacing: "-0.01em",
                      lineHeight:    1.3,
                      margin:        0,
                    }}>
                      {strat.title}
                    </h3>
                  </div>

                  {/* Impact / Effort scores */}
                  <div style={{
                    display:       "flex",
                    gap:           "8px",
                    flexShrink:    0,
                  }}>
                    {[
                      { label: "IMPACT", value: strat.impact, colorFn: impactColor },
                      { label: "EFFORT", value: strat.effort, colorFn: effortColor },
                    ].map(({ label, value, colorFn }) => (
                      <div key={label} style={{
                        textAlign:     "center",
                        padding:       "7px 12px",
                        background:    "var(--card)",
                        border:        "1px solid var(--border)",
                        borderRadius:  "7px",
                        minWidth:      "54px",
                      }}>
                        <div style={{
                          fontFamily:    "var(--font-dm-mono), monospace",
                          fontSize:      "18px",
                          fontWeight:    500,
                          color:         colorFn(value),
                          lineHeight:    1,
                          marginBottom:  "2px",
                        }}>
                          {value.toFixed(1)}
                        </div>
                        <div style={{
                          fontFamily:    "var(--font-dm-mono), monospace",
                          fontSize:      "8px",
                          color:         "var(--text-tertiary)",
                          letterSpacing: "0.12em",
                        }}>
                          {label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Score bars */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
                  <ScoreBar label="Impact" value={strat.impact} color={impactColor(strat.impact)} />
                  <ScoreBar label="Effort" value={strat.effort} color={effortColor(strat.effort)} />
                </div>

                {/* Rationale — expanded on selection */}
                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      key="rationale"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{   opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      style={{ overflow: "hidden" }}
                    >
                      <div style={{
                        borderTop:  "1px solid var(--border)",
                        paddingTop: "12px",
                        marginTop:  "4px",
                      }}>
                        <p style={{
                          fontFamily: "var(--font-inter), sans-serif",
                          fontSize:   "13px",
                          color:      "var(--text-secondary)",
                          lineHeight: 1.75,
                          margin:     "0 0 14px",
                        }}>
                          {strat.rationale}
                        </p>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button style={{
                            display:      "flex",
                            alignItems:   "center",
                            gap:          "5px",
                            fontFamily:   "var(--font-inter), sans-serif",
                            fontSize:     "13px",
                            fontWeight:   600,
                            color:        "#fff",
                            background:   `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 60%, #000))`,
                            border:       "none",
                            borderRadius: "7px",
                            padding:      "8px 16px",
                            cursor:       "pointer",
                            boxShadow:    "0 0 16px var(--brand-glow)",
                            transition:   "all 0.2s",
                          }}>
                            <Zap size={13} strokeWidth={2.5} />
                            Activate Strategy
                          </button>
                          <button style={{
                            display:      "flex",
                            alignItems:   "center",
                            gap:          "5px",
                            fontFamily:   "var(--font-inter), sans-serif",
                            fontSize:     "13px",
                            fontWeight:   500,
                            color:        "var(--text-secondary)",
                            background:   "transparent",
                            border:       "1px solid var(--border)",
                            borderRadius: "7px",
                            padding:      "8px 14px",
                            cursor:       "pointer",
                            transition:   "all 0.18s",
                          }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                              (e.currentTarget as HTMLElement).style.borderColor = "var(--muted)";
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                              (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                            }}
                          >
                            <ExternalLink size={12} />
                            Full Report
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!isSelected && (
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{
                      fontFamily:    "var(--font-dm-mono), monospace",
                      fontSize:      "10px",
                      color:         "var(--text-tertiary)",
                      letterSpacing: "0.06em",
                    }}>
                      CLICK TO EXPAND RATIONALE
                    </span>
                    <ChevronRight size={10} color="var(--text-tertiary)" />
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </Section>
  );
}

// Lucide ChevronRight import
function ChevronRight({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page composition
// ─────────────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [brandColor, setBrandColor] = useState("#3b82f6");
  const ga4Connected  = false;
  const gscConnected  = false;

  useEffect(() => {
    const stored = window.localStorage.getItem("rvivme-brand");
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBrandColor(stored);
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === "rvivme-brand" && e.newValue) setBrandColor(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <div style={{
      background: "var(--bg)",
      minHeight:  "100vh",
      padding:    "32px 24px 80px",
      maxWidth:   "1280px",
      margin:     "0 auto",
    }}>
      <ConnectionBanner ga4Connected={ga4Connected} gscConnected={gscConnected} />
      <DashboardHeader brandColor={brandColor} />

      <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        <ProjectionChart brandColor={brandColor} />
        <GA4Panel brandColor={brandColor} />
        <MetricsGrid />
        <TechnicalHealthBanner />
        <ActionCenter brandColor={brandColor} />
      </div>

      {/* Bottom padding spacer */}
      <div style={{ height: "40px" }} />
    </div>
  );
}
