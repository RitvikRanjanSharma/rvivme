"use client";

// app/alerts/page.tsx
// =============================================================================
// AI Marketing Lab — Alerts & Notifications
// =============================================================================
// Two stacked sections:
//   1. Inbox      — recent notifications (read/unread, mark all read)
//   2. Rules      — toggleable alert rules with thresholds + email opt-in
//
// Source of data:
//   GET /api/notifications  — inbox
//   GET /api/alerts         — rules (auto-seeded on first hit)
//   PUT /api/alerts         — update rule
//   PATCH /api/notifications — mark read
// =============================================================================

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, Bell, BellOff, CheckCheck, CheckCircle2,
  Info, Loader2, Mail, MailX, TrendingDown, TrendingUp,
} from "lucide-react";

type Notification = {
  id:         string;
  alert_id:   string | null;
  severity:   "info" | "success" | "warning" | "error";
  title:      string;
  body:       string | null;
  link_href:  string | null;
  read_at:    string | null;
  emailed_at: string | null;
  created_at: string;
};

type Alert = {
  id:                string;
  rule_type:
    | "rank_drop" | "rank_gain" | "traffic_drop" | "traffic_spike"
    | "new_keyword" | "lost_keyword" | "audit_critical"
    | "broken_page" | "manual";
  threshold:         number | null;
  enabled:           boolean;
  email_enabled:     boolean;
  last_evaluated_at: string | null;
};

const RULE_META: Record<Alert["rule_type"], {
  title:    string;
  blurb:    string;
  unit?:    string;
  icon:     React.ComponentType<{ size?: number; color?: string }>;
}> = {
  rank_drop:      { title: "Rank drop",       blurb: "Notify when a tracked keyword falls by N places in 7 days", unit: "places", icon: TrendingDown },
  rank_gain:      { title: "Rank gain",       blurb: "Celebrate when a keyword climbs by N places in 7 days",     unit: "places", icon: TrendingUp },
  audit_critical: { title: "Audit issues",    blurb: "Flag any error-severity finding from the latest site audit",                   icon: AlertTriangle },
  new_keyword:    { title: "New rankings",    blurb: "Notify when keywords enter the top 100 for the first time",                    icon: CheckCircle2 },
  lost_keyword:   { title: "Lost rankings",   blurb: "Notify when keywords drop out of the top 100",                                  icon: BellOff },
  traffic_drop:   { title: "Traffic drop",    blurb: "Coming soon — alert on week-over-week traffic decline",      unit: "%",      icon: TrendingDown },
  traffic_spike:  { title: "Traffic spike",   blurb: "Coming soon — alert on week-over-week traffic surge",        unit: "%",      icon: TrendingUp },
  broken_page:    { title: "Broken page",     blurb: "Coming soon — alert when a tracked URL returns 4xx/5xx",                     icon: AlertTriangle },
  manual:         { title: "Manual",          blurb: "Custom rule (advanced)",                                                       icon: Bell },
};

