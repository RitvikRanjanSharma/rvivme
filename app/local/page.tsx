"use client";

// app/local/page.tsx
// =============================================================================
// AI Marketing Lab — Local search
//
// Opens with a diagnosis, including the diagnosis nobody else will give you:
// "local isn't your channel, don't spend effort here." A tool that tells every
// business it needs local SEO is selling rather than advising.
//
// Two layers, visually distinct: what we can see from Search Console and your
// own HTML (always), and Google Business Profile (when Google has approved it).
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Navigation, Search, Phone, Store, RefreshCw, AlertTriangle,
  ChevronDown, ChevronUp, CircleCheck, CircleX, ArrowRight, Stethoscope,
} from "lucide-react";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

type Signal = { id: string; label: string; passed: boolean; why: string; detail?: string; weight: number };

type ClassifiedQuery = {
  query: string; clicks: number; impressions: number; ctr: number; position: number;
  intent: "proximity" | "place" | "postcode" | "visit" | "none";
  place?: string;
};

type LocalReport = {
  success: boolean;
  reason?: string;
  message?: string;
  diagnosis?: { headline: string; detail: string; relevance: "primary" | "secondary" | "unclear" | "not_local" };
  demand?: {
    totalImpressions: number; localImpressions: number; localShare: number;
    localClicks: number; totalClicks: number;
    byIntent: Record<string, number>;
    topLocal: ClassifiedQuery[];
    localNearMisses: ClassifiedQuery[];
    averageLocalPosition: number | null;
  };
  locality?: { place: string | null; impressions: number; queries: number; confidence: string };
  signals?: { score: number; signals: Signal[] } | null;
  page?: { state: string; url: string; detail: string | null } | null;
  period?: { days: number; startDate: string; endDate: string; queryCount: number };
};

type BusinessReport = {
  success: boolean;
  reason?: string;
  message?: string;
  locations?: { name: string; title: string; locality: string | null; category: string | null }[];
  selected?: string;
  profile?: { score: number; gaps: { id: string; label: string; filled: boolean; why: string; weight: number }[] };
  performance?: { totals: Record<string, number>; days: number } | null;
  performanceError?: string | null;
};

const RELEVANCE_TONE = {
  primary:   { bg: "rgba(0,230,118,0.05)", border: "rgba(0,230,118,0.22)", color: "var(--signal-green)" },
  secondary: { bg: "rgba(0,230,118,0.05)", border: "rgba(0,230,118,0.22)", color: "var(--signal-green)" },
  unclear:   { bg: "rgba(255,171,0,0.07)", border: "rgba(255,171,0,0.25)", color: "var(--signal-amber)" },
  not_local: { bg: "var(--surface)",       border: "var(--border)",        color: "var(--text-tertiary)" },
} as const;

const INTENT_LABEL: Record<string, string> = {
  proximity: "Near me",
  place:     "Named a place",
  postcode:  "Postcode",
  visit:     "Visit intent",
};

/** Metric keys are Google's; these are the words a human would use. */
const METRIC_LABEL: Record<string, string> = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS:   "Maps (desktop)",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "Search (desktop)",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS:    "Maps (mobile)",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH:  "Search (mobile)",
  CALL_CLICKS:                         "Calls",
  WEBSITE_CLICKS:                      "Website clicks",
  BUSINESS_DIRECTION_REQUESTS:         "Directions",
  BUSINESS_CONVERSATIONS:              "Messages",
};

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

