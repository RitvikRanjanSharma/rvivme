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
import { FirstVisitHint } from "@/app/ui/first-visit-hint";
import { AuditWalkthrough } from "@/app/ui/audit-walkthrough";
import { readyFix, canSuggest } from "@/lib/audit-fixes";
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
  /** Crawl bookkeeping written by runAudit — see meta.crawl. */
  meta: { crawl?: { discovered?: number; audited?: number; skipped_disallowed?: number } } | null;
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
  const [inFlight, setInFlight] = useState(false);
  /** Any domain can be audited on the spot — no Google connection needed. */
  const [domain,   setDomain]   = useState("");
  const [plan,      setPlan]      = useState<Plan | null>(null);
  const [planning,  setPlanning]  = useState(false);

  async function buildPlan() {
    setPlanning(true);
    try {
      const res = await fetch("/api/site-audit/plan", { method: "POST" });
      const j = await res.json().catch(() => null);
      if (j?.success) setPlan(j);
    } finally {
      setPlanning(false);
    }
  }

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
      // A plan describes one audit. Keeping it across a refresh would show
      // advice for findings that are no longer on screen.
      setPlan(null);
      setInFlight(Boolean(j.running));
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
      // Send whatever is typed in the box; the route falls back to the stored
      // website URL when it is empty. This is what makes the audit usable
      // against a site the visitor has never connected — the crawler and
      // PageSpeed both work from the public URL alone, so nothing here needs
      // Search Console or Analytics.
      const target = domain.trim();
      const res = await fetch("/api/site-audit", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(target ? { domain: target } : {}),
      });
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
            Technical SEO scan of any website. Nothing to connect — paste a URL and run it.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={domain}
          onChange={e => setDomain(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !running) run(); }}
          placeholder="yourcompany.co.uk"
          aria-label="Website to audit"
          style={{
            fontFamily: "var(--font-body)", fontSize: 14,
            color: "var(--text-primary)", background: "var(--surface)",
            border: "1px solid var(--border)", borderRadius: "var(--radius-pill)",
            padding: "10px 16px", minWidth: 220,
          }}
        />
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
        </div>
      </header>

      <FirstVisitHint id="audit">
        Paste any website above and press <strong>Run audit</strong>. Every finding
        shows your actual page content, and most come with a ready-to-paste fix or a
        <strong> Write the fix for me</strong> button.
      </FirstVisitHint>

      {/* Only once there is a result to point at — explaining "the number
          in the circle" to someone looking at an empty page is the mistake
          this is meant to avoid. */}
      <AuditWalkthrough ready={Boolean(audit && !inFlight && findings.length > 0)} />

      {audit && !inFlight && (
        <ActionPlan plan={plan} loading={planning} onBuild={buildPlan} />
      )}

      {loading && !audit && (
        <Empty
          icon={<Loader2 size={28} style={{ animation: "spin 1.4s linear infinite" }} />}
          title="Loading…"
          body="Fetching your latest audit."
        />
      )}

      {/* Started, not yet stalled. Without this the page shows the previous
          audit's numbers while a new one is mid-flight, which reads as though
          the new run produced them. */}
      {inFlight && !running && !problem && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 18px", borderRadius: 12, marginBottom: 20,
          background: "var(--surface)", border: "1px solid var(--border)",
        }}>
          <Loader2 size={14} style={{ animation: "spin 1.4s linear infinite", flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            A scan is running. Anything shown below is from the previous run until it finishes.
          </div>
        </div>
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
             : problem.reason === "save_failed"    ? "Scan finished but couldn't be saved"
             : problem.reason === "insert_failed"  ? "Couldn't start the scan"
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

      {/* A stalled run has nothing to report. Rendering its placeholder zeros
          under the warning invites the reader to treat them as results —
          "score 0 out of 100" is a far more alarming statement than "the scan
          didn't finish", and it isn't true. */}
      {audit && !stalled && (
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
  const skippedDisallowed = audit.meta?.crawl?.skipped_disallowed ?? 0;
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
          {skippedDisallowed > 0 && (
            <>
              {" · "}
              <span title="Pages your robots.txt tells crawlers to ignore aren't audited, because findings on them can't affect search results.">
                {skippedDisallowed} skipped as disallowed
              </span>
            </>
          )}
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
                  {true && (
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

                            {/* Evidence, then the fix itself. In that order on
                                purpose: showing the actual value is what makes
                                the finding verifiable rather than a claim. */}
                            <Evidence detail={f.detail} />
                            <ReadyFixes rule={f.rule} detail={f.detail} pageUrl={f.page_url} />
                            <Suggest rule={f.rule} detail={f.detail} pageUrl={f.page_url} />
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


// ─── Action plan ─────────────────────────────────────────────────────────────
// The audit says what is wrong; this says what to do about it and in what
// order. Ordering comes from our own impact scores rather than the model —
// letting an LLM rank the work produces confident-sounding priorities nobody
// can defend.

type PlanAction = {
  order: number; rule: string; title: string; severity: string;
  count: number; impact: number; effort: "quick" | "medium" | "project";
  why: string; fix: string; pages: string[];
};
type Plan = {
  success: boolean; clean: boolean; summary: string;
  audit?: { domain: string; score: number; pages: number };
  actions: PlanAction[];
};

const EFFORT_LABEL: Record<string, string> = {
  quick:   "Under an hour",
  medium:  "A few hours",
  project: "A day or more",
};

function ActionPlan({ plan, loading, onBuild }: {
  plan: Plan | null; loading: boolean; onBuild: () => void;
}) {
  if (!plan) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 14, flexWrap: "wrap", padding: "16px 18px", borderRadius: 12,
        marginBottom: 20, background: "var(--card)", border: "1px solid var(--border)",
      }}>
        <div style={{ fontSize: 13.5, color: "var(--text-reading)", lineHeight: 1.6, maxWidth: 620 }}>
          <strong style={{ color: "var(--text-primary)" }}>Turn this into a plan.</strong>{" "}
          Groups the findings, orders them by what will actually move the needle,
          and estimates the effort for each.
        </div>
        <button onClick={onBuild} disabled={loading} style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "10px 18px", borderRadius: "var(--radius-pill)",
          background: loading ? "var(--text-tertiary)" : "var(--brand-strong)",
          color: "#fff", border: "none", fontSize: 14, fontWeight: 500,
          cursor: loading ? "wait" : "pointer", whiteSpace: "nowrap",
        }}>
          {loading ? "Building…" : "Build action plan"}
        </button>
      </div>
    );
  }

  return (
    <div style={{
      padding: "20px 22px", borderRadius: 14, marginBottom: 24,
      background: "var(--card)", border: "1px solid var(--border)",
    }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 10,
      }}>
        What to do, in order
      </div>

      <p style={{ fontSize: 14, color: "var(--text-reading)", lineHeight: 1.7, margin: "0 0 18px" }}>
        {plan.summary}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {plan.actions.map(a => (
          <div key={a.rule} style={{
            display: "flex", gap: 12, paddingBottom: 14,
            borderBottom: "1px solid var(--border-subtle)",
          }}>
            <div style={{
              flexShrink: 0, width: 26, height: 26, borderRadius: "50%",
              background: "var(--muted)", border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)",
            }}>
              {a.order}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontSize: 14.5, fontWeight: 500, color: "var(--text-primary)" }}>
                  {a.title}
                </span>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em",
                  color: "var(--text-tertiary)",
                }}>
                  {EFFORT_LABEL[a.effort]} · impact {a.impact}/100
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-reading)", lineHeight: 1.65, marginTop: 4 }}>
                {a.why}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.65, marginTop: 4 }}>
                <strong style={{ color: "var(--brand)" }}>Do this:</strong> {a.fix}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── Evidence ────────────────────────────────────────────────────────────────
