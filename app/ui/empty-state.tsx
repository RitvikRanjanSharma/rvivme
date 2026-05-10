"use client";

// app/ui/empty-state.tsx
// =============================================================================
// AI Marketing Lab — Reusable empty-state component
// =============================================================================
// Used by dashboard panels (GA4, GSC, GEO, backlinks, audit, keywords) when
// data is missing because something isn't connected yet, hasn't been run yet,
// or simply has nothing to show. The point is to make every "blank" feel
// purposeful instead of broken.
//
// Three flavours:
//   variant="connect"   → asks user to connect a source (Settings link)
//   variant="run"       → asks user to run a one-off action (button)
//   variant="info"      → calm "nothing to see, that's fine" message
// =============================================================================

import Link from "next/link";
import { Loader2, type LucideIcon } from "lucide-react";

export type EmptyVariant = "connect" | "run" | "info" | "error";

export function EmptyState({
  icon: Icon,
  title,
  body,
  variant = "info",
  actionLabel,
  actionHref,
  onAction,
  loading,
  compact,
}: {
  icon?:        LucideIcon;
  title:        string;
  body:         string;
  variant?:     EmptyVariant;
  actionLabel?: string;
  actionHref?:  string;
  onAction?:    () => void;
  loading?:     boolean;
  compact?:     boolean;
}) {
  const accent = {
    connect: "var(--brand)",
    run:     "var(--brand)",
    info:    "var(--text-secondary)",
    error:   "var(--signal-red)",
  }[variant];

  const padding = compact ? "28px 16px" : "44px 20px";
  const titleSize = compact ? 15 : 16;

  const content = (
    <div style={{
      padding, textAlign: "center",
      background: "var(--surface)",
      border: variant === "error"
        ? "1px solid var(--signal-red)"
        : "1px dashed var(--border-strong)",
      borderRadius: "var(--radius-2xl)",
      color: "var(--text-secondary)",
    }}>
      {Icon && (
        <div style={{
          display: "inline-flex",
          width: 38, height: 38, borderRadius: "50%",
          background: "var(--surface-2)",
          alignItems: "center", justifyContent: "center",
          marginBottom: 12, color: accent,
        }}>
          {loading
            ? <Loader2 size={18} style={{ animation: "spin 1.4s linear infinite" }} />
            : <Icon size={18} />}
        </div>
      )}
      <div style={{
        fontSize: titleSize, fontWeight: 500,
        color: "var(--text-primary)", marginBottom: 4,
      }}>
        {title}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.55, maxWidth: 380, margin: "0 auto" }}>
        {body}
      </div>

      {(actionLabel && (actionHref || onAction)) && (
        <div style={{ marginTop: 16 }}>
          {actionHref ? (
            <Link href={actionHref} style={actionStyle(variant)}>
              {actionLabel}
            </Link>
          ) : (
            <button onClick={onAction} style={actionStyle(variant)}>
              {actionLabel}
            </button>
          )}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return content;
}

function actionStyle(variant: EmptyVariant): React.CSSProperties {
  const isPrimary = variant === "connect" || variant === "run";
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "9px 16px", borderRadius: "var(--radius-pill)",
    background: isPrimary ? "var(--brand)" : "var(--surface-2)",
    color: isPrimary ? "#fff" : "var(--text-primary)",
    border: isPrimary ? "none" : "1px solid var(--border)",
    fontSize: 13, fontWeight: 500, cursor: "pointer", textDecoration: "none",
  };
}