export default function LocalPage() {
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [report,   setReport]   = useState<LocalReport | null>(null);
  const [business, setBusiness] = useState<BusinessReport | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [openSignal, setOpenSignal] = useState<string | null>(null);

  useEffect(() => {
    const b = localStorage.getItem("aiml-brand") || localStorage.getItem("rvivme-brand");
    if (b) setBrandColor(b);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, b] = await Promise.all([
        fetch("/api/local").then(r => r.json()).catch(() => null),
        fetch("/api/local/business").then(r => r.json()).catch(() => null),
      ]);
      setReport(r);
      setBusiness(b);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const relevance = report?.diagnosis?.relevance ?? "unclear";
  const tone = RELEVANCE_TONE[relevance];
  const demand = report?.demand;

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
            Local search
          </h1>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
            {report?.period
              ? `LAST ${report.period.days} DAYS · ${report.period.queryCount.toLocaleString()} QUERIES ANALYSED`
              : "FROM YOUR SEARCH CONSOLE DATA"}
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

      {!loading && report && !report.success && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: "10px",
          padding: "16px 18px", borderRadius: "12px",
          background: "rgba(255,171,0,0.07)", border: "1px solid rgba(255,171,0,0.25)",
        }}>
          <AlertTriangle size={15} color="var(--signal-amber)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 500, color: "var(--text-primary)", marginBottom: "4px" }}>
              Couldn&rsquo;t run the local analysis
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
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Diagnosis */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE, delay: 0.05 }}
            style={{
              padding: "20px 22px", borderRadius: "14px",
              background: tone.bg, border: `1px solid ${tone.border}`,
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", gap: "7px", marginBottom: "8px",
              fontFamily: "var(--font-mono)", fontSize: "9.5px",
              letterSpacing: "0.12em", textTransform: "uppercase", color: tone.color,
            }}>
              <Stethoscope size={11} /> Diagnosis
            </div>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: "clamp(1.1rem,2.2vw,1.45rem)",
              letterSpacing: "-0.02em", lineHeight: 1.3, fontWeight: 400,
              color: "var(--text-primary)", marginBottom: "10px",
            }}>
              {report.diagnosis?.headline}
            </div>
            <p style={{
              fontFamily: "var(--font-body)", fontSize: "13.5px",
              color: "var(--text-reading)", lineHeight: 1.7, margin: 0,
            }}>
              {report.diagnosis?.detail}
            </p>

            {report.locality?.place && report.locality.confidence !== "none" && (
              <p style={{
                fontFamily: "var(--font-body)", fontSize: "12.5px",
                color: "var(--text-tertiary)", lineHeight: 1.6, margin: "10px 0 0",
              }}>
                We inferred your area from your own search data rather than a setting:
                {" "}<strong style={{ color: "var(--text-secondary)" }}>
                  {report.locality.place.replace(/\b\w/g, c => c.toUpperCase())}
                </strong>{" "}
                appears in {report.locality.queries} quer{report.locality.queries === 1 ? "y" : "ies"}
                {" "}totalling {report.locality.impressions.toLocaleString()} impressions
                {" "}({report.locality.confidence} confidence).
              </p>
            )}
          </motion.div>

          {/* Demand split */}
          {demand && demand.totalImpressions > 0 && (
            <div>
              <SectionLabel>Local demand</SectionLabel>
              <div className="aiml-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
                {[
                  { label: "Local share", value: `${demand.localShare}%`, icon: MapPin },
                  { label: "Local impressions", value: demand.localImpressions.toLocaleString(), icon: Search },
                  { label: "Local clicks", value: demand.localClicks.toLocaleString(), icon: Navigation },
                  { label: "Avg position", value: demand.averageLocalPosition ?? "—", icon: Store },
                ].map(kpi => (
                  <div key={kpi.label} style={{
                    padding: "14px 16px", background: "var(--surface)",
                    border: "1px solid var(--border)", borderRadius: "10px",
                  }}>
                    <div style={{
                      fontFamily: "var(--font-display)", fontSize: "1.6rem",
                      letterSpacing: "-0.03em", lineHeight: 1, color: "var(--text-primary)",
                    }}>
                      {kpi.value}
                    </div>
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: "9.5px", marginTop: "6px",
                      letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)",
                    }}>
                      {kpi.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Intent breakdown — how people phrase local searches for you */}
              {Object.entries(demand.byIntent).some(([, v]) => v > 0) && (
                <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {Object.entries(demand.byIntent)
                    .filter(([, v]) => v > 0)
                    .sort((a, b) => b[1] - a[1])
                    .map(([intent, impressions]) => (
                      <span key={intent} style={{
                        fontFamily: "var(--font-mono)", fontSize: "10.5px",
                        color: "var(--text-secondary)", background: "var(--card)",
                        border: "1px solid var(--border)", borderRadius: "7px",
                        padding: "5px 10px",
                      }}>
                        {INTENT_LABEL[intent] ?? intent} · {impressions.toLocaleString()}
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Near misses — where the work is */}
          {demand && demand.localNearMisses.length > 0 && (
            <div>
              <SectionLabel>Local queries within reach</SectionLabel>
              <div style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "12px", padding: "6px 18px 12px",
              }}>
                <p style={{
                  fontFamily: "var(--font-body)", fontSize: "12.5px",
                  color: "var(--text-tertiary)", lineHeight: 1.6, margin: "12px 0",
                }}>
                  Positions 11&ndash;30, where a profile fix or a page that actually names the
                  area can realistically move you onto page one.
                </p>
                {demand.localNearMisses.map(q => (
                  <div key={q.query} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "baseline",
                    gap: "12px", padding: "8px 0", borderTop: "1px solid var(--border)",
                    flexWrap: "wrap",
                  }}>
                    <span style={{
                      fontFamily: "var(--font-body)", fontSize: "13px",
                      color: "var(--text-primary)", flex: "1 1 200px", overflowWrap: "break-word",
                    }}>
                      {q.query}
                    </span>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: "10.5px",
                      color: "var(--text-tertiary)", letterSpacing: "0.06em",
                    }}>
                      pos {q.position.toFixed(1)} · {q.impressions.toLocaleString()} impr · {INTENT_LABEL[q.intent] ?? q.intent}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* On-page local signals */}
          {report.signals && (
            <div>
              <SectionLabel>Local signals on your site</SectionLabel>
              <div style={{
                padding: "18px 20px", background: "var(--surface)",
                border: "1px solid var(--border)", borderRadius: "12px",
              }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "14px" }}>
                  <span style={{
                    fontFamily: "var(--font-display)", fontSize: "2rem",
                    letterSpacing: "-0.04em", lineHeight: 1,
                    color: report.signals.score >= 70 ? "var(--signal-green)"
                         : report.signals.score >= 40 ? "var(--signal-amber)"
                         : "var(--signal-red)",
                  }}>
                    {report.signals.score}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
                    / 100
                  </span>
                </div>

                {report.signals.signals.map(s => (
                  <div key={s.id} style={{ borderTop: "1px solid var(--border)", padding: "9px 0" }}>
                    <button
                      onClick={() => setOpenSignal(openSignal === s.id ? null : s.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px", width: "100%",
                        background: "transparent", border: "none", cursor: "pointer",
                        padding: 0, textAlign: "left",
                      }}
                    >
                      {s.passed
                        ? <CircleCheck size={14} color="var(--signal-green)" style={{ flexShrink: 0 }} />
                        : <CircleX     size={14} color="var(--signal-red)"   style={{ flexShrink: 0 }} />}
                      <span style={{ flex: 1, fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-primary)" }}>
                        {s.label}
                      </span>
                      {s.detail && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-tertiary)" }}>
                          {s.detail}
                        </span>
                      )}
                      {openSignal === s.id ? <ChevronUp size={12} color="var(--text-tertiary)" /> : <ChevronDown size={12} color="var(--text-tertiary)" />}
                    </button>
                    <AnimatePresence>
                      {openSignal === s.id && (
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
                            {s.why}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.page && report.page.state !== "ok" && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: "8px",
              fontFamily: "var(--font-body)", fontSize: "12.5px",
              color: "var(--text-tertiary)", lineHeight: 1.6,
            }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Couldn&rsquo;t check your page for local signals: we requested {report.page.url} and {report.page.detail}.
              </span>
            </div>
          )}

          {/* ── Google Business Profile ─────────────────────────────────── */}
          <div>
            <SectionLabel>Google Business Profile</SectionLabel>
            <BusinessPanel business={business} brandColor={brandColor} />
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>
    </div>
  );
}

/**
 * The Business Profile layer.
 *
 * Every failure mode gets its own explanation, because they have completely
 * different remedies and Google's own error text doesn't distinguish them. The
 * one people get stuck on is `access_not_granted` — a form Google reviews by
 * hand, which no amount of clicking in our UI will resolve.
 */
function BusinessPanel({ business, brandColor }: { business: BusinessReport | null; brandColor: string }) {
  const panel = {
    padding: "16px 18px", background: "var(--surface)",
    border: "1px solid var(--border)", borderRadius: "12px",
  } as const;

  const body = {
    fontFamily: "var(--font-body)", fontSize: "13px",
    color: "var(--text-secondary)", lineHeight: 1.7,
  } as const;

  if (!business) {
    return <div style={panel}><div style={body}>Checking for a connected Business Profile&hellip;</div></div>;
  }

  if (!business.success) {
    const reason = business.reason ?? "api_error";

    if (reason === "scope_missing" || reason === "not_connected") {
      return (
        <div style={panel}>
          <div style={body}>
            Connecting your Google Business Profile adds what Search Console can&rsquo;t see:
            how many people found you on Maps versus Search, how many called or asked for
            directions, and which profile fields are holding your ranking back.
            <div style={{ marginTop: "8px", color: "var(--text-tertiary)", fontSize: "12.5px" }}>
              This is a separate permission from Analytics and Search Console, so we ask for
              it only if you want it.
            </div>
          </div>
          <a href="/api/auth/google/start?scope=business" style={{
            display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "12px",
            fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
            color: "#fff", background: brandColor, textDecoration: "none",
            padding: "8px 16px", borderRadius: "100px",
          }}>
            Connect Business Profile <ArrowRight size={12} />
          </a>
        </div>
      );
    }

    if (reason === "no_profile") {
      return (
        <div style={panel}>
          <div style={body}>
            This Google account doesn&rsquo;t manage any Business Profiles. If you have one
            under a different account, connect that one instead. If you don&rsquo;t have a
            profile at all and you serve customers in a specific area, creating one is the
            single highest-return hour of local SEO work available &mdash; it&rsquo;s free,
            and without it you cannot appear in Maps results at all.
          </div>
        </div>
      );
    }

    if (reason === "api_not_enabled" || reason === "access_not_granted") {
      return (
        <div style={panel}>
          <div style={body}>
            {reason === "api_not_enabled"
              ? "The Business Profile APIs aren't enabled on this deployment's Google Cloud project yet."
              : "Google hasn't approved this project for Business Profile API access yet."}
            <div style={{ marginTop: "8px", color: "var(--text-tertiary)", fontSize: "12.5px" }}>
              Unlike Analytics and Search Console, Google gates these APIs behind an
              application they review by hand — their stated target is 14 days. You also
              need a verified Business Profile that's been active for 60+ days. Nothing
              on your side is broken, and everything above this panel works without it.
            </div>
          </div>
          <a
            href="https://developers.google.com/my-business/content/prereqs"
            target="_blank" rel="noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "12px",
              fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.08em",
              color: brandColor, textDecoration: "none",
            }}
          >
            HOW TO REQUEST ACCESS ↗
          </a>
        </div>
      );
    }

    return <div style={panel}><div style={body}>{business.message}</div></div>;
  }

  const totals = business.performance?.totals ?? {};
  const mapsImpressions =
    (totals.BUSINESS_IMPRESSIONS_DESKTOP_MAPS ?? 0) + (totals.BUSINESS_IMPRESSIONS_MOBILE_MAPS ?? 0);
  const searchImpressions =
    (totals.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH ?? 0) + (totals.BUSINESS_IMPRESSIONS_MOBILE_SEARCH ?? 0);
  const actions =
    (totals.CALL_CLICKS ?? 0) + (totals.WEBSITE_CLICKS ?? 0) +
    (totals.BUSINESS_DIRECTION_REQUESTS ?? 0) + (totals.BUSINESS_CONVERSATIONS ?? 0);
  const totalImpressions = mapsImpressions + searchImpressions;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
            {business.locations?.find(l => l.name === business.selected)?.title ?? "Your profile"}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Profile completeness {business.profile?.score ?? 0}/100
          </span>
        </div>

        {business.profile && (
          <div style={{ marginTop: "12px" }}>
            {business.profile.gaps.filter(g => !g.filled).length === 0 ? (
              <div style={body}>Every field that affects local ranking is filled in. Keep hours current — stale hours are the most common cause of a profile quietly losing ground.</div>
            ) : (
              business.profile.gaps.filter(g => !g.filled).map(g => (
                <div key={g.id} style={{ borderTop: "1px solid var(--border)", padding: "9px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <CircleX size={13} color="var(--signal-red)" style={{ flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-primary)" }}>
                      {g.label}
                    </span>
                  </div>
                  <p style={{
                    fontFamily: "var(--font-body)", fontSize: "12.5px",
                    color: "var(--text-reading)", lineHeight: 1.65, margin: "6px 0 0 21px",
                  }}>
                    {g.why}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {business.performance && totalImpressions > 0 && (
        <div style={panel}>
          <div style={{
            fontFamily: "var(--font-body)", fontSize: "13.5px",
            color: "var(--text-reading)", lineHeight: 1.7, marginBottom: "12px",
          }}>
            Over the last {business.performance.days} days your profile was shown{" "}
            {totalImpressions.toLocaleString()} times &mdash;{" "}
            {Math.round((mapsImpressions / totalImpressions) * 100)}% on Maps,{" "}
            {Math.round((searchImpressions / totalImpressions) * 100)}% in Search &mdash;
            and produced {actions.toLocaleString()} action{actions === 1 ? "" : "s"}
            {totalImpressions > 0 && ` (${((actions / totalImpressions) * 100).toFixed(1)}% of views)`}.
          </div>
          <div className="aiml-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
            {Object.entries(totals).filter(([, v]) => v > 0).map(([metric, value]) => (
              <div key={metric} style={{
                padding: "10px 12px", background: "var(--card)",
                border: "1px solid var(--border)", borderRadius: "9px",
              }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
                  {value.toLocaleString()}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginTop: "4px" }}>
                  {METRIC_LABEL[metric] ?? metric}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {business.performanceError && (
        <div style={{ fontFamily: "var(--font-body)", fontSize: "12.5px", color: "var(--text-tertiary)", lineHeight: 1.6 }}>
          Profile fields loaded, but performance metrics didn&rsquo;t: {business.performanceError}
        </div>
      )}
    </div>
  );
}