// "Title is 68 characters" is a claim. Showing the title, with its length, is
// evidence — and it is the difference between a reader trusting the audit and
// wondering whether it actually read their page. The crawler was already
// capturing these values; they were simply never displayed.

function Evidence({ detail }: { detail: Record<string, unknown> | null }) {
  if (!detail) return null;

  const rows: { label: string; value: string; count?: number }[] = [];
  const s = (k: string) => (typeof detail[k] === "string" ? (detail[k] as string) : undefined);

  const title = s("title");
  const desc  = s("description");
  const h1    = s("h1");

  if (title) rows.push({ label: "Current title", value: title, count: title.length });
  if (desc)  rows.push({ label: "Current description", value: desc, count: desc.length });
  if (h1 && !title) rows.push({ label: "Page heading", value: h1 });

  if (Array.isArray(detail.headings) && detail.headings.length) {
    rows.push({ label: "Headings found", value: (detail.headings as string[]).map(h => `“${h}”`).join("  ·  ") });
  }
  if (typeof detail.word_count === "number") {
    rows.push({ label: "Words on page", value: String(detail.word_count) });
  }
  if (typeof detail.total === "number" && typeof detail.missing === "number") {
    rows.push({ label: "Images", value: `${detail.missing} of ${detail.total} missing alt text` });
  }
  if (Array.isArray(detail.pages) && detail.pages.length) {
    rows.push({ label: "Pages affected", value: (detail.pages as string[]).join("\n") });
  }

  if (rows.length === 0) return null;

  return (
    <div style={{ marginTop: 12 }}>
      {rows.map(r => (
        <div key={r.label} style={{ marginBottom: 8 }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 3,
          }}>
            {r.label}{r.count !== undefined ? ` · ${r.count} characters` : ""}
          </div>
          <div style={{
            fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "8px 10px", lineHeight: 1.55,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {r.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Ready-to-paste fixes ────────────────────────────────────────────────────
// Generated in code, not by a model. For these rules there is exactly one
// correct answer, and a deterministic function cannot hallucinate an attribute
// or drift between runs.

function ReadyFixes({ rule, detail, pageUrl }: {
  rule: string; detail: Record<string, unknown> | null; pageUrl: string | null;
}) {
  const fixes = readyFix(rule, detail ?? undefined, pageUrl ?? undefined);
  if (fixes.length === 0) return null;

  return (
    <div style={{ marginTop: 14 }}>
      {fixes.map(fx => (
        <div key={fx.label} style={{ marginBottom: 12 }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: 10, marginBottom: 4, flexWrap: "wrap",
          }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "var(--text-tertiary)",
            }}>
              Paste this · {fx.label}
            </span>
            <CopyButton text={fx.code} />
          </div>
          <pre style={{
            fontFamily: "var(--font-mono)", fontSize: 11.5, lineHeight: 1.6,
            color: "var(--text-primary)", background: "var(--surface)",
            border: "1px solid var(--border)", borderRadius: 8,
            padding: "10px 12px", margin: 0, overflowX: "auto", whiteSpace: "pre",
          }}>
            {fx.code}
          </pre>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.5 }}>
            {fx.where}
          </div>
        </div>
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch { /* clipboard blocked — the text is still selectable */ }
      }}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em",
        color: done ? "var(--signal-green)" : "var(--text-secondary)",
        background: "transparent", border: "1px solid var(--border)",
        borderRadius: 6, padding: "4px 9px", cursor: "pointer",
      }}
    >
      {done ? "COPIED" : "COPY"}
    </button>
  );
}

// ─── On-demand suggestions ───────────────────────────────────────────────────
// Only for rules where writing something IS the fix. A broken link needs
// finding, not writing — offering a button there that returns waffle would be
// worse than not offering one.

function Suggest({ rule, detail, pageUrl }: {
  rule: string; detail: Record<string, unknown> | null; pageUrl: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<{
    heading: string; kind: string; options: string[]; lengths: number[] | null; dropped: number;
  } | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  if (!canSuggest(rule)) return null;

  async function run() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/site-audit/suggest", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ rule, detail, page_url: pageUrl }),
      });
      const j = await res.json().catch(() => null);
      if (j?.success) setResult(j);
      else setError(j?.message ?? "Couldn't generate a suggestion.");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      {!result && (
        <button onClick={run} disabled={loading} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "#fff",
          background: loading ? "var(--text-tertiary)" : "var(--brand-strong)",
          border: "none", borderRadius: 7, padding: "6px 12px",
          cursor: loading ? "wait" : "pointer",
        }}>
          {loading ? "Writing…" : "Write the fix for me"}
        </button>
      )}

      {error && (
        <div style={{ fontSize: 12.5, color: "var(--signal-amber)", marginTop: 8, lineHeight: 1.55 }}>
          {error}
        </div>
      )}

      {result && (
        <div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 6,
          }}>
            {result.heading}
          </div>
          {result.options.map((opt, i) => (
            <div key={i} style={{
              display: "flex", gap: 10, alignItems: "flex-start",
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "9px 11px", marginBottom: 6,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, color: "var(--text-primary)",
                  lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {opt}
                </div>
                {result.lengths && (
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 10,
                    color: "var(--text-tertiary)", marginTop: 3,
                  }}>
                    {result.lengths[i]} characters
                  </div>
                )}
              </div>
              <CopyButton text={opt} />
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.5, marginTop: 4 }}>
            Written from this page&rsquo;s own heading and opening content. Read before
            publishing &mdash; you know your business better than we do.
          </div>
        </div>
      )}
    </div>
  );
}
