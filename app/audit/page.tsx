"use client";

// app/audit/page.tsx
// =============================================================================
// AI Marketing Lab — Site Audit page
// =============================================================================
// Shows the latest audit row + findings grouped by severity, plus a "Run
// audit now" button. We deliberately keep this page small — the dashboard
// already gets a summary card; this page is for drilling in.
// =============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Info, Loader2, Play, RefreshCw, Search,
} from "lucide-react";

type Severity = "error" | "warning" | "notice";
type Finding = {
  id: string;
  rule: string;
  severity: Severity;
  category: string;
  page_url: string | null;
  message: string;
  detail: Record<string, unknown> | null;
  /** Attached by the API from RULE_GUIDE — see lib/audit-guide.ts. */
  why?: string;
  fix?: string;
  impact?: number;
};
type Audit = {
  id: string;
  domain: string;
  status: "running" | "completed" | "failed";
  overall_score: number | null;
  pages_crawled: number;
  errors_count: number;
  warnings_count: number;
  notices_count: number;
  performance_score: number | null;
  accessibility_score: number | null;
  best_practices_score: number | null;
  seo_score: number | null;
  lcp_ms: number | null;
  cls: number | null;
  inp_ms: number | null;
  started_at: string;
  completed_at: string | null;
};

export default function AuditPage() {
  const [audit, setAudit]       = useState<Audit | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading]   = useState(true);
  const [running, setRunning]   = useState(false);
  /** Why the last run refused, if it did. The API answers 200 with a reason
   *  rather than an HTTP error, so this is the only place it can surface. */
  const [problem, setProblem]   = useState<{ reason: string; message: string } | null>(null);
  const [stalled, setStalled]   = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/site-audit");
      const j = await res.json();
      setAudit(j.audit ?? null);
      setFindings(j.findings ?? []);
      // A run killed mid-flight leaves the row saying "running" forever, with
      // placeholder zeros. Showing that as a result is how a dead audit looked
      // like a score of 0 out of 100.
      setStalled(Boolean(j.stalled));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function run() {
    setRunning(true);
    setProblem(null);
    try {
      // The response used to be thrown away entirely.
      //
      // The route deliberately answers 200 with { success:false, reason,
      // message } so the UI can render a calm explanation instead of an error
      // page — but nothing here read it. So "no website URL set", "daily limit
      // reached" and "that domain is blocked" all looked identical: the button
      // spun, the page returned to "No audits yet", and no reason was given
      // anywhere. The most common cause is simply an unset website URL, which
      // is one click to fix once you know.
      const res = await fetch("/api/site-audit", { method: "POST" });
      const json = await res.json().catch(() => null);

      if (!json?.success) {
        setProblem({
          reason:  json?.reason ?? "api_error",
          // Prefer the route's own message, then its raw error. The generic
          // sentence is a last resort — it previously swallowed a database
          // error that said exactly what was wrong ("relation site_audits does
          // not exist"), leaving no way to tell a missing table from a
          // transient blip.
          message: json?.message ?? json?.error ?? "The audit couldn't run. Try again in a moment.",
        });
        return;
      }
      await refresh();
    } catch {
      setProblem({ reason: "network", message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setRunning(false);
    }
  }

  const severityCounts = {
    error:   findings.filter(f => f.severity === "error").length,
    warning: findings.filter(f => f.severity === "warning").length,
    notice:  findings.filter(f => f.severity === "notice").length,
  };

  return (
    <div className="aiml-page-pad" style={{ padding: "32px 24px 80px", maxWidth: 1100, margin: "0 auto", color: "var(--text-primary)" }}>
      <header className="stack-mobile" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28, gap: 16 }}>
        <div>
          <h1 className="aiml-page-title">Site audit</h1>
          <p style={{ color: "var(--text-secondary)", margin: "6px 0 0", fontSize: 15 }}>
            Technical SEO scan of your website. Run any time; daily limit applies.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 18px", borderRadius: "var(--radius-pill)",
            background: "var(--brand-strong)", color: "#fff", border: "none",
            fontSize: 14, fontWeight: 500, cursor: running ? "wait" : "pointer",
            opacity: running ? 0.7 : 1,
          }}
        >
          {running
            ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Running…</>
            : <><Play size={14} /> Run audit</>}
        </button>
      </header>

      {loading && !audit && (
        <Empty
          icon={<Loader2 size={28} style={{ animation: "spin 1.4s linear infinite" }} />}
          title="Loading…"
          body="Fetching your latest audit."
        />
      )}

      {stalled && !problem && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "16px 18px", borderRadius: 12, marginBottom: 20,
          background: "rgba(255,171,0,0.07)", border: "1px solid rgba(255,171,0,0.25)",
        }}>
          <AlertTriangle size={15} color="var(--signal-amber)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>The last audit didn&rsquo;t finish</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              It started but never completed, so the numbers below are placeholders rather than
              results. Run it again — every request now has a time limit, so a slow page fails
              one check instead of stopping the whole scan.
            </div>
          </div>
        </div>
      )}

      {problem && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "16px 18px", borderRadius: 12, marginBottom: 20,
          background: "rgba(255,171,0,0.07)", border: "1px solid rgba(255,171,0,0.25)",
        }}>
          <AlertTriangle size={15} color="var(--signal-amber)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
              {problem.reason === "no_domain"      ? "No website URL set"
             : problem.reason === "quota_exceeded" ? "Daily limit reached"
             : problem.reason === "blocked"        ? "That address can't be audited"
             : problem.reason === "missing_tables" ? "Database setup incomplete"
             : problem.reason === "crawl_failed"   ? "Couldn't reach your site"
             : "The audit didn't run"}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {problem.message}
            </div>
            {problem.reason === "no_domain" && (
              <Link href="/settings?tab=profile" style={{
                display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12,
                fontSize: 13, fontWeight: 500, color: "#fff",
                background: "var(--brand-strong)", textDecoration: "none",
                padding: "8px 16px", borderRadius: "var(--radius-pill)",
              }}>
                Add your website URL
              </Link>
            )}
          </div>
        </div>
      )}

      {!loading && !audit && !problem && (
        <Empty
          icon={<Search size={28} />}
          title="No audits yet"
          body='Click "Run audit" to scan your homepage and a few internal pages for SEO issues.'
        />
      )}

      {audit && (
        <>
          <Scorecard audit={audit} />

          <div style={{ display: "flex", gap: 8, margin: "28px 0 16px", flexWrap: "wrap" }}>
            <Pill icon={<AlertTriangle size={12} />} label={`${severityCounts.error} errors`}   tone="error" />
            <Pill icon={<AlertTriangle size={12} />} label={`${severityCounts.warning} warnings`} tone="warning" />
            <Pill icon={<Info size={12} />}          label={`${severityCounts.notice} notices`}  tone="notice" />
            {audit.completed_at && (
              <Pill icon={<RefreshCw size={12} />} label={`Last run: ${formatTime(audit.completed_at)}`} tone="muted" />
            )}
          </div>

          <FindingsList findings={findings} />
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Scorecard({ audit }: { audit: Audit }) {
  const score = audit.overall_score ?? 0;
  const colour = score >= 80 ? "var(--signal-green)" : score >= 50 ? "var(--signal-amber)" : "var(--signal-red)";
  return (
    <div
      className="grid-1-mobile"
      style={{
        display: "grid", gap: 16, gridTemplateColumns: "minmax(220px, 320px) 1fr",
        padding: 22, background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-2xl)",
      }}
    >
      <div>
        <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          Overall score
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 56, lineHeight: 1, color: colour }}>{score}</span>
          <span style={{ color: "var(--text-tertiary)", fontSize: 14 }}>/ 100</span>
        </div>
        <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 6 }}>
          {/* Say what was actually looked at. "Site audit" implies the whole
              site; this crawls the homepage plus up to eight linked pages that
              robots.txt permits. Overstating the scope is the kind of small
              dishonesty that costs trust when someone notices. */}
          {audit.domain} · sampled {audit.pages_crawled} {audit.pages_crawled === 1 ? "page" : "pages"} (homepage + linked pages)
        </div>
      </div>
      <div className="grid-2-mobile" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, alignContent: "start" }}>
        <SubScore label="Performance"   value={audit.performance_score} />
        <SubScore label="Accessibility" value={audit.accessibility_score} />
        <SubScore label="Best Practice" value={audit.best_practices_score} />
        <SubScore label="SEO"           value={audit.seo_score} />
      </div>
    </div>
  );
}

