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
import { motion } from "framer-motion";
import {
  AlertTriangle, CheckCircle2, Info, Loader2, Play, RefreshCw, Search,
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

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/site-audit");
      const j = await res.json();
      setAudit(j.audit ?? null);
      setFindings(j.findings ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function run() {
    setRunning(true);
    try {
      await fetch("/api/site-audit", { method: "POST" });
      await refresh();
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
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: 0, lineHeight: 1.15 }}>
            Site audit
          </h1>
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
            background: "var(--brand)", color: "#fff", border: "none",
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

      {!loading && !audit && (
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
          {audit.domain} · {audit.pages_crawled} pages crawled
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
  if (findings.length === 0) {
    return (
      <Empty
        icon={<CheckCircle2 size={28} color="var(--signal-green)" />}
        title="Clean bill of health"
        body="No issues found on this run. Re-run weekly to catch regressions."
      />
    );
  }
  // Sort: error > warning > notice
  const order = { error: 0, warning: 1, notice: 2 };
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {sorted.map((f) => (
        <motion.div
          key={f.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center",
            padding: "14px 16px", background: "var(--surface)",
            border: `1px solid ${severityBorder(f.severity)}`, borderLeftWidth: 3,
            borderRadius: 10,
          }}
        >
          <SeverityIcon severity={f.severity} />
          <div>
            <div style={{ fontSize: 14, color: "var(--text-primary)" }}>{f.message}</div>
            <div style={{ marginTop: 4, color: "var(--text-tertiary)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
              {f.category} · {f.rule}
              {f.page_url && (
                <> · <a href={f.page_url} target="_blank" rel="noreferrer" style={{ color: "var(--text-secondary)" }}>{shortenUrl(f.page_url)}</a></>
              )}
            </div>
          </div>
          <SeverityBadge severity={f.severity} />
        </motion.div>
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
