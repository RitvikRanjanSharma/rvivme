"use client";

// app/opportunities/page.tsx
// =============================================================================
// AI Marketing Lab — Opportunities
//
// The strategist surface. Opens with a diagnosis (what's actually wrong), then
// a ranked list of actions. Every action expands to show the evidence that
// produced it — the specific Search Console numbers, in plain language.
//
// The expandable evidence is the point. It turns the recommendation from an
// assertion into an argument the user can check, and disagree with.
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import { BRAND_DEFAULT } from "@/app/ui/app-shell";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target, TrendingDown, MousePointerClick, GitMerge, Search,
  ChevronDown, ChevronUp, RefreshCw, AlertTriangle, ArrowRight, Stethoscope, Sprout,
} from "lucide-react";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

type OpportunityKind = "striking_distance" | "ctr_gap" | "cannibalisation" | "decay" | "foundation";

type Opportunity = {
  kind:        OpportunityKind;
  title:       string;
  query:       string;
  page?:       string;
  score:       number;
  clickUpside: number | null;
  effort:      "low" | "medium" | "high";
  confidence:  "high" | "medium" | "low";
  evidence:    string[];
  metrics: {
    clicks: number; impressions: number; ctr: number; position: number;
    expectedCtr?: number; pages?: string[];
    previousClicks?: number; previousImpressions?: number;
  };
};

type Report = {
  success:   boolean;
  reason?:   string;
  message?:  string;
  diagnosis?: { headline: string; detail: string };
  opportunities?: Opportunity[];
  counts?:   Record<OpportunityKind, number>;
  scale?:    { isEarlyStage: boolean; totalImpressions: number; queryCount: number };
  brand?:    { detected: boolean; brandedQueries: number; brandedShare: number };
  curve?:    { fromSiteData: boolean; measuredPositions: number };
  period?:   {
    queryCount: number; previousQueryCount: number;
    current?:  { startDate: string; endDate: string };
    previous?: { startDate: string; endDate: string };
  };
};

const KIND_META: Record<OpportunityKind, { label: string; icon: typeof Target; color: string }> = {
  striking_distance: { label: "Striking distance", icon: Target,             color: "var(--brand)"         },
  ctr_gap:           { label: "Click-through gap", icon: MousePointerClick,  color: "var(--signal-amber)"  },
  cannibalisation:   { label: "Cannibalisation",   icon: GitMerge,           color: "var(--signal-red)"    },
  decay:             { label: "Losing ground",     icon: TrendingDown,       color: "var(--signal-red)"    },
  foundation:        { label: "Foundation",         icon: Sprout,             color: "var(--signal-green)"  },
};

const EFFORT_LABEL = { low: "Quick", medium: "Moderate", high: "Involved" } as const;

/** "14 Jul – 10 Aug" — states exactly which window the numbers describe. */
function fmtRange(r: { startDate: string; endDate: string }): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const from = new Date(r.startDate).toLocaleDateString("en-GB", opts);
  const to   = new Date(r.endDate).toLocaleDateString("en-GB", opts);
  return `${from} – ${to}`;
}

