"use client";

// app/ui/cookie-banner.tsx
// =============================================================================
// AI Marketing Lab — Cookie Consent Banner (UK GDPR + ePrivacy)
// =============================================================================
// We launch in the UK, where ePrivacy + UK GDPR require informed consent
// BEFORE any non-essential cookies/storage are set. Authentication cookies
// fall under "strictly necessary" and don't need consent. Anything else
// (analytics, marketing) does.
//
// Behaviour:
//   * No banner shown on /auth/* routes (we don't want it interfering with
//     login forms during testing).
//   * Banner appears once, persisting the decision in localStorage under
//     `aiml-consent-v1`. Bumping the version key resets all visitors — useful
//     when our cookie usage changes.
//   * Three buttons: Accept all · Reject non-essential · Customise.
//   * "Customise" expands the banner inline with two toggles (analytics,
//     marketing) so we don't need to ship a full preferences modal yet.
//   * Choice is broadcast as `window.dispatchEvent('aiml-consent-change')`
//     so any future analytics loader can listen and turn itself on/off.
// =============================================================================

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

const STORAGE_KEY = "aiml-consent-v1";

type Consent = {
  necessary:  true;
  analytics:  boolean;
  marketing:  boolean;
  decided_at: string;
};

function readConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Consent) : null;
  } catch {
    return null;
  }
}

function writeConsent(c: Consent) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent("aiml-consent-change", { detail: c }));
}

export function CookieBanner() {
  const pathname = usePathname();
  const [visible, setVisible]       = useState(false);
  const [expanded, setExpanded]     = useState(false);
  const [analytics, setAnalytics]   = useState(false);
  const [marketing, setMarketing]   = useState(false);

  // Decide visibility on mount. We deliberately don't render server-side to
  // keep this from flashing during SSR.
  useEffect(() => {
    if (pathname?.startsWith("/auth")) return;
    if (readConsent()) return;
    setVisible(true);
  }, [pathname]);

  if (!visible) return null;

  function decide(c: Pick<Consent, "analytics" | "marketing">) {
    writeConsent({
      necessary:  true,
      analytics:  c.analytics,
      marketing:  c.marketing,
      decided_at: new Date().toISOString(),
    });
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      style={{
        position:   "fixed",
        left:       16,
        right:      16,
        bottom:     16,
        maxWidth:   720,
        margin:     "0 auto",
        zIndex:     9999,
        background: "var(--surface)",
        border:     "1px solid var(--border-strong)",
        borderRadius: "var(--radius-2xl)",
        padding:    "20px 22px",
        boxShadow:  "var(--shadow-card-hover)",
        color:      "var(--text-primary)",
        font:       "14px/1.5 var(--font-body)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
            Cookies & your privacy
          </div>
          <div style={{ color: "var(--text-secondary)" }}>
            We use cookies that are strictly necessary for the app to function (login,
            session). With your consent, we&rsquo;d also like to use optional cookies
            to understand how the product is used so we can improve it. You can change
            your choice at any time on the{" "}
            <Link href="/privacy" style={{ color: "var(--brand)" }}>privacy page</Link>.
          </div>
        </div>

        {expanded && (
          <div
            style={{
              display:        "grid",
              gap:            10,
              padding:        "10px 12px",
              background:     "var(--surface-2)",
              borderRadius:   "var(--radius-md)",
              border:         "1px solid var(--border)",
            }}
          >
            <ToggleRow
              label="Strictly necessary"
              description="Required for login, session, and security. Cannot be turned off."
              checked
              disabled
              onChange={() => {}}
            />
            <ToggleRow
              label="Analytics"
              description="Anonymous usage data so we can see which features matter."
              checked={analytics}
              onChange={setAnalytics}
            />
            <ToggleRow
              label="Marketing"
              description="Helps us measure the impact of campaigns. Off by default."
              checked={marketing}
              onChange={setMarketing}
            />
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
          {!expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              style={btnGhost}
            >
              Customise
            </button>
          )}
          <button
            type="button"
            onClick={() => decide({ analytics: false, marketing: false })}
            style={btnGhost}
          >
            Reject non-essential
          </button>
          <button
            type="button"
            onClick={() => decide(
              expanded
                ? { analytics, marketing }
                : { analytics: true, marketing: true }
            )}
            style={btnPrimary}
          >
            {expanded ? "Save preferences" : "Accept all"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label, description, checked, disabled, onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3 }}
      />
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>{description}</span>
      </span>
    </label>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: "var(--radius-pill)",
  background: "var(--brand)",
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  padding: "9px 14px",
  borderRadius: "var(--radius-pill)",
  background: "transparent",
  color: "var(--text-primary)",
  border: "1px solid var(--border-strong)",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

// ---------------------------------------------------------------------------
// Helper for callers (e.g. settings page or analytics loader) to read current
// consent without re-implementing storage handling.
// ---------------------------------------------------------------------------
export function getCurrentConsent(): Consent | null {
  return readConsent();
}

export function resetConsent() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent("aiml-consent-change", { detail: null }));
}
