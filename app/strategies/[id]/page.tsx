"use client";

// app/strategies/[id]/page.tsx
// =============================================================================
// AI Marketing Lab — Strategy detail / execution view
// The other half of /strategies. Here the user works a single strategy:
//   - the AI-generated checklist they can tick off
//   - the keywords attached to the strategy
//   - live GSC delta vs. the baseline snapshotted at activation
//   - one-click jump into /content to draft a post against this strategy
//
// This page is client-side by design: every fetch is gated by Supabase RLS and
// /api/claude for AI work. Keeping it client-side matches the rest of the app
// (dashboard, keywords, competitors, etc.).
// =============================================================================

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, PenLine, Sparkles, Target, CheckCircle2, Circle, Trash2,
  Zap, TrendingUp, TrendingDown, Minus, RefreshCw, AlertCircle, Tag,
  FileText, Layout, MessageSquare, Mail, Wrench, Link2, Megaphone,
} from "lucide-react";
import {
  getStrategy, getChecklist, getStrategyKeywords,
  generateAndSavePlan, toggleChecklistItem, detachKeyword,
  setActiveStrategy, archiveStrategy, markStrategyCompleted,
  computeProgress,
  type Strategy, type StrategyChecklist, type StrategyKeyword, type CurrentGsc,
} from "@/lib/strategies";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

// Map action_type → icon for the checklist.
const ACTION_ICON: Record<NonNullable<StrategyChecklist["action_type"]>, React.ComponentType<{size?:number;color?:string}>> = {
  blog:          FileText,
  article:       FileText,
  landing:       Layout,
  social:        MessageSquare,
  email:         Mail,
  meta:          Tag,
  internal_link: Link2,
  outreach:      Megaphone,
  tech:          Wrench,
  custom:        Sparkles,
};

