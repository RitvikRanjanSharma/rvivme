"use client";

// app/ui/first-visit-hint.tsx
// ============================================================================
// One line of explanation, the first time a page is opened.
//
// WHY NOT A TOUR
//
// The obvious way to teach an interface is a step-through overlay with
// highlights. It is also the thing people click "skip" on without reading,
// because it arrives before they have any question it could answer. A tour
// interrupts; a hint waits to be useful.
//
// So: one sentence at the top of the page, in the flow rather than over it,
// dismissed permanently on the first close. Nothing blocks, nothing traps
// focus, and a returning user never sees it again.
//
// PER PAGE, NOT PER SESSION
//
// Stored under a key per hint id, so someone who opens the audit today and
// answer engines next week gets the explanation each time they reach somewhere
// new. A single "onboarded" flag would teach one page and silently swallow the
// rest.
//
// localStorage rather than the database on purpose: this is a UI preference,
// not user data. It does not need a round trip, it does not need to survive a
// device change, and it should never be the reason a page waits to render.
// ============================================================================

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const PREFIX = "aiml-hint-";

export function FirstVisitHint({
  id, children,
}: {
  /** Stable per surface, e.g. "audit". Changing it re-shows the hint. */
  id: string;
  children: React.ReactNode;
}) {
  // Starts hidden and is revealed after mount. Rendering it during SSR and
  // then hiding it would flash the hint at people who dismissed it months ago.
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(PREFIX + id)) setShow(true);
    } catch {
      // Private browsing can throw on localStorage. Showing the hint every
      // time is a better failure than crashing the page it sits on.
      setShow(true);
    }
  }, [id]);

  if (!show) return null;

  function dismiss() {
    try { localStorage.setItem(PREFIX + id, "1"); } catch { /* noop */ }
    setShow(false);
  }

  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "12px 14px", marginBottom: 20,
        background: "var(--muted)", border: "1px solid var(--border)",
        borderRadius: 10,
      }}
    >
      <div style={{
        fontFamily: "var(--font-body)", fontSize: 13,
        color: "var(--text-reading)", lineHeight: 1.6, flex: 1, minWidth: 0,
      }}>
        {children}
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="aiml-touch-target"
        style={{
          flexShrink: 0, display: "inline-flex", alignItems: "center",
          background: "transparent", border: "none", cursor: "pointer",
          color: "var(--text-tertiary)", padding: 2,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
