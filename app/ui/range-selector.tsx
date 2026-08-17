"use client";

// app/ui/range-selector.tsx
// ============================================================================
// The date-range control used by the dashboard panels.
//
// One component rather than one per panel, so the options, the styling and the
// keyboard behaviour cannot drift apart — and so adding a range later means
// editing lib/date-range.ts alone.
//
// Rendered as real <button>s in a group rather than a <select>. The options are
// few and fixed, switching is the common action, and a native select on mobile
// opens a full-screen picker for what should be one tap.
// ============================================================================

import { RANGES, type RangeKey } from "@/lib/date-range";

export function RangeSelector({
  value, onChange, disabled,
}: {
  value: RangeKey;
  onChange: (key: RangeKey) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Date range"
      style={{
        display: "inline-flex", gap: "2px", flexWrap: "wrap",
        background: "var(--muted)", border: "1px solid var(--border)",
        borderRadius: "8px", padding: "2px",
      }}
    >
      {RANGES.map(r => {
        const active = r.key === value;
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => onChange(r.key)}
            disabled={disabled}
            aria-pressed={active}
            className="aiml-touch-target"
            style={{
              fontFamily: "var(--font-mono)", fontSize: "10.5px",
              letterSpacing: "0.06em", whiteSpace: "nowrap",
              // The active option uses the solid brand colour with white text
              // rather than a tint: at 10.5px a tinted label on a tinted
              // background is the first thing to fail a contrast check.
              color: active ? "#fff" : "var(--text-secondary)",
              background: active ? "var(--brand-strong)" : "transparent",
              border: "none", borderRadius: "6px",
              padding: "6px 10px",
              cursor: disabled ? "default" : "pointer",
              opacity: disabled ? 0.6 : 1,
              transition: "background var(--dur-fast), color var(--dur-fast)",
            }}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