export default function AlertsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [alerts,        setAlerts]        = useState<Alert[]>([]);
  const [loading,       setLoading]       = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const [n, a] = await Promise.all([
        fetch("/api/notifications").then(r => r.json()),
        fetch("/api/alerts").then(r => r.json()),
      ]);
      setNotifications(n?.notifications ?? []);
      setAlerts(a?.alerts ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  const unread = notifications.filter(n => !n.read_at).length;

  async function markAllRead() {
    setNotifications(curr => curr.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    await fetch("/api/notifications", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ all: true }),
    });
  }

  async function markRead(id: string) {
    setNotifications(curr => curr.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    await fetch("/api/notifications", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id }),
    });
  }

  async function updateAlert(id: string, patch: Partial<Pick<Alert, "enabled" | "email_enabled" | "threshold">>) {
    setAlerts(curr => curr.map(a => a.id === id ? { ...a, ...patch } : a));
    await fetch("/api/alerts", {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id, ...patch }),
    });
  }

  return (
    <div className="aiml-page-pad" style={{ padding: "32px 24px 80px", maxWidth: 1100, margin: "0 auto", color: "var(--text-primary)" }}>
      <header className="stack-mobile" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28, gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: 0, lineHeight: 1.15 }}>
            Alerts
          </h1>
          <p style={{ color: "var(--text-secondary)", margin: "6px 0 0", fontSize: 15 }}>
            What we noticed, and what we're watching for. Rule checks run nightly.
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "9px 16px", borderRadius: "var(--radius-pill)",
              background: "var(--surface)", color: "var(--text-primary)",
              border: "1px solid var(--border)", fontSize: 13, cursor: "pointer",
            }}
          >
            <CheckCheck size={14} /> Mark all read
          </button>
        )}
      </header>

      {loading && (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-tertiary)" }}>
          <Loader2 size={20} style={{ animation: "spin 1.4s linear infinite", marginBottom: 8 }} />
          <div style={{ fontSize: 13 }}>Loading…</div>
        </div>
      )}

      {!loading && (
        <>
          <SectionTitle>Inbox{unread > 0 ? ` · ${unread} unread` : ""}</SectionTitle>
          <Inbox notifications={notifications} onRead={markRead} />

          <SectionTitle style={{ marginTop: 36 }}>Rules</SectionTitle>
          <p style={{ color: "var(--text-tertiary)", fontSize: 13, margin: "0 0 14px" }}>
            Toggle a rule on, set its threshold, and decide whether to email you when it fires.
          </p>
          <RulesList alerts={alerts} onChange={updateAlert} />
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------
function Inbox({
  notifications, onRead,
}: {
  notifications: Notification[];
  onRead:        (id: string) => void;
}) {
  if (notifications.length === 0) {
    return (
      <Empty
        icon={<Bell size={26} />}
        title="No notifications yet"
        body="When a rule fires, it'll show up here. The rule checks run once a day."
      />
    );
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {notifications.map(n => (
        <motion.div
          key={n.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => { if (!n.read_at) onRead(n.id); }}
          style={{
            display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center",
            padding: "13px 16px", background: "var(--surface)",
            border: `1px solid ${severityBorder(n.severity)}`, borderLeftWidth: 3,
            borderRadius: 10, cursor: n.read_at ? "default" : "pointer",
            opacity: n.read_at ? 0.7 : 1,
          }}
        >
          <SeverityIcon severity={n.severity} />
          <div>
            <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: n.read_at ? 400 : 500 }}>
              {n.title}
            </div>
            {n.body && (
              <div style={{ marginTop: 3, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5 }}>
                {n.body}
              </div>
            )}
            <div style={{ marginTop: 4, color: "var(--text-tertiary)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
              {formatTime(n.created_at)}
              {n.emailed_at && <> · emailed</>}
              {n.link_href && (
                <> · <a href={n.link_href} style={{ color: "var(--text-secondary)" }}>open</a></>
              )}
            </div>
          </div>
          {!n.read_at && (
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: severityColor(n.severity),
            }} />
          )}
        </motion.div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
function RulesList({
  alerts, onChange,
}: {
  alerts:   Alert[];
  onChange: (id: string, patch: Partial<Pick<Alert, "enabled" | "email_enabled" | "threshold">>) => void;
}) {
  if (alerts.length === 0) {
    return (
      <Empty
        icon={<Bell size={26} />}
        title="No rules yet"
        body="Refresh in a moment — defaults are seeded on first visit."
      />
    );
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {alerts.map(a => {
        const meta = RULE_META[a.rule_type];
        const Icon = meta.icon;
        const isComingSoon = a.rule_type === "traffic_drop" || a.rule_type === "traffic_spike" || a.rule_type === "broken_page";
        return (
          <div
            key={a.id}
            className="aiml-alert-rule-row"
            style={{
              display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: 14, alignItems: "center",
              padding: "14px 16px", background: "var(--surface)",
              border: "1px solid var(--border)", borderRadius: 10,
              opacity: isComingSoon ? 0.55 : 1,
            }}
          >
            <Icon size={18} color="var(--text-secondary)" />
            <div>
              <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>
                {meta.title}
                {isComingSoon && (
                  <span style={{
                    marginLeft: 8, fontSize: 10, fontFamily: "var(--font-mono)",
                    color: "var(--text-tertiary)", letterSpacing: "0.08em",
                  }}>SOON</span>
                )}
              </div>
              <div style={{ marginTop: 3, color: "var(--text-tertiary)", fontSize: 12 }}>
                {meta.blurb}
                {a.last_evaluated_at && (
                  <> · last checked {formatTime(a.last_evaluated_at)}</>
                )}
              </div>
            </div>

            {/* Threshold */}
            {meta.unit ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number" min={1} max={100} step={1}
                  value={a.threshold ?? ""}
                  disabled={isComingSoon}
                  onChange={e => onChange(a.id, { threshold: e.target.value === "" ? null : Number(e.target.value) })}
                  style={{
                    width: 56, padding: "6px 8px",
                    background: "var(--surface-2)", border: "1px solid var(--border)",
                    borderRadius: 6, color: "var(--text-primary)", fontSize: 13,
                    textAlign: "right",
                  }}
                />
                <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{meta.unit}</span>
              </div>
            ) : <span />}

            {/* Email toggle */}
            <button
              onClick={() => onChange(a.id, { email_enabled: !a.email_enabled })}
              disabled={isComingSoon || !a.enabled}
              title={a.email_enabled ? "Email on" : "Email off"}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 10px", borderRadius: 8,
                background: a.email_enabled ? "rgba(var(--brand-rgb), 0.12)" : "var(--surface-2)",
                color: a.email_enabled ? "var(--brand)" : "var(--text-tertiary)",
                border: "1px solid var(--border)", fontSize: 12,
                cursor: (isComingSoon || !a.enabled) ? "not-allowed" : "pointer",
              }}
            >
              {a.email_enabled ? <Mail size={12} /> : <MailX size={12} />}
              Email
            </button>

            {/* Enable toggle */}
            <Toggle
              checked={a.enabled}
              disabled={isComingSoon}
              onChange={v => onChange(a.id, { enabled: v })}
            />
          </div>
        );
      })}
    </div>
  );
}

function Toggle({
  checked, onChange, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative", width: 36, height: 20, borderRadius: 999,
        background: checked ? "var(--brand)" : "var(--surface-2)",
        border: "1px solid var(--border)", cursor: disabled ? "not-allowed" : "pointer",
        transition: "background var(--dur-fast)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        position: "absolute", top: 1, left: checked ? 17 : 1,
        width: 16, height: 16, borderRadius: "50%",
        background: "#fff", transition: "left var(--dur-fast)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
      }} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------
function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
      color: "var(--text-tertiary)", marginBottom: 10,
      ...style,
    }}>
      {children}
    </div>
  );
}

function Empty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{
      padding: "44px 20px", textAlign: "center",
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-2xl)", color: "var(--text-secondary)",
    }}>
      <div style={{ display: "inline-flex", marginBottom: 10, color: "var(--text-tertiary)" }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13 }}>{body}</div>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: Notification["severity"] }) {
  if (severity === "error")   return <AlertTriangle size={16} color="var(--signal-red)" />;
  if (severity === "warning") return <AlertTriangle size={16} color="var(--signal-amber)" />;
  if (severity === "success") return <CheckCircle2 size={16} color="var(--signal-green)" />;
  return <Info size={16} color="var(--signal-blue)" />;
}

function severityBorder(s: Notification["severity"]) {
  if (s === "error")   return "var(--signal-red)";
  if (s === "warning") return "var(--signal-amber)";
  if (s === "success") return "var(--signal-green)";
  return "var(--border)";
}
function severityColor(s: Notification["severity"]) {
  if (s === "error")   return "var(--signal-red)";
  if (s === "warning") return "var(--signal-amber)";
  if (s === "success") return "var(--signal-green)";
  return "var(--signal-blue)";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