function SubScore({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0;
  const colour = value == null ? "var(--text-tertiary)" : v >= 80 ? "var(--signal-green)" : v >= 50 ? "var(--signal-amber)" : "var(--signal-red)";
  return (
    <div style={{ padding: "10px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 26, color: colour, marginTop: 4 }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

function FindingsList({ findings }: { findings: Finding[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (findings.length === 0) {
    return (
      <Empty
        icon={<CheckCircle2 size={28} color="var(--signal-green)" />}
        title="Clean bill of health"
        body="No issues found on this run. Re-run weekly to catch regressions."
      />
    );
  }

  // Group by page, and order the groups by their most consequential finding.
  //
  // A flat severity-ordered list is an inventory: nineteen rows that say what
  // is wrong but not where to start. Someone fixing a site works one page at a
  // time, so the report is shaped that way — and the page with the most to
  // gain leads, rather than whichever page happened to have an error.
  const SITE_WIDE = "Across the site";
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = f.page_url ?? SITE_WIDE;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const best = (list: Finding[]) => Math.max(...list.map(f => f.impact ?? 0));
  const ordered = [...groups.entries()].sort((a, b) => best(b[1]) - best(a[1]));

  return (
    <div style={{ display: "grid", gap: 22 }}>
      {ordered.map(([page, list]) => (
        <div key={page}>
          <div style={{
            display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10,
            flexWrap: "wrap",
          }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--text-tertiary)",
            }}>
              {page === SITE_WIDE ? SITE_WIDE : shortenUrl(page)}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
              {list.length} {list.length === 1 ? "issue" : "issues"}
            </span>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {list.map(f => {
              const isOpen = open === f.id;
              return (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    padding: "13px 16px", background: "var(--surface)",
                    border: `1px solid ${severityBorder(f.severity)}`, borderLeftWidth: 3,
                    borderRadius: 10,
                  }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center" }}>
                    <SeverityIcon severity={f.severity} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: "var(--text-primary)" }}>{f.message}</div>
                      <div style={{ marginTop: 4, color: "var(--text-tertiary)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                        {f.category} · {f.rule}
                      </div>
                    </div>
                    <SeverityBadge severity={f.severity} />
                  </div>

                  {/* The reasoning is the point. Collapsed by default so the
                      list stays scannable, but one click from every row. */}
                  {(f.why || f.fix) && (
                    <>
                      <button
                        onClick={() => setOpen(isOpen ? null : f.id)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10,
                          padding: "5px 10px", background: "transparent",
                          border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer",
                          fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em",
                          textTransform: "uppercase", color: "var(--text-secondary)",
                        }}
                      >
                        Why this matters {isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                            style={{ overflow: "hidden" }}
                          >
                            {f.why && (
                              <p style={{ fontSize: 13, color: "var(--text-reading)", lineHeight: 1.65, margin: "10px 0 0" }}>
                                {f.why}
                              </p>
                            )}
                            {f.fix && (
                              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.65, margin: "8px 0 0" }}>
                                <strong style={{ color: "var(--text-primary)" }}>Fix:</strong> {f.fix}
                              </p>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}


function Empty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div
      style={{
        padding: "60px 20px", textAlign: "center",
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-2xl)", color: "var(--text-secondary)",
      }}
    >
      <div style={{ display: "inline-flex", marginBottom: 12, color: "var(--text-tertiary)" }}>{icon}</div>
      <div style={{ fontSize: 17, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 14 }}>{body}</div>
    </div>
  );
}

function Pill({ icon, label, tone }: { icon: React.ReactNode; label: string; tone: "error" | "warning" | "notice" | "muted" }) {
  const colour = {
    error:   "var(--signal-red)",
    warning: "var(--signal-amber)",
    notice:  "var(--signal-blue)",
    muted:   "var(--text-tertiary)",
  }[tone];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "5px 10px", borderRadius: 999,
      border: "1px solid var(--border)", background: "var(--surface)",
      color: colour, fontSize: 12,
    }}>{icon}{label}</span>
  );
}

function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "error")   return <AlertTriangle size={18} color="var(--signal-red)" />;
  if (severity === "warning") return <AlertTriangle size={18} color="var(--signal-amber)" />;
  return <Info size={18} color="var(--signal-blue)" />;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const map = { error: "Error", warning: "Warning", notice: "Notice" };
  return (
    <span style={{
      fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.08em",
      textTransform: "uppercase", color: severity === "error" ? "var(--signal-red)" :
        severity === "warning" ? "var(--signal-amber)" : "var(--signal-blue)",
    }}>{map[severity]}</span>
  );
}

function severityBorder(s: Severity) {
  if (s === "error")   return "var(--signal-red)";
  if (s === "warning") return "var(--signal-amber)";
  return "var(--border)";
}

function shortenUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.host + (url.pathname === "/" ? "" : url.pathname);
  } catch { return u; }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