function OpportunityCard({ opp, index, brandColor }: {
  opp: Opportunity; index: number; brandColor: string;
}) {
  const [open, setOpen] = useState(false);
  const meta = KIND_META[opp.kind];
  const Icon = meta.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay: Math.min(index * 0.04, 0.3) }}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
          <div style={{
            width: "30px", height: "30px", borderRadius: "8px", flexShrink: 0,
            background: "var(--card)", border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon size={14} color={meta.color} />
          </div>

          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{
              fontFamily: "var(--font-body)", fontSize: "14.5px", fontWeight: 600,
              color: "var(--text-primary)", marginBottom: "4px", overflowWrap: "break-word",
            }}>
              {opp.title}
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
              fontFamily: "var(--font-mono)", fontSize: "10px",
              letterSpacing: "0.08em", textTransform: "uppercase",
              color: "var(--text-tertiary)",
            }}>
              <span style={{ color: meta.color }}>{meta.label}</span>
              <span>·</span>
              <span>{EFFORT_LABEL[opp.effort]}</span>
              {opp.kind !== "foundation" && (
                <>
                  <span>·</span>
                  <span>Pos {opp.metrics.position}</span>
                  <span>·</span>
                  <span>{opp.metrics.impressions.toLocaleString()} impr</span>
                </>
              )}
              {opp.confidence !== "high" && (
                <>
                  <span>·</span>
                  <span
                    title={opp.confidence === "low"
                      ? "Based on a small number of impressions — treat as a hint, not a finding."
                      : "Moderate sample size."}
                    style={{ color: opp.confidence === "low" ? "var(--signal-amber)" : "var(--text-tertiary)" }}
                  >
                    {opp.confidence} confidence
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Upside is deliberately absent for cannibalisation rather than
              invented — the honesty is the product. */}
          {opp.clickUpside !== null && (
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: "20px",
                letterSpacing: "-0.03em", lineHeight: 1, color: brandColor,
              }}>
                +{opp.clickUpside}
              </div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: "9px",
                letterSpacing: "0.1em", textTransform: "uppercase",
                color: "var(--text-tertiary)", marginTop: "3px",
              }}>
                clicks/mo
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setOpen(o => !o)}
          className="aiml-touch-target"
          style={{
            display: "inline-flex", alignItems: "center", gap: "5px",
            marginTop: "12px", padding: "6px 10px",
            background: "transparent", border: "1px solid var(--border)",
            borderRadius: "7px", cursor: "pointer",
            fontFamily: "var(--font-mono)", fontSize: "10px",
            letterSpacing: "0.08em", textTransform: "uppercase",
            color: open ? brandColor : "var(--text-secondary)",
            transition: "color 0.15s, border-color 0.15s",
          }}
        >
          {open ? <>Hide reasoning <ChevronUp size={11} /></> : <>Why this <ChevronDown size={11} /></>}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{    opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{
              padding: "16px 18px",
              borderTop: "1px solid var(--border)",
              background: "var(--card)",
            }}>
              <ol style={{ margin: 0, paddingLeft: "18px" }}>
                {opp.evidence.map((line, i) => (
                  <li key={i} style={{
                    fontFamily: "var(--font-body)", fontSize: "13px",
                    color: "var(--text-reading)", lineHeight: 1.65,
                    marginBottom: i === opp.evidence.length - 1 ? 0 : "7px",
                  }}>
                    {line}
                  </li>
                ))}
              </ol>

              {opp.metrics.pages && opp.metrics.pages.length > 0 && (
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: "9px",
                    letterSpacing: "0.1em", textTransform: "uppercase",
                    color: "var(--text-tertiary)", marginBottom: "6px",
                  }}>
                    Competing pages
                  </div>
                  {opp.metrics.pages.map(p => (
                    <div key={p} style={{
                      fontFamily: "var(--font-mono)", fontSize: "11.5px",
                      color: "var(--text-secondary)", padding: "2px 0",
                      overflowWrap: "anywhere",
                    }}>
                      {p}
                    </div>
                  ))}
                </div>
              )}

              <div style={{
                marginTop: "12px", paddingTop: "10px",
                borderTop: "1px solid var(--border)",
                fontFamily: "var(--font-mono)", fontSize: "10px",
                color: "var(--text-tertiary)", letterSpacing: "0.05em",
              }}>
                Source: your Google Search Console, last 28 days.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function OpportunitiesPage() {
  const [brandColor, setBrandColor] = useState(BRAND_DEFAULT);
  const [report,  setReport]  = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<OpportunityKind | "all">("all");

  useEffect(() => {
    const b = localStorage.getItem("aiml-brand") || localStorage.getItem("rvivme-brand");
    if (b) setBrandColor(b);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/opportunities");
      setReport(await res.json());
    } catch (e) {
      setReport({ success: false, reason: "api_error", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const opportunities = report?.opportunities ?? [];
  const visible = filter === "all" ? opportunities : opportunities.filter(o => o.kind === filter);
  const totalUpside = opportunities.reduce((s, o) => s + (o.clickUpside ?? 0), 0);

  return (
    <div className="aiml-page-pad" style={{
      background: "var(--bg)", minHeight: "100vh",
      padding: "32px 24px 80px", maxWidth: "1000px", margin: "0 auto",
    }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 className="aiml-page-title" style={{
            fontFamily: "var(--font-display)", fontSize: "clamp(1.6rem,3.2vw,2.4rem)",
            letterSpacing: "-0.04em", lineHeight: 1.05, fontWeight: 400,
            color: "var(--text-primary)", marginBottom: "6px",
          }}>
            Opportunities
          </h1>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: "11px",
            color: "var(--text-tertiary)", letterSpacing: "0.06em",
          }}>
            RANKED BY LIKELY RETURN · FROM YOUR SEARCH CONSOLE
          </div>
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="aiml-touch-target"
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            fontFamily: "var(--font-mono)", fontSize: "11px",
            color: "var(--text-secondary)", background: "transparent",
            border: "1px solid var(--border)", borderRadius: "8px",
            padding: "9px 14px", cursor: "pointer", letterSpacing: "0.06em",
          }}
        >
          <RefreshCw size={11} style={{ animation: loading ? "spin 0.7s linear infinite" : "none" }} />
          REFRESH
        </button>
      </motion.div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              height: "96px", borderRadius: "12px",
              background: "linear-gradient(90deg, var(--card) 25%, var(--muted) 50%, var(--card) 75%)",
              backgroundSize: "200% 100%", animation: "shimmer 1.4s ease-in-out infinite",
            }} />
          ))}
        </div>
      )}

      {/* Not-connected / error states */}
      {!loading && report && !report.success && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: "10px",
          padding: "16px 18px", borderRadius: "12px",
          background: "rgba(255,171,0,0.07)", border: "1px solid rgba(255,171,0,0.25)",
        }}>
          <AlertTriangle size={15} color="var(--signal-amber)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 500, color: "var(--text-primary)", marginBottom: "4px" }}>
              {report.reason === "not_configured" || report.reason === "not_connected"
                ? "Connect Search Console to see your opportunities"
                : report.reason === "reauth_required"
                ? "Google access expired"
                : "Couldn't load opportunities"}
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {report.message}
            </div>
            <Link href="/settings?tab=integrations" style={{
              display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "12px",
              fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
              color: "#fff", background: brandColor, textDecoration: "none",
              padding: "8px 16px", borderRadius: "100px",
            }}>
              Open settings <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      )}

      {!loading && report?.success && (
        <>
          {/* Diagnosis — the strategist's opening statement */}
          {report.diagnosis && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.05 }}
              style={{
                padding: "20px 22px", marginBottom: "24px",
                background: "rgba(var(--brand-rgb),0.05)",
                border: "1px solid rgba(var(--brand-rgb),0.20)",
                borderRadius: "14px",
              }}
            >
              <div style={{
                display: "flex", alignItems: "center", gap: "7px", marginBottom: "8px",
                fontFamily: "var(--font-mono)", fontSize: "9.5px",
                letterSpacing: "0.12em", textTransform: "uppercase", color: brandColor,
              }}>
                <Stethoscope size={11} /> Diagnosis
              </div>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: "clamp(1.15rem,2.2vw,1.5rem)",
                letterSpacing: "-0.02em", lineHeight: 1.25, fontWeight: 400,
                color: "var(--text-primary)", marginBottom: "10px",
              }}>
                {report.diagnosis.headline}
              </div>
              <p style={{
                fontFamily: "var(--font-body)", fontSize: "14px",
                color: "var(--text-reading)", lineHeight: 1.7, margin: 0,
              }}>
                {report.diagnosis.detail}
              </p>
            </motion.div>
          )}

          {opportunities.length > 0 && (
            <>
              {/* Summary + filters */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px", alignItems: "center" }}>
                {(["all", "striking_distance", "ctr_gap", "cannibalisation", "decay", "foundation"] as const).map(k => {
                  const count = k === "all" ? opportunities.length : (report.counts?.[k] ?? 0);
                  if (k !== "all" && count === 0) return null;
                  const active = filter === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setFilter(k)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "6px",
                        padding: "7px 13px", borderRadius: "100px", cursor: "pointer",
                        fontFamily: "var(--font-mono)", fontSize: "10px",
                        letterSpacing: "0.08em", textTransform: "uppercase",
                        border: `1px solid ${active ? "rgba(var(--brand-rgb),0.4)" : "var(--border)"}`,
                        background: active ? "rgba(var(--brand-rgb),0.08)" : "transparent",
                        color: active ? brandColor : "var(--text-secondary)",
                        transition: "all 0.15s",
                      }}
                    >
                      {k === "all" ? "All" : KIND_META[k].label}
                      <span style={{ opacity: 0.65 }}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {totalUpside > 0 && (
                <div style={{
                  fontFamily: "var(--font-body)", fontSize: "13px",
                  color: "var(--text-secondary)", marginBottom: "16px", lineHeight: 1.6,
                }}>
                  Acting on everything here is worth roughly{" "}
                  <strong style={{ color: "var(--text-primary)" }}>
                    {totalUpside.toLocaleString()} extra clicks a month
                  </strong>
                  . Estimates are modelled from your own click-through rates
                  {report.curve?.fromSiteData ? "" : " and category averages"} — treat
                  them as direction, not promise.
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {visible.map((opp, i) => (
                  <OpportunityCard
                    key={`${opp.kind}-${opp.query}-${i}`}
                    opp={opp}
                    index={i}
                    brandColor={brandColor}
                  />
                ))}
              </div>

              <div style={{
                marginTop: "22px", paddingTop: "16px",
                borderTop: "1px solid var(--border)",
                fontFamily: "var(--font-body)", fontSize: "11.5px",
                color: "var(--text-tertiary)", lineHeight: 1.65,
              }}>
                Built from {report.period?.queryCount?.toLocaleString() ?? 0} queries in your
                Search Console
                {report.period?.current
                  ? ` for ${fmtRange(report.period.current)}`
                  : " over the last 28 days"}
                {report.period?.previousQueryCount && report.period?.previous
                  ? `, compared against ${report.period.previousQueryCount.toLocaleString()} from ${fmtRange(report.period.previous)}`
                  : ""}
                . Search Console finalises data on a 2-3 day delay, so the most recent
                days are never included — that's Google's lag, not a stale report
                {report.brand?.detected && report.brand.brandedQueries > 0
                  ? `. ${report.brand.brandedQueries} brand ${report.brand.brandedQueries === 1 ? "search is" : "searches are"} excluded from the analysis (${report.brand.brandedShare}% of impressions) — you already rank for your own name, so those aren't opportunities`
                  : ""}
                . {report.curve?.fromSiteData
                  ? `Expected click-through rates are measured from your own pages across ${report.curve.measuredPositions} ranking positions.`
                  : "Not enough data yet to measure your own click-through curve, so category averages are used — expect these estimates to sharpen as your traffic grows."}
              </div>
            </>
          )}

          {opportunities.length === 0 && (
            <div style={{
              padding: "48px 24px", textAlign: "center",
              background: "var(--surface)", border: "1px dashed var(--border)",
              borderRadius: "12px",
            }}>
              <Search size={20} color="var(--text-tertiary)" />
              <div style={{ fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 500, color: "var(--text-primary)", margin: "10px 0 6px" }}>
                No clear opportunities yet
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: "440px", margin: "0 auto" }}>
                This usually means Search Console hasn&rsquo;t accumulated enough data yet.
                Come back once you have a few weeks of impressions.
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>
    </div>
  );
}
