"use client";

// app/geo/page.tsx
// =============================================================================
// AI Marketing Lab — Answer engines (GEO)
//
// Three things, in the order they matter:
//   1. Can AI crawlers read your site at all? (robots.txt)
//   2. Which have actually visited? (observed, server-side)
//   3. Is your content extractable when they do? (page structure)
//
// Replaces the simulated citation tracker. Everything here is measured rather
// than modelled — if we can't observe something, the page says so plainly
// rather than filling the gap with a plausible number.
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import { BRAND_DEFAULT } from "@/app/ui/app-shell";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, ShieldCheck, ShieldAlert, ShieldX, RefreshCw, ArrowRight,
  ChevronDown, ChevronUp, CircleCheck, CircleX, AlertTriangle, FileSearch,
} from "lucide-react";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

type Access = {
  crawler: { token: string; name: string; operator: string; purpose: "answers" | "training" | "search"; note: string };
  status: "allowed" | "blocked" | "partial";
  matchedBy: "specific" | "wildcard" | "default";
  rule?: string;
  excluded?: string[];
  conflicts?: string[];
};

type Check = { id: string; label: string; passed: boolean; why: string; detail?: string; weight: number };

type Audit = {
  success: boolean;
  reason?: string;
  message?: string;
  site?: {
    origin: string; auditedUrl: string;
    resolvedFromFallback?: boolean; requestedOrigin?: string;
  };
  robots?: { state: "found" | "absent" | "unreachable"; url: string; detail: string | null };
  page?:   { state: "ok" | "absent" | "unreachable";    url: string; detail: string | null };
  sitemap?: { state: "found" | "absent" | "unreachable"; url: string; pageCount: number };
  access?: Access[];
  readiness?: { score: number; checks: Check[] } | null;
  summary?: {
    answerBotsTotal: number; answerBotsBlocked: number;
    trainingBotsBlocked: number; criticalBlocks: string[];
  };
  crawlerCount?: number;
};

type Observed = {
  success: boolean;
  days?: number;
  totalHits?: number;
  seenCount?: number;
  crawlers?: Array<{
    token: string; name: string; operator: string; purpose: string;
    hits: number; lastSeen: string | null; uniquePaths: number;
  }>;
};

const STATUS_META = {
  allowed: { label: "Allowed", color: "var(--signal-green)", icon: ShieldCheck },
  partial: { label: "Partial", color: "var(--signal-amber)", icon: ShieldAlert },
  blocked: { label: "Blocked", color: "var(--signal-red)",   icon: ShieldX     },
} as const;