export default function StrategyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [strategy,  setStrategy]  = useState<Strategy | null>(null);
  const [checklist, setChecklist] = useState<StrategyChecklist[]>([]);
  const [keywords,  setKeywords]  = useState<StrategyKeyword[]>([]);
  const [gscNow,    setGscNow]    = useState<CurrentGsc | null>(null);

  const [loading,     setLoading]     = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [busy,        setBusy]        = useState<string | null>(null);

  async function loadAll() {
    if (!id) return;
    setLoading(true); setError(null);
    try {
      const [s, c, k] = await Promise.all([
        getStrategy(id),
        getChecklist(id),
        getStrategyKeywords(id),
      ]);
      setStrategy(s);
      setChecklist(c);
      setKeywords(k);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load strategy.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  // Pull a "current GSC" snapshot in parallel — used for the delta panel.
  useEffect(() => {
    fetch("/api/gsc")
      .then(r => r.json())
      .then(d => {
        if (d?.success) {
          const topK: Record<string, number> = {};
          (d.topQueries ?? []).forEach((q: { query: string; position: number }) => {
            if (q?.query) topK[q.query.toLowerCase()] = q.position;
          });
          setGscNow({
            avgPosition: d.summary?.position,
            clicks:      d.summary?.clicks,
            ctr:         d.summary?.ctr,
            keywordPos:  topK,
          });
        }
      })
      .catch(() => { /* non-fatal */ });
  }, []);

  async function handleGeneratePlan() {
    if (!strategy) return;
    setPlanLoading(true); setError(null);
    try {
      // Pull a fresh-ish site context so Claude can tailor the plan.
      const [gscRes, ga4Res] = await Promise.allSettled([
        fetch("/api/gsc").then(r => r.json()),
        fetch("/api/ga4").then(r => r.json()),
      ]);
      const gsc = gscRes.status === "fulfilled" && gscRes.value?.success ? gscRes.value : null;
      const ga4 = ga4Res.status === "fulfilled" && ga4Res.value?.success ? ga4Res.value : null;

      const newChecklist = await generateAndSavePlan({
        strategy,
        siteContext: {
          clicks:       gsc?.summary?.clicks,
          impressions:  gsc?.summary?.impressions,
          avgPosition:  gsc?.summary?.position,
          ctr:          gsc?.summary?.ctr,
          sessions:     ga4?.summary?.sessions,
          topQueries:   (gsc?.topQueries ?? []).slice(0,6).map((q: { query: string }) => q.query),
          contentCount: 0,
        },
        replace: true,
      });
      setChecklist(newChecklist);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Plan generation failed.");
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleToggle(itemId: string, currentDone: boolean) {
    // Optimistic update.
    setChecklist(xs => xs.map(c => c.id === itemId
      ? { ...c, is_completed: !currentDone, completed_at: !currentDone ? new Date().toISOString() : null }
      : c));
    try {
      await toggleChecklistItem(itemId, !currentDone);
    } catch {
      // Roll back on error.
      setChecklist(xs => xs.map(c => c.id === itemId
        ? { ...c, is_completed: currentDone }
        : c));
    }
  }

  async function handleDetach(kwId: string) {
    setKeywords(xs => xs.filter(k => k.id !== kwId));
    try { await detachKeyword(kwId); } catch { await loadAll(); }
  }

  async function handleStrategyAction(kind: "activate" | "archive" | "complete") {
    if (!strategy) return;
    setBusy(kind);
    try {
      if (kind === "activate") await setActiveStrategy(strategy.id);
      if (kind === "archive")  await archiveStrategy(strategy.id);
      if (kind === "complete") await markStrategyCompleted(strategy.id);
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  const progress = useMemo(() => {
    if (!strategy) return null;
    return computeProgress(strategy, checklist, keywords, gscNow);
  }, [strategy, checklist, keywords, gscNow]);

  return (
    <div style={{ padding: "28px 36px 72px", maxWidth: 1120, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <Link href="/strategies" style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em",
        color: "var(--text-tertiary)", textDecoration: "none", marginBottom: 18,
      }}>
        <ArrowLeft size={12}/> ALL STRATEGIES
      </Link>

      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
          background: "rgba(255,23,68,0.06)", border: "1px solid rgba(255,23,68,0.25)",
          borderRadius: 10, marginBottom: 20, fontFamily: "var(--font-body)", fontSize: 13,
          color: "var(--signal-red)",
        }}>
          <AlertCircle size={14}/>{error}
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{
              height: i===1 ? 140 : 90, borderRadius: 14,
              background: "linear-gradient(90deg, var(--card) 25%, var(--muted) 50%, var(--card) 75%)",
              backgroundSize: "200% 100%", animation: "shimmer 1.4s ease-in-out infinite",
            }}/>
          ))}
          <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
        </div>
      )}

      {!loading && strategy && progress && (
        <>
          {/* Header card */}
          <motion.header
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE_EXPO }}
            style={{
              background: "var(--surface)",
              border: `1px solid ${strategy.is_active ? "rgba(var(--brand-rgb), 0.45)" : "var(--border)"}`,
              borderRadius: 16,
              padding: "28px 30px",
              boxShadow: strategy.is_active ? "0 0 32px var(--brand-glow)" : "none",
              position: "relative", overflow: "hidden", marginBottom: 22,
            }}>
            {strategy.is_active && (
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 2,
                background: "linear-gradient(90deg, transparent, var(--brand), transparent)",
              }}/>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
                color: "var(--brand)", background: "rgba(var(--brand-rgb), 0.12)",
                border: "1px solid rgba(var(--brand-rgb), 0.35)",
                padding: "4px 10px", borderRadius: 7, minWidth: 38, textAlign: "center",
              }}>{strategy.acronym ?? "STR"}</span>
              {strategy.category && (
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: "var(--text-tertiary)",
                }}>{strategy.category}</span>
              )}
              <span aria-hidden="true" style={{ color: "var(--text-tertiary)" }}>·</span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: strategy.is_active ? "var(--brand)"
                  : strategy.status === "completed" ? "var(--signal-green)"
                  : strategy.status === "dismissed" ? "var(--text-tertiary)"
                  : "var(--text-secondary)",
              }}>{strategy.is_active ? "Active" : strategy.status}</span>
              {strategy.timeframe && (
                <>
                  <span aria-hidden="true" style={{ color: "var(--text-tertiary)" }}>·</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                    Est. {strategy.timeframe}
                  </span>
                </>
              )}
            </div>

            <h1 style={{
              fontFamily: "var(--font-display)", fontSize: "clamp(1.6rem, 3vw, 2.1rem)",
              lineHeight: 1.1, letterSpacing: "-0.03em", margin: 0, color: "var(--text-primary)",
            }}>{strategy.title}</h1>

            <p style={{
              fontFamily: "var(--font-body)", fontSize: 14.5, color: "var(--text-secondary)",
              lineHeight: 1.75, margin: "14px 0 0", maxWidth: 780,
            }}>{strategy.rationale}</p>

            {/* Meta row: impact / effort / progress tiles */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 10, marginTop: 22,
            }}>
              <MetaTile label="Impact"   value={strategy.impact_score.toFixed(1)} unit="/10"
                color={strategy.impact_score >= 8.5 ? "var(--signal-green)" : strategy.impact_score >= 6.5 ? "var(--brand)" : "var(--signal-amber)"}/>
              <MetaTile label="Effort"   value={strategy.effort_score.toFixed(1)} unit="/10"
                color={strategy.effort_score >= 7.5 ? "var(--signal-red)" : strategy.effort_score >= 5.0 ? "var(--signal-amber)" : "var(--signal-green)"}/>
              <MetaTile label="Checklist" value={`${progress.checklistDone}/${progress.checklistTotal || 0}`} unit=""
                color="var(--text-primary)"/>
              <MetaTile label="Overall"   value={`${Math.round(progress.overallPct * 100)}`} unit="%"
                color="var(--brand)"/>
            </div>

            {/* Overall progress bar */}
            <div style={{ marginTop: 22 }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 6, fontFamily: "var(--font-mono)", fontSize: 10,
                letterSpacing: "0.1em", color: "var(--text-tertiary)", textTransform: "uppercase",
              }}>
                <span>Overall progress</span>
                <span>{Math.round(progress.overallPct * 100)}%</span>
              </div>
              <div style={{
                height: 6, borderRadius: 3, background: "var(--muted)", overflow: "hidden",
              }}>
                <motion.div
                  initial={{ width: 0 }} animate={{ width: `${progress.overallPct * 100}%` }}
                  transition={{ duration: 0.8, ease: EASE_EXPO }}
                  style={{
                    height: "100%", background: "linear-gradient(90deg, var(--brand), rgba(var(--brand-rgb),0.55))",
                    boxShadow: "0 0 14px var(--brand-glow)",
                  }}
                />
              </div>
              {progress.gscDelta && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)", marginTop: 6 }}>
                  60% checklist execution · 40% GSC traction
                </div>
              )}
            </div>

            {/* Primary actions */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 22 }}>
              <Link href={`/content?strategy=${strategy.id}`} style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 500,
                color: "#fff", background: "var(--brand)", textDecoration: "none",
                borderRadius: 8, padding: "9px 16px",
              }}>
                <PenLine size={13}/> Draft content for this strategy
              </Link>

              {!strategy.is_active && strategy.status === "active" && (
                <button onClick={() => handleStrategyAction("activate")} disabled={busy !== null} style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 500,
                  color: "var(--text-primary)", background: "var(--muted)",
                  border: "1px solid var(--border)",
                  borderRadius: 8, padding: "9px 14px", cursor: busy ? "default" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}>
                  <Zap size={13}/> Make active
                </button>
              )}

              {strategy.status === "active" && (
                <button onClick={() => handleStrategyAction("complete")} disabled={busy !== null} style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  fontFamily: "var(--font-body)", fontSize: 13,
                  color: "var(--signal-green)", background: "transparent",
                  border: "1px solid rgba(0,230,118,0.30)",
                  borderRadius: 8, padding: "9px 14px", cursor: busy ? "default" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}>
                  <CheckCircle2 size={13}/> Mark done
                </button>
              )}

              {strategy.status === "active" && (
                <button onClick={() => handleStrategyAction("archive")} disabled={busy !== null} style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  fontFamily: "var(--font-body)", fontSize: 13,
                  color: "var(--text-secondary)", background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: 8, padding: "9px 14px", cursor: busy ? "default" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}>
                  Archive
                </button>
              )}
            </div>
          </motion.header>

          {/* Two-column content grid on wide screens */}
          <div style={{
            display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 22, alignItems: "start",
          }}>
            {/* Left column: Plan + GSC delta */}
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

              {/* ─── Plan / checklist ─── */}
              <SectionPanel
                label="AI-generated plan"
                right={
                  <button onClick={handleGeneratePlan} disabled={planLoading} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em",
                    color: "var(--brand)", background: "rgba(var(--brand-rgb),0.10)",
                    border: "1px solid rgba(var(--brand-rgb),0.28)",
                    borderRadius: 6, padding: "5px 10px", cursor: planLoading ? "default" : "pointer",
                    textTransform: "uppercase",
                  }}>
                    {planLoading
                      ? <div style={{ width: 10, height: 10, border: "1.5px solid rgba(var(--brand-rgb),0.3)",
                          borderTopColor: "var(--brand)", borderRadius: "50%",
                          animation: "spin 0.7s linear infinite" }}/>
                      : <RefreshCw size={10}/>}
                    {planLoading ? "Generating…" : checklist.length ? "Regenerate" : "Generate plan"}
                  </button>
                }
              >
                {/* Checklist progress meter */}
                {checklist.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      fontFamily: "var(--font-mono)", fontSize: 10,
                      letterSpacing: "0.08em", color: "var(--text-tertiary)",
                      textTransform: "uppercase", marginBottom: 6,
                    }}>
                      <span>Checklist</span>
                      <span>{progress.checklistDone}/{progress.checklistTotal}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: "var(--muted)", overflow: "hidden" }}>
                      <motion.div
                        initial={{ width: 0 }} animate={{ width: `${progress.checklistPct * 100}%` }}
                        transition={{ duration: 0.6, ease: EASE_EXPO }}
                        style={{ height: "100%", background: "var(--signal-green)" }}
                      />
                    </div>
                  </div>
                )}

                {planLoading && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[1,2,3,4].map(i => (
                      <div key={i} style={{
                        height: 58, borderRadius: 10,
                        background: "linear-gradient(90deg, var(--card) 25%, var(--muted) 50%, var(--card) 75%)",
                        backgroundSize: "200% 100%", animation: "shimmer 1.4s ease-in-out infinite",
                      }}/>
                    ))}
                  </div>
                )}

                {!planLoading && checklist.length === 0 && (
                  <div style={{
                    padding: "32px 20px", border: "1px dashed var(--border)",
                    borderRadius: 12, textAlign: "center",
                  }}>
                    <Sparkles size={22} color="var(--text-tertiary)" style={{ marginBottom: 10 }}/>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-primary)", marginBottom: 4 }}>
                      No plan yet.
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
                      Generate a step-by-step plan tailored to your site's current GSC and GA4 data.
                    </div>
                    <button onClick={handleGeneratePlan} style={{
                      display: "inline-flex", alignItems: "center", gap: 7,
                      fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 500,
                      color: "#fff", background: "var(--brand)", border: "none",
                      borderRadius: 100, padding: "9px 20px", cursor: "pointer",
                    }}>
                      <Sparkles size={13}/> Generate plan
                    </button>
                  </div>
                )}

                {!planLoading && checklist.length > 0 && (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                    <AnimatePresence initial={false}>
                      {checklist.map((c, idx) => (
                        <ChecklistItem key={c.id} item={c} index={idx}
                          onToggle={() => handleToggle(c.id, c.is_completed)}
                          strategyId={strategy.id}/>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </SectionPanel>

              {/* ─── GSC traction vs baseline ─── */}
              <SectionPanel label="GSC traction" right={null}>
                {!progress.gscDelta && (
                  <div style={{
                    padding: "20px", fontFamily: "var(--font-body)", fontSize: 13,
                    color: "var(--text-secondary)", textAlign: "center",
                  }}>
                    {strategy.baseline_metrics
                      ? "Waiting for fresh GSC data to compute traction against your baseline…"
                      : "No baseline was captured when this strategy was activated. Traction will appear once the next activation captures a snapshot."}
                  </div>
                )}
                {progress.gscDelta && (
                  <div style={{
                    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 10,
                  }}>
                    <DeltaTile label="Avg position" delta={progress.gscDelta.avgPositionDelta}
                      invert unit="" decimals={2}/>
                    <DeltaTile label="Clicks" delta={progress.gscDelta.clicksDelta} unit="" decimals={0}/>
                    <DeltaTile label="CTR" delta={progress.gscDelta.ctrDelta} unit="%" decimals={2}/>
                    <DeltaTile label="Coverage"
                      delta={progress.gscDelta.coverage}
                      unit="%" decimals={0}
                      staticValue
                      transform={v => v * 100}/>
                  </div>
                )}
              </SectionPanel>

            </div>

            {/* Right column: Keywords */}
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <SectionPanel
                label="Target keywords"
                right={
                  <Link href="/keywords" style={{
                    fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em",
                    color: "var(--brand)", textDecoration: "none", textTransform: "uppercase",
                  }}>
                    Add from /keywords →
                  </Link>
                }
              >
                {keywords.length === 0 && (
                  <div style={{
                    padding: "24px 18px", fontFamily: "var(--font-body)", fontSize: 13,
                    color: "var(--text-secondary)", textAlign: "center",
                    border: "1px dashed var(--border)", borderRadius: 10,
                  }}>
                    <Target size={20} color="var(--text-tertiary)" style={{ marginBottom: 8 }}/>
                    <div>No keywords attached yet.</div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6 }}>
                      Go to Keywords, select a few, and save them to this strategy.
                    </div>
                  </div>
                )}

                {keywords.length > 0 && (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    {keywords.map(k => (
                      <li key={k.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                        padding: "9px 12px", background: "var(--card)",
                        border: "1px solid var(--border)", borderRadius: 9,
                      }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
                            {k.keyword}
                          </div>
                          <div style={{
                            display: "flex", gap: 10, marginTop: 2,
                            fontFamily: "var(--font-mono)", fontSize: 10,
                            color: "var(--text-tertiary)", letterSpacing: "0.04em",
                          }}>
                            {k.volume != null && <span>VOL {k.volume.toLocaleString()}</span>}
                            {k.difficulty != null && <span>KD {k.difficulty}</span>}
                            {k.intent && <span style={{ textTransform: "uppercase" }}>{k.intent}</span>}
                            {k.baseline_pos != null && <span>POS {k.baseline_pos.toFixed(1)}</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDetach(k.id)}
                          title="Remove from strategy"
                          aria-label="Remove keyword"
                          style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            background: "transparent", border: "1px solid var(--border)",
                            borderRadius: 7, padding: 5, cursor: "pointer",
                            color: "var(--text-tertiary)",
                          }}
                        >
                          <Trash2 size={12}/>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionPanel>

              {/* Baseline info */}
              {strategy.baseline_metrics && (
                <SectionPanel label="Baseline snapshot" right={null}>
                  <BaselineView baseline={strategy.baseline_metrics as unknown as {
                    capturedAt?: string;
                    domain?: string;
                    gsc?: { clicks: number; impressions: number; avgPosition: number; ctr: number };
                    ga4?: { sessions: number; users: number };
                  }}/>
                </SectionPanel>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function MetaTile({ label, value, unit, color }: {
  label: string; value: string; unit: string; color: string;
}) {
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "12px 14px",
    }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em",
        color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 5,
      }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500, color, lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>{unit}</span>}
      </div>
    </div>
  );
}

function SectionPanel({ label, right, children }: {
  label: string; right: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 14, padding: "18px 20px 20px",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 14, gap: 8, flexWrap: "wrap",
      }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
          textTransform: "uppercase", color: "var(--text-tertiary)",
        }}>{label}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

function ChecklistItem({
  item, index, onToggle, strategyId,
}: {
  item: StrategyChecklist;
  index: number;
  onToggle: () => void;
  strategyId: string;
}) {
  const Icon = item.action_type ? ACTION_ICON[item.action_type] : Sparkles;

  // Actionable types get a CTA that preloads /content.
  const canDraft = item.action_type && ["blog","article","landing","social","email"].includes(item.action_type);
  const draftHref = canDraft
    ? `/content?strategy=${strategyId}&checklist=${item.id}&type=${item.action_type}`
    : null;

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE_EXPO, delay: index * 0.03 }}
      style={{
        display: "flex", alignItems: "flex-start", gap: 12,
        padding: "12px 14px",
        background: item.is_completed ? "rgba(0,230,118,0.04)" : "var(--card)",
        border: `1px solid ${item.is_completed ? "rgba(0,230,118,0.22)" : "var(--border)"}`,
        borderRadius: 11,
      }}
    >
      <button
        onClick={onToggle}
        aria-label={item.is_completed ? "Mark incomplete" : "Mark complete"}
        style={{
          flexShrink: 0, marginTop: 2,
          background: "transparent", border: "none", cursor: "pointer", padding: 0,
          color: item.is_completed ? "var(--signal-green)" : "var(--text-tertiary)",
          display: "flex",
        }}
      >
        {item.is_completed
          ? <CheckCircle2 size={18}/>
          : <Circle size={18}/>}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3,
        }}>
          <Icon size={12} color="var(--text-tertiary)"/>
          {item.action_type && (
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em",
              color: "var(--text-tertiary)", textTransform: "uppercase",
            }}>{item.action_type.replace("_"," ")}</span>
          )}
        </div>
        <div style={{
          fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 500,
          color: item.is_completed ? "var(--text-secondary)" : "var(--text-primary)",
          textDecoration: item.is_completed ? "line-through" : "none",
          lineHeight: 1.4,
        }}>
          {item.title}
        </div>
        {item.description && (
          <p style={{
            fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)",
            lineHeight: 1.65, margin: "6px 0 0",
          }}>{item.description}</p>
        )}

        {draftHref && !item.is_completed && (
          <div style={{ marginTop: 9 }}>
            <Link href={draftHref} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500,
              color: "var(--brand)",
              background: "rgba(var(--brand-rgb),0.10)",
              border: "1px solid rgba(var(--brand-rgb),0.25)",
              textDecoration: "none",
              borderRadius: 7, padding: "5px 10px",
            }}>
              <PenLine size={11}/> Draft this {item.action_type}
            </Link>
          </div>
        )}
      </div>
    </motion.li>
  );
}

