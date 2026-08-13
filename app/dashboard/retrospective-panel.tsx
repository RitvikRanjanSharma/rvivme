"use client";

// app/dashboard/retrospective-panel.tsx
// =============================================================================
// AI Marketing Lab — "did it work?" panel
//
// Shows the verdict on the active strategy: what was done, what happened, and
// what to do next. Sits on the dashboard because it's the question a user
// should be confronted with regularly, not one they have to go looking for.
//
// Renders nothing when there's no active strategy — an empty prompt here would
// just be clutter on a dashboard that already has plenty.
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  History, ChevronDown, ChevronUp, ArrowRight,
  TrendingUp, TrendingDown, Minus, Clock, CircleAlert, CircleCheck, CirclePause,
} from "lucide-react";

type Verdict = "too_early" | "not_started" | "working" | "mixed" | "stalled" | "declining";
type Recommendation = "hold" | "continue" | "adjust" | "stop" | "wait";

type Movement = {
  keyword: string; baselinePos: number; currentPos: number | null;
  delta: number | null; status: "improved" | "declined" | "unchanged" | "not_ranking";
};

type Retro = {
  success: boolean;
  reason?: string;
  message?: string;
  strategy?: { id: string; title: string; isActive: boolean };
  verdict?: Verdict;
  recommendation?: Recommendation;
  headline?: string;
  narrative?: string;
  evidence?: string[];
  daysElapsed?: number;
  movements?: Movement[];
  summary?: {
    improved: number; declined: number; unchanged: number; notRanking: number;
    clicksDelta: number | null; positionDelta: number | null;
  };
};

const VERDICT_META: Record<Verdict, { label: string; color: string; icon: typeof History }> = {
  too_early:   { label: "Too early to tell", color: "var(--text-tertiary)",  icon: Clock       },
  not_started: { label: "Not yet attempted", color: "var(--signal-amber)",   icon: CirclePause },
  working:     { label: "Working",           color: "var(--signal-green)",   icon: CircleCheck },
  mixed:       { label: "Mixed",             color: "var(--signal-amber)",   icon: Minus       },
  stalled:     { label: "Stalled",           color: "var(--signal-amber)",   icon: CircleAlert },
  declining:   { label: "Declining",         color: "var(--signal-red)",     icon: TrendingDown},
};

const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  hold:     "Hold — don't change anything yet",
  continue: "Continue",
  adjust:   "Adjust the approach",
  stop:     "Switch to a different lever",
  wait:     "Wait and reassess",
};

export function RetrospectivePanel({ brandColor }: { brandColor: string }) {
  const [retro,   setRetro]   = useState<Retro | null>(null);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/strategies/retrospective");
      setRetro(await res.json());
    } catch {
      setRetro(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // No active strategy, or an error — stay silent rather than adding noise.
  if (loading || !retro?.success || !retro.verdict) return null;

  const meta = VERDICT_META[retro.verdict];
  const Icon = meta.icon;
  const s    = retro.summary;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "14px",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "20px 22px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "7px", marginBottom: "10px",
          fontFamily: "var(--font-mono)", fontSize: "9.5px",
          letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)",
        }}>
          <History size={11} /> Did it work?
          <span style={{ opacity: 0.5 }}>·</span>
          <span style={{ color: meta.color, display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <Icon size={11} /> {meta.label}
          </span>
        </div>

        <div style={{
          fontFamily: "var(--font-display)", fontSize: "clamp(1.05rem,2vw,1.35rem)",
          letterSpacing: "-0.02em", lineHeight: 1.3, fontWeight: 400,
          color: "var(--text-primary)", marginBottom: "10px",
        }}>
          {retro.headline}
        </div>

        <p style={{
          fontFamily: "var(--font-body)", fontSize: "13.5px",
          color: "var(--text-reading)", lineHeight: 1.7, margin: "0 0 14px",
        }}>
          {retro.narrative}
        </p>

        {/* Movement summary — only when there's something to summarise. */}
        {s && (s.improved + s.declined + s.unchanged) > 0 && (
          <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "14px" }}>
            {[
              { label: "improved",  value: s.improved,  color: "var(--signal-green)", icon: TrendingUp   },
              { label: "declined",  value: s.declined,  color: "var(--signal-red)",   icon: TrendingDown },
              { label: "unchanged", value: s.unchanged, color: "var(--text-tertiary)",icon: Minus        },
            ].filter(x => x.value > 0).map(x => (
              <div key={x.label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <x.icon size={12} color={x.color} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: x.color }}>
                  {x.value}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
                  {x.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {retro.recommendation && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "7px",
            padding: "8px 13px", borderRadius: "8px",
            background: "rgba(var(--brand-rgb),0.07)",
            border: "1px solid rgba(var(--brand-rgb),0.20)",
            fontFamily: "var(--font-body)", fontSize: "12.5px", fontWeight: 500,
            color: brandColor,
          }}>
            {RECOMMENDATION_LABEL[retro.recommendation]}
          </div>
        )}

        <div style={{ marginTop: "12px" }}>
          <button
            onClick={() => setOpen(o => !o)}
            className="aiml-touch-target"
            style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              padding: "6px 10px", background: "transparent",
              border: "1px solid var(--border)", borderRadius: "7px", cursor: "pointer",
              fontFamily: "var(--font-mono)", fontSize: "10px",
              letterSpacing: "0.08em", textTransform: "uppercase",
              color: open ? brandColor : "var(--text-secondary)",
            }}
          >
            {open ? <>Hide detail <ChevronUp size={11} /></> : <>See the numbers <ChevronDown size={11} /></>}
          </button>
        </div>
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
            <div style={{ padding: "16px 22px", borderTop: "1px solid var(--border)", background: "var(--card)" }}>
              <ol style={{ margin: 0, paddingLeft: "18px" }}>
                {(retro.evidence ?? []).map((line, i) => (
                  <li key={i} style={{
                    fontFamily: "var(--font-body)", fontSize: "13px",
                    color: "var(--text-reading)", lineHeight: 1.65, marginBottom: "6px",
                  }}>
                    {line}
                  </li>
                ))}
              </ol>

              {/* Per-keyword movement, best first. */}
              {(retro.movements ?? []).length > 0 && (
                <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: "9px",
                    letterSpacing: "0.1em", textTransform: "uppercase",
                    color: "var(--text-tertiary)", marginBottom: "8px",
                  }}>
                    Tracked keywords
                  </div>
                  {(retro.movements ?? []).slice(0, 10).map(m => (
                    <div key={m.keyword} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      gap: "10px", padding: "5px 0",
                      borderBottom: "1px solid var(--border)",
                    }}>
                      <span style={{
                        fontFamily: "var(--font-body)", fontSize: "12.5px",
                        color: "var(--text-secondary)", minWidth: 0,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {m.keyword}
                      </span>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: "11.5px", flexShrink: 0,
                        color: m.status === "improved" ? "var(--signal-green)"
                             : m.status === "declined" ? "var(--signal-red)"
                             : "var(--text-tertiary)",
                      }}>
                        {m.currentPos == null
                          ? `${m.baselinePos.toFixed(0)} → not ranking`
                          : `${m.baselinePos.toFixed(0)} → ${m.currentPos.toFixed(0)}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {retro.strategy && (
                <Link
                  href={`/strategies/${retro.strategy.id}`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "14px",
                    fontFamily: "var(--font-body)", fontSize: "12.5px", fontWeight: 500,
                    color: brandColor, textDecoration: "none",
                  }}
                >
                  Open the strategy <ArrowRight size={12} />
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
