"use client";

// app/strategies/page.tsx
// =============================================================================
// AI Marketing Lab — Strategies (list view)
// All saved strategies. One can be active at a time. New strategies are
// generated on the dashboard and activated from there — this page is for
// reviewing, switching the active one, and drilling into details.
// =============================================================================

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Target, Zap, Archive, Check, ArrowUpRight, AlertCircle, PenLine,
} from "lucide-react";
import {
  listStrategies, setActiveStrategy, archiveStrategy, markStrategyCompleted,
  deleteStrategy, type Strategy,
} from "@/lib/strategies";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

function statusColor(s: Strategy["status"], isActive: boolean) {
  if (isActive) return "var(--brand)";
  if (s === "completed") return "var(--signal-green)";
  if (s === "dismissed") return "var(--text-tertiary)";
  return "var(--text-secondary)";
}
function impactColor(s: number) { return s>=8.5?"var(--signal-green)":s>=6.5?"var(--brand)":"var(--signal-amber)"; }
function effortColor(s: number) { return s>=7.5?"var(--signal-red)":s>=5.0?"var(--signal-amber)":"var(--signal-green)"; }

export default function StrategiesPage() {
  const [rows,     setRows]     = useState<Strategy[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [busyId,   setBusyId]   = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const data = await listStrategies();
      setRows(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load strategies.");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function handle(id: string, action: "activate" | "archive" | "complete" | "delete") {
    setBusyId(id);
    try {
      if (action === "activate") await setActiveStrategy(id);
      if (action === "archive")  await archiveStrategy(id);
      if (action === "complete") await markStrategyCompleted(id);
      if (action === "delete")   await deleteStrategy(id);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally { setBusyId(null); }
  }

  const active   = rows.find(r => r.is_active);
  const saved    = rows.filter(r => !r.is_active && r.status === "active");
  const finished = rows.filter(r => r.status === "completed" || r.status === "dismissed");

  return (
    <div style={{ padding: "32px 36px 64px", maxWidth: 1200, margin: "0 auto" }}>
      <motion.header
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE_EXPO }}
        style={{ marginBottom: 32 }}
      >
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
          textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 8,
        }}>Marketing strategies</div>
        <h1 style={{
          fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 3.4vw, 2.6rem)",
          lineHeight: 1.05, letterSpacing: "-0.03em", margin: 0, color: "var(--text-primary)",
        }}>Your playbook</h1>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-secondary)", marginTop: 10, maxWidth: 680 }}>
          Strategies generated from your site's real performance, kept as a running playbook. One is active at a time — it
          gets the AI's full attention for keyword recommendations and content drafts.
        </p>
      </motion.header>

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
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{
              height: 110, borderRadius: 12,
              background: "linear-gradient(90deg, var(--card) 25%, var(--muted) 50%, var(--card) 75%)",
              backgroundSize: "200% 100%", animation: "shimmer 1.4s ease-in-out infinite",
            }}/>
          ))}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div style={{
          padding: "48px 32px", textAlign: "center", border: "1px dashed var(--border)",
          borderRadius: 14, background: "var(--surface)",
        }}>
          <Target size={28} color="var(--text-tertiary)" style={{ marginBottom: 12 }}/>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 15, color: "var(--text-primary)", marginBottom: 6 }}>
            No strategies yet.
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
            Generate your first one from the dashboard — the AI Strategy Action Centre reads your GSC and GA4 data and recommends three tailored plays.
          </div>
          <Link href="/dashboard" style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: "var(--brand)", color: "#fff", textDecoration: "none",
            padding: "11px 22px", borderRadius: 100, fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 500,
          }}>
            Go to dashboard <ArrowUpRight size={14}/>
          </Link>
        </div>
      )}

      {!loading && active && (
        <Section label="Active strategy">
          <StrategyCard s={active} featured busy={busyId === active.id}
            onAction={(a) => handle(active.id, a)}/>
        </Section>
      )}

      {!loading && saved.length > 0 && (
        <Section label={active ? "Other saved strategies" : "Saved strategies"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {saved.map(s => (
              <StrategyCard key={s.id} s={s} busy={busyId === s.id}
                onAction={(a) => handle(s.id, a)}/>
            ))}
          </div>
        </Section>
      )}

      {!loading && finished.length > 0 && (
        <Section label="Archive">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {finished.map(s => (
              <StrategyCard key={s.id} s={s} dim busy={busyId === s.id}
                onAction={(a) => handle(s.id, a)}/>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
        textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 12,
      }}>{label}</div>
      {children}
    </div>
  );
}

// ─── Strategy card ────────────────────────────────────────────────────────────
function StrategyCard({
  s, featured = false, dim = false, busy, onAction,
}: {
  s: Strategy;
  featured?: boolean;
  dim?: boolean;
  busy?: boolean;
  onAction: (a: "activate" | "archive" | "complete" | "delete") => void;
}) {
  const isActive = s.is_active;

  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid ${isActive ? "rgba(var(--brand-rgb), 0.45)" : "var(--border)"}`,
      borderRadius: 14,
      padding: featured ? "24px 26px" : "18px 22px",
      boxShadow: isActive ? "0 0 28px var(--brand-glow)" : "none",
      opacity: dim ? 0.7 : 1,
      position: "relative", overflow: "hidden",
    }}>
      {isActive && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: "linear-gradient(90deg, transparent, var(--brand), transparent)",
        }}/>
      )}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
              color: "var(--brand)", background: "rgba(var(--brand-rgb), 0.12)",
              border: "1px solid rgba(var(--brand-rgb), 0.35)",
              padding: "3px 8px", borderRadius: 6, minWidth: 34, textAlign: "center",
            }}>{s.acronym ?? "STR"}</span>
            {s.category && (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--text-tertiary)",
              }}>{s.category}</span>
            )}
            <span aria-hidden="true" style={{ color: "var(--text-tertiary)" }}>·</span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: statusColor(s.status, isActive),
            }}>{isActive ? "Active" : s.status}</span>
            {s.timeframe && (
              <>
                <span aria-hidden="true" style={{ color: "var(--text-tertiary)" }}>·</span>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em",
                  color: "var(--text-tertiary)",
                }}>Est. {s.timeframe}</span>
              </>
            )}
          </div>
          <Link href={`/strategies/${s.id}`} style={{
            fontFamily: "var(--font-body)", fontSize: featured ? 17 : 15, fontWeight: 600,
            letterSpacing: "-0.01em", color: "var(--text-primary)", textDecoration: "none", lineHeight: 1.3,
          }}>{s.title}</Link>
          <p style={{
            fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)",
            lineHeight: 1.65, margin: "8px 0 0", maxWidth: 720,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{s.rationale}</p>
        </div>

        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {[
            { label: "IMPACT", value: s.impact_score, cf: impactColor },
            { label: "EFFORT", value: s.effort_score, cf: effortColor },
          ].map(({ label, value, cf }) => (
            <div key={label} style={{
              textAlign: "center", padding: "7px 10px",
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 8, minWidth: 54,
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 17, fontWeight: 500, color: cf(value), lineHeight: 1 }}>
                {Number(value).toFixed(1)}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-tertiary)", marginTop: 3 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <Link href={`/strategies/${s.id}`} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500,
          color: "var(--text-primary)", textDecoration: "none",
          background: "var(--muted)", border: "1px solid var(--border)",
          borderRadius: 7, padding: "6px 12px",
        }}>
          Open plan <ArrowUpRight size={12}/>
        </Link>

        {!isActive && s.status === "active" && (
          <button onClick={() => onAction("activate")} disabled={busy} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500,
            color: "#fff", background: "var(--brand)", border: "none",
            borderRadius: 7, padding: "6px 12px", cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}>
            <Zap size={12}/> Make active
          </button>
        )}

        {isActive && (
          <Link href={`/content?strategy=${s.id}`} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500,
            color: "#fff", background: "var(--brand)", textDecoration: "none",
            borderRadius: 7, padding: "6px 12px",
          }}>
            <PenLine size={12}/> Draft content
          </Link>
        )}

        {s.status === "active" && !isActive && (
          <button onClick={() => onAction("archive")} disabled={busy} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontFamily: "var(--font-body)", fontSize: 12,
            color: "var(--text-secondary)", background: "transparent",
            border: "1px solid var(--border)", borderRadius: 7, padding: "6px 12px",
            cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
          }}>
            <Archive size={12}/> Archive
          </button>
        )}

        {s.status === "active" && (
          <button onClick={() => onAction("complete")} disabled={busy} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontFamily: "var(--font-body)", fontSize: 12,
            color: "var(--signal-green)", background: "transparent",
            border: "1px solid rgba(0,230,118,0.25)", borderRadius: 7, padding: "6px 12px",
            cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
          }}>
            <Check size={12}/> Mark done
          </button>
        )}
      </div>
    </div>
  );
}