export default function GeoPage() {
  const [brandColor, setBrandColor] = useState(BRAND_DEFAULT);
  const [audit,    setAudit]    = useState<Audit | null>(null);
  const [observed, setObserved] = useState<Observed | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [openCheck, setOpenCheck] = useState<string | null>(null);

  useEffect(() => {
    const b = localStorage.getItem("aiml-brand") || localStorage.getItem("rvivme-brand");
    if (b) setBrandColor(b);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, o] = await Promise.all([
        fetch("/api/geo/crawlers").then(r => r.json()).catch(() => null),
        fetch("/api/geo/crawler-hit?days=30").then(r => r.json()).catch(() => null),
      ]);
      setAudit(a);
      setObserved(o);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const criticalBlocks = audit?.summary?.criticalBlocks ?? [];

  // Three states, not two. "We couldn't read the rules" is a different claim
  // from "the rules permit everything", and collapsing them produces a green
  // verdict out of a network failure.
  const robotsUnknown = audit?.robots?.state === "unreachable";
  const verdict: "unknown" | "blocked" | "clear" =
    robotsUnknown ? "unknown" : criticalBlocks.length ? "blocked" : "clear";

  const VERDICT_TONE = {
    unknown: { bg: "rgba(255,171,0,0.07)", border: "rgba(255,171,0,0.25)", color: "var(--signal-amber)" },
    blocked: { bg: "rgba(255,23,68,0.06)", border: "rgba(255,23,68,0.22)", color: "var(--signal-red)"   },
    clear:   { bg: "rgba(0,230,118,0.05)", border: "rgba(0,230,118,0.22)", color: "var(--signal-green)" },
  }[verdict];

  return (
    <div className="aiml-page-pad" style={{
      background: "var(--bg)", minHeight: "100vh",
      padding: "32px 24px 80px", maxWidth: "1000px", margin: "0 auto",
    }}>
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
            Answer engines
          </h1>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
            CAN AI READ YOUR SITE · MEASURED, NOT MODELLED
          </div>
        </div>
        <button
          onClick={load} disabled={loading} className="aiml-touch-target"
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            fontFamily: "var(--font-mono)", fontSize: "11px",
            color: "var(--text-secondary)", background: "transparent",
            border: "1px solid var(--border)", borderRadius: "8px",
            padding: "9px 14px", cursor: "pointer", letterSpacing: "0.06em",
          }}
        >
          <RefreshCw size={11} style={{ animation: loading ? "spin 0.7s linear infinite" : "none" }} /> REFRESH
        </button>
      </motion.div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              height: "88px", borderRadius: "12px",
              background: "linear-gradient(90deg, var(--card) 25%, var(--muted) 50%, var(--card) 75%)",
              backgroundSize: "200% 100%", animation: "shimmer 1.4s ease-in-out infinite",
            }} />
          ))}
        </div>
      )}

      {!loading && audit && !audit.success && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: "10px",
          padding: "16px 18px", borderRadius: "12px",
          background: "rgba(255,171,0,0.07)", border: "1px solid rgba(255,171,0,0.25)",
        }}>
          <AlertTriangle size={15} color="var(--signal-amber)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 500, color: "var(--text-primary)", marginBottom: "4px" }}>
              Couldn&rsquo;t run the audit
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {audit.message}
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

      {!loading && audit?.success && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Verdict — the one thing that matters most */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE, delay: 0.05 }}
            style={{
              padding: "20px 22px", borderRadius: "14px",
              background: VERDICT_TONE.bg,
              border: `1px solid ${VERDICT_TONE.border}`,
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", gap: "7px", marginBottom: "8px",
              fontFamily: "var(--font-mono)", fontSize: "9.5px",
              letterSpacing: "0.12em", textTransform: "uppercase",
              color: VERDICT_TONE.color,
            }}>
              <Bot size={11} /> Crawler access
            </div>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: "clamp(1.1rem,2.2vw,1.45rem)",
              letterSpacing: "-0.02em", lineHeight: 1.3, fontWeight: 400,
              color: "var(--text-primary)", marginBottom: "10px",
            }}>
              {verdict === "unknown"
                ? "We couldn't read your robots.txt"
                : verdict === "blocked"
                ? `${criticalBlocks.length} answer engine${criticalBlocks.length === 1 ? " is" : "s are"} blocked from your site`
                : "Answer engines can read your site"}
            </div>
            <p style={{
              fontFamily: "var(--font-body)", fontSize: "13.5px",
              color: "var(--text-reading)", lineHeight: 1.7, margin: 0,
            }}>
              {verdict === "unknown"
                ? `We tried ${audit.robots?.url} and ${audit.robots?.detail}. That's a connection problem, not a finding — until we can read the file we can't tell you which crawlers are allowed, so nothing below is a verdict on your site. The usual cause is that the domain in Settings points at a hostname that isn't serving the site.`
                : verdict === "blocked"
                ? `Your robots.txt blocks ${criticalBlocks.join(", ")}. These crawlers fetch pages to build live answers with citations, so blocking them removes you from those answers entirely. This is usually accidental — a broad Disallow rule, or a robots file copied from elsewhere.`
                : audit.robots?.state === "found"
                ? `Read from ${audit.robots.url}. It allows the crawlers that build live answers.${audit.summary?.trainingBotsBlocked ? ` ${audit.summary.trainingBotsBlocked} training-only crawler${audit.summary.trainingBotsBlocked === 1 ? " is" : "s are"} blocked, which is a legitimate editorial choice and doesn't affect citations.` : ""}`
                : `No robots.txt exists at ${audit.robots?.url} — ${audit.robots?.detail}. Nothing is restricted, so every crawler is permitted by default. Worth adding one anyway, so the decision is yours rather than a default.`}
            </p>

            {/* Without a sitemap we can list exclusions but can't say whether
                they matter, and we should say so rather than imply we checked. */}
            {verdict !== "unknown" && audit.sitemap?.state !== "found" &&
             (audit.access ?? []).some(a => a.excluded?.length) && (
              <p style={{
                fontFamily: "var(--font-body)", fontSize: "12.5px",
                color: "var(--text-tertiary)", lineHeight: 1.6, margin: "10px 0 0",
              }}>
                We couldn&rsquo;t read a sitemap at {audit.sitemap?.url}, so exclusions below are
                listed as-is — we can&rsquo;t tell which of them cover pages you publish.
              </p>
            )}

            {audit.site?.resolvedFromFallback && (
              <p style={{
                fontFamily: "var(--font-body)", fontSize: "12.5px",
                color: "var(--text-tertiary)", lineHeight: 1.6, margin: "10px 0 0",
              }}>
                Note: {audit.site.requestedOrigin} didn&rsquo;t respond, so this audit used{" "}
                {audit.site.origin} instead.
              </p>
            )}
          </motion.div>

          {/* Per-crawler grid. Suppressed entirely when robots.txt couldn't be
              read — showing ten "Allowed" badges we didn't verify would be the
              same lie as the green verdict, just in smaller type. */}
          <div>
            <SectionLabel>Crawler by crawler</SectionLabel>
            {robotsUnknown ? (
              <div style={{
                padding: "16px 18px", background: "var(--surface)",
                border: "1px solid var(--border)", borderRadius: "12px",
                fontFamily: "var(--font-body)", fontSize: "13px",
                color: "var(--text-secondary)", lineHeight: 1.7,
              }}>
                Per-crawler status is unavailable until the robots.txt fetch succeeds.
                We track {audit.crawlerCount ?? 0} answer-engine and training crawlers —
                fix the site URL in Settings and re-run to see where each one stands.
                <div style={{ marginTop: "12px" }}>
                  <Link href="/settings?tab=integrations" style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
                    color: "#fff", background: brandColor, textDecoration: "none",
                    padding: "8px 16px", borderRadius: "100px",
                  }}>
                    Open settings <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            ) : (
            <div className="aiml-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
              {(audit.access ?? []).map(a => {
                const meta = STATUS_META[a.status];
                const StatusIcon = meta.icon;
                const seen = observed?.crawlers?.find(c => c.token === a.crawler.token);
                return (
                  <div key={a.crawler.token} style={{
                    padding: "14px 16px", background: "var(--surface)",
                    border: "1px solid var(--border)", borderRadius: "10px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {a.crawler.name}
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: meta.color, fontFamily: "var(--font-mono)", fontSize: "9.5px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        <StatusIcon size={11} /> {meta.label}
                      </span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "9.5px", color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "7px" }}>
                      {a.crawler.operator} · {a.crawler.purpose === "answers" ? "live answers" : "model training"}
                      {seen && seen.hits > 0 && <> · seen {seen.hits}×</>}
                    </div>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55, margin: 0 }}>
                      {a.crawler.note}
                    </p>
                    {/* An exclusion is only a warning when it covers a page the
                        site actually publishes. Otherwise it's housekeeping,
                        and it's shown in grey as context. */}
                    {a.conflicts?.length ? (
                      <div style={{ marginTop: "7px", fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--signal-amber)", lineHeight: 1.5 }}>
                        {a.rule} {a.matchedBy === "wildcard" && <span style={{ color: "var(--text-tertiary)" }}>(via User-agent: *)</span>}
                        <div style={{ color: "var(--text-tertiary)", marginTop: "3px" }}>
                          Blocks {a.conflicts.length} page{a.conflicts.length === 1 ? "" : "s"} in your sitemap
                          {a.conflicts.length <= 2 ? `: ${a.conflicts.join(", ")}` : ""}
                        </div>
                      </div>
                    ) : a.excluded?.length ? (
                      <div style={{ marginTop: "7px", fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                        Excludes {a.excluded.slice(0, 3).join(", ")}
                        {a.excluded.length > 3 ? ` +${a.excluded.length - 3} more` : ""} — no published pages affected
                      </div>
                    ) : a.rule ? (
                      <div style={{ marginTop: "7px", fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--signal-red)" }}>
                        {a.rule} {a.matchedBy === "wildcard" && <span style={{ color: "var(--text-tertiary)" }}>(via User-agent: *)</span>}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            )}
          </div>

          {/* Observed activity — honest about what it covers */}
          <div>
            <SectionLabel>Observed visits</SectionLabel>
            <div style={{
              padding: "16px 18px", background: "var(--surface)",
              border: "1px solid var(--border)", borderRadius: "12px",
            }}>
              {observed?.success && (observed.totalHits ?? 0) > 0 ? (
                <>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: "13.5px", color: "var(--text-reading)", lineHeight: 1.7, marginBottom: "10px" }}>
                    {observed.seenCount} of {audit.crawlerCount ?? 0} crawlers have fetched pages in the last {observed.days} days
                    {" "}({observed.totalHits} requests).
                  </div>
                  {(observed.crawlers ?? []).filter(c => c.hits > 0).map(c => (
                    <div key={c.token} style={{
                      display: "flex", justifyContent: "space-between", gap: "10px",
                      padding: "6px 0", borderBottom: "1px solid var(--border)",
                      fontFamily: "var(--font-mono)", fontSize: "11.5px",
                    }}>
                      <span style={{ color: "var(--text-secondary)" }}>{c.name}</span>
                      <span style={{ color: "var(--text-tertiary)" }}>
                        {c.hits} hits · {c.uniquePaths} pages
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                  No AI crawler visits recorded yet. Logging starts from the moment this
                  is deployed, so an empty list here means &ldquo;nothing since we started
                  watching&rdquo; rather than &ldquo;never&rdquo;.
                  <div style={{ marginTop: "8px", color: "var(--text-tertiary)", fontSize: "12px" }}>
                    Note: this records crawlers hitting this application. Observing them on
                    a different site would require equivalent server-side logging there —
                    crawlers don&rsquo;t run JavaScript, so a tracking tag cannot see them.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Readiness */}
          {audit.readiness && (
            <div>
              <SectionLabel>Answer readiness</SectionLabel>
              <div style={{
                padding: "18px 20px", background: "var(--surface)",
                border: "1px solid var(--border)", borderRadius: "12px",
              }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "6px" }}>
                  <span style={{
                    fontFamily: "var(--font-display)", fontSize: "2rem",
                    letterSpacing: "-0.04em", lineHeight: 1,
                    color: audit.readiness.score >= 70 ? "var(--signal-green)"
                         : audit.readiness.score >= 45 ? "var(--signal-amber)"
                         : "var(--signal-red)",
                  }}>
                    {audit.readiness.score}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
                    / 100
                  </span>
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: "12.5px", color: "var(--text-secondary)", marginBottom: "14px", wordBreak: "break-all" }}>
                  Audited {audit.site?.auditedUrl}
                </div>

                {audit.readiness.checks.map(c => (
                  <div key={c.id} style={{ borderTop: "1px solid var(--border)", padding: "9px 0" }}>
                    <button
                      onClick={() => setOpenCheck(openCheck === c.id ? null : c.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px", width: "100%",
                        background: "transparent", border: "none", cursor: "pointer",
                        padding: 0, textAlign: "left",
                      }}
                    >
                      {c.passed
                        ? <CircleCheck size={14} color="var(--signal-green)" style={{ flexShrink: 0 }} />
                        : <CircleX     size={14} color="var(--signal-red)"   style={{ flexShrink: 0 }} />}
                      <span style={{ flex: 1, fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-primary)" }}>
                        {c.label}
                      </span>
                      {c.detail && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-tertiary)" }}>
                          {c.detail}
                        </span>
                      )}
                      {openCheck === c.id ? <ChevronUp size={12} color="var(--text-tertiary)" /> : <ChevronDown size={12} color="var(--text-tertiary)" />}
                    </button>
                    <AnimatePresence>
                      {openCheck === c.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                          style={{ overflow: "hidden" }}
                        >
                          <p style={{
                            fontFamily: "var(--font-body)", fontSize: "12.5px",
                            color: "var(--text-reading)", lineHeight: 1.65,
                            margin: "8px 0 0 22px",
                          }}>
                            {c.why}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Report the reason we actually observed rather than guessing at
              one. The previous copy said "it may be blocking our crawler",
              which sent you looking at the wrong thing entirely. */}
          {audit.page && audit.page.state !== "ok" && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: "8px",
              fontFamily: "var(--font-body)", fontSize: "12.5px",
              color: "var(--text-tertiary)", lineHeight: 1.6,
            }}>
              <FileSearch size={13} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                No readiness score: we requested {audit.page.url} and {audit.page.detail}.
              </span>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "var(--font-mono)", fontSize: "9.5px",
      letterSpacing: "0.12em", textTransform: "uppercase",
      color: "var(--text-tertiary)", marginBottom: "10px",
    }}>
      {children}
    </div>
  );
}