// Directional delta display. "invert" flips the sense of good/bad (position ↓ = good).
function DeltaTile({
  label, delta, unit, decimals = 2, invert = false, staticValue = false,
  transform,
}: {
  label: string; delta: number; unit: string;
  decimals?: number; invert?: boolean; staticValue?: boolean;
  transform?: (v: number) => number;
}) {
  const v = transform ? transform(delta) : delta;
  const sign = delta === 0 ? "flat" : (invert ? (delta < 0 ? "good" : "bad") : (delta > 0 ? "good" : "bad"));
  const color = staticValue ? "var(--text-primary)"
    : sign === "good" ? "var(--signal-green)"
    : sign === "bad"  ? "var(--signal-red)"
    : "var(--text-secondary)";
  const Icon = staticValue ? Minus : (sign === "good" ? TrendingUp : sign === "bad" ? TrendingDown : Minus);
  const prefix = staticValue ? "" : (delta > 0 ? "+" : "");
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "12px 14px",
    }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em",
        color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 6,
      }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color }}>
        <Icon size={14}/>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 500, lineHeight: 1 }}>
          {prefix}{v.toFixed(decimals)}{unit}
        </span>
      </div>
    </div>
  );
}

function BaselineView({ baseline }: {
  baseline: {
    capturedAt?: string;
    domain?: string;
    gsc?: { clicks: number; impressions: number; avgPosition: number; ctr: number };
    ga4?: { sessions: number; users: number };
  };
}) {
  const when = baseline.capturedAt
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" })
        .format(new Date(baseline.capturedAt))
    : "—";
  const rows: Array<{ k: string; v: string }> = [];
  if (baseline.gsc) {
    rows.push({ k: "GSC clicks",        v: baseline.gsc.clicks.toLocaleString() });
    rows.push({ k: "GSC impressions",   v: baseline.gsc.impressions.toLocaleString() });
    rows.push({ k: "GSC avg position",  v: baseline.gsc.avgPosition.toFixed(1) });
    rows.push({ k: "GSC CTR",           v: `${baseline.gsc.ctr.toFixed(2)}%` });
  }
  if (baseline.ga4) {
    rows.push({ k: "GA4 sessions",      v: baseline.ga4.sessions.toLocaleString() });
    rows.push({ k: "GA4 users",         v: baseline.ga4.users.toLocaleString() });
  }

  return (
    <div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)",
        letterSpacing: "0.08em", marginBottom: 10,
      }}>
        Captured {when}{baseline.domain ? ` · ${baseline.domain}` : ""}
      </div>
      {rows.length === 0 && (
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)" }}>
          Baseline data is incomplete.
        </div>
      )}
      {rows.length > 0 && (
        <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map(r => (
            <div key={r.k} style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-body)", fontSize: 13 }}>
              <dt style={{ color: "var(--text-secondary)" }}>{r.k}</dt>
              <dd style={{ margin: 0, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{r.v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
