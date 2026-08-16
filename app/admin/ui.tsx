"use client";

// app/admin/ui.tsx
// ============================================================================
// Shared form primitives for the admin panel.
//
// Client components because they own submit state — a save that gives no
// feedback is indistinguishable from a save that failed, and this panel edits
// the live site, so "did that work?" must never be a guess.
// ============================================================================

import { useState, useTransition } from "react";

type Result = { ok: true } | { ok: false; error: string };

export function AdminForm({
  action, children, submitLabel = "Save", onDone,
}: {
  action: (form: FormData) => Promise<Result>;
  children: React.ReactNode;
  submitLabel?: string;
  onDone?: () => void;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setMsg(null);
        start(async () => {
          const r = await action(form);
          setMsg(r.ok
            ? { ok: true,  text: "Saved. Live now." }
            : { ok: false, text: r.error });
          if (r.ok) onDone?.();
        });
      }}
      style={{ display: "flex", flexDirection: "column", gap: "12px" }}
    >
      {children}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <button type="submit" disabled={pending} style={{
          fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.06em",
          color: "#fff", background: pending ? "var(--text-tertiary)" : "var(--brand-strong)",
          border: "none", borderRadius: "8px", padding: "10px 18px",
          cursor: pending ? "default" : "pointer",
        }}>
          {pending ? "SAVING…" : submitLabel.toUpperCase()}
        </button>
        {msg && (
          <span style={{
            fontFamily: "var(--font-body)", fontSize: "12.5px", lineHeight: 1.5,
            color: msg.ok ? "var(--signal-green)" : "var(--signal-red)",
          }}>
            {msg.text}
          </span>
        )}
      </div>
    </form>
  );
}

export function Field({
  label, name, defaultValue, placeholder, hint, textarea, rows = 3, mono,
}: {
  label: string; name: string;
  defaultValue?: string | null; placeholder?: string; hint?: string;
  textarea?: boolean; rows?: number; mono?: boolean;
}) {
  const style: React.CSSProperties = {
    fontFamily: mono ? "var(--font-mono)" : "var(--font-body)",
    fontSize: mono ? "12px" : "13px",
    color: "var(--text-primary)", background: "var(--surface)",
    border: "1px solid var(--border)", borderRadius: "8px",
    padding: "9px 11px", width: "100%", resize: "vertical",
  };
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em",
        textTransform: "uppercase", color: "var(--text-tertiary)",
      }}>
        {label}
      </span>
      {textarea
        ? <textarea name={name} defaultValue={defaultValue ?? ""} placeholder={placeholder} rows={rows} style={style} />
        : <input    name={name} defaultValue={defaultValue ?? ""} placeholder={placeholder} style={style} />}
      {hint && (
        <span style={{
          fontFamily: "var(--font-body)", fontSize: "11.5px",
          color: "var(--text-tertiary)", lineHeight: 1.5,
        }}>
          {hint}
        </span>
      )}
    </label>
  );
}

/**
 * Three states, not a checkbox.
 *
 * "Inherit" is a real and distinct choice from "false": it means the code keeps
 * deciding. A two-state checkbox would silently convert every untouched field
 * into an explicit override the first time anything on the page was saved.
 */
export function TriState({
  label, name, defaultValue, hint,
}: { label: string; name: string; defaultValue: boolean | null; hint?: string }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em",
        textTransform: "uppercase", color: "var(--text-tertiary)",
      }}>
        {label}
      </span>
      <select name={name} defaultValue={defaultValue === null ? "" : String(defaultValue)} style={{
        fontFamily: "var(--font-body)", fontSize: "13px",
        color: "var(--text-primary)", background: "var(--surface)",
        border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 11px",
      }}>
        <option value="">Inherit from code</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
      {hint && (
        <span style={{
          fontFamily: "var(--font-body)", fontSize: "11.5px",
          color: "var(--text-tertiary)", lineHeight: 1.5,
        }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export function Card({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: "14px", padding: "18px", marginBottom: "16px",
    }}>
      <div style={{
        fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 500,
        color: "var(--text-primary)", marginBottom: description ? "4px" : "12px",
      }}>
        {title}
      </div>
      {description && (
        <p style={{
          fontFamily: "var(--font-body)", fontSize: "12.5px",
          color: "var(--text-reading)", lineHeight: 1.6, margin: "0 0 14px",
        }}>
          {description}
        </p>
      )}
      {children}
    </div>
  );
}
