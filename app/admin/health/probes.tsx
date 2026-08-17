"use client";

// app/admin/health/probes.tsx
// ============================================================================
// Live probes against the Google-backed routes.
//
// Client-side on purpose. These routes authenticate with the caller's session
// cookie, so calling them from the browser tests exactly the path the dashboard
// takes. A server-side probe using the service account could succeed where the
// real request fails, which would be worse than no check at all — it would
// certify something broken as working.
//
// The distinction each probe reports is the one that matters: "not connected"
// and "connected but returning nothing" look identical on a dashboard and need
// completely different responses.
// ============================================================================

import { useState } from "react";

type Verdict = "ok" | "empty" | "not_connected" | "error" | "idle" | "running";

type Probe = {
  key:     string;
  label:   string;
  verdict: Verdict;
  detail:  string;
};

const TONE: Record<Verdict, string> = {
  ok:            "var(--signal-green)",
  empty:         "var(--signal-amber)",
  not_connected: "var(--signal-amber)",
  error:         "var(--signal-red)",
  idle:          "var(--text-tertiary)",
  running:       "var(--text-tertiary)",
};

const WORD: Record<Verdict, string> = {
  ok: "OK", empty: "EMPTY", not_connected: "NOT CONNECTED",
  error: "ERROR", idle: "—", running: "…",
};

export function HealthProbes() {
  const [probes, setProbes] = useState<Probe[]>([]);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setProbes([]);
    const out: Probe[] = [];

    // ── Search Console ───────────────────────────────────────────────────────
    try {
      const r = await fetch("/api/gsc").then(x => x.json());
      if (!r.success) {
        out.push({
          key: "gsc", label: "Search Console",
          verdict: r.reason === "not_connected" || r.reason === "reauth_required" ? "not_connected" : "error",
          detail: r.message ?? r.reason ?? "call failed",
        });
      } else {
        const clicks      = r.summary?.clicks ?? 0;
        const impressions = r.summary?.impressions ?? 0;
        const queries     = r.topQueries?.length ?? 0;
        out.push({
          key: "gsc", label: "Search Console",
          verdict: impressions > 0 ? "ok" : "empty",
          detail: impressions > 0
            ? `${impressions} impressions, ${clicks} clicks, ${queries} queries (28d)`
            : "connected, but no impressions in the last 28 days",
        });
      }
    } catch (e) {
      out.push({ key: "gsc", label: "Search Console", verdict: "error", detail: String(e) });
    }
    setProbes([...out]);

    // ── GA4 ──────────────────────────────────────────────────────────────────
    try {
      const r = await fetch("/api/ga4").then(x => x.json());
      if (!r.success) {
        out.push({
          key: "ga4", label: "Google Analytics 4",
          verdict: r.reason === "not_connected" || r.reason === "reauth_required" ? "not_connected" : "error",
          detail: r.message ?? r.reason ?? "call failed",
        });
      } else {
        const sessions = r.summary?.sessions ?? 0;
        const pages    = r.topPages?.length ?? 0;
        out.push({
          key: "ga4", label: "Google Analytics 4",
          verdict: sessions > 0 ? "ok" : "empty",
          detail: sessions > 0
            ? `${sessions} sessions, ${pages} pages with traffic (28d)`
            : "connected, but no sessions in the last 28 days",
        });
      }
    } catch (e) {
      out.push({ key: "ga4", label: "Google Analytics 4", verdict: "error", detail: String(e) });
    }
    setProbes([...out]);

    // ── Integration status ───────────────────────────────────────────────────
    try {
      const r = await fetch("/api/integrations/status").then(x => x.json());
      const parts = Object.entries(r ?? {})
        .filter(([, v]) => typeof v === "string")
        .map(([k, v]) => `${k}: ${v}`);
      out.push({
        key: "status", label: "Integrations probe",
        verdict: parts.length ? "ok" : "error",
        detail: parts.join(" · ") || "no status returned",
      });
    } catch (e) {
      out.push({ key: "status", label: "Integrations probe", verdict: "error", detail: String(e) });
    }

    setProbes([...out]);
    setBusy(false);
  }

  const gsc = probes.find(p => p.key === "gsc");
  const ga4 = probes.find(p => p.key === "ga4");
  const joinReady = gsc?.verdict === "ok" && ga4?.verdict === "ok";
  const bothRun = !!gsc && !!ga4;

  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: "14px", padding: "18px", marginBottom: "16px",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: "12px", flexWrap: "wrap", marginBottom: "12px",
      }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: "9.5px", letterSpacing: "0.12em",
          textTransform: "uppercase", color: "var(--text-tertiary)",
        }}>
          Live sources
        </div>
        <button onClick={run} disabled={busy} className="aiml-touch-target" style={{
          fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.06em",
          color: "#fff", background: busy ? "var(--text-tertiary)" : "var(--brand-strong)",
          border: "none", borderRadius: "8px", padding: "9px 16px",
          cursor: busy ? "default" : "pointer",
        }}>
          {busy ? "CHECKING…" : "RUN CHECK"}
        </button>
      </div>

      {probes.length === 0 && !busy && (
        <p style={{
          fontFamily: "var(--font-body)", fontSize: "12.5px",
          color: "var(--text-tertiary)", lineHeight: 1.6, margin: 0,
        }}>
          Nothing measured yet. These calls hit Google live, so they take a few
          seconds.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {probes.map(p => (
          <div key={p.key} style={{ borderLeft: `2px solid ${TONE[p.verdict]}`, paddingLeft: "12px" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em",
                color: TONE[p.verdict], fontWeight: 600,
              }}>
                {WORD[p.verdict]}
              </span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-primary)" }}>
                {p.label}
              </span>
            </div>
            <div style={{
              fontFamily: "var(--font-body)", fontSize: "12.5px",
              color: "var(--text-reading)", lineHeight: 1.6, marginTop: "2px",
            }}>
              {p.detail}
            </div>
          </div>
        ))}
      </div>

      {bothRun && !busy && (
        <div style={{
          marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--border)",
          fontFamily: "var(--font-body)", fontSize: "12.5px",
          color: joinReady ? "var(--signal-green)" : "var(--signal-amber)", lineHeight: 1.6,
        }}>
          {joinReady
            ? "Both sources return rows — a joined GA4 × Search Console view has real data to work with."
            : "A joined GA4 × Search Console view needs both sides returning rows. Whichever side is empty above will make the join look broken, so it is worth fixing first."}
        </div>
      )}
    </div>
  );
}
