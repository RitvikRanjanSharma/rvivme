"use client";

// app/auth/signout/page.tsx
// =============================================================================
// Sign out flow.
// =============================================================================
// Crucial: localStorage is scoped to the *browser origin*, not to the user.
// If we don't scrub it here, the next user to log in on this browser sees the
// previous user's cached domain, brand colour, content drafts, etc.
// =============================================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// All localStorage keys the app writes. If you add a new one, add it here.
const USER_SCOPED_KEYS = [
  "aiml-domain",
  "aiml-brand",
  "rvivme-brand",
  // Content editor drafts that persist between reloads
  "aiml-content-draft",
  // Anything future we prefix with these — wildcard handling below.
];

function clearUserScopedStorage() {
  if (typeof window === "undefined") return;
  try {
    // Pass 1 — exact keys we know about.
    for (const k of USER_SCOPED_KEYS) localStorage.removeItem(k);

    // Pass 2 — any aiml-* or rvivme-* prefixed keys we added since (e.g. per-
    // strategy drafts). Belt and braces: we'd rather wipe a bit extra than
    // leak one user's data into another session.
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("aiml-") || k.startsWith("rvivme-"))) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);

    // sessionStorage uses the same scope rule, so scrub it too.
    sessionStorage.clear();
  } catch {
    /* storage may be disabled in private mode — nothing to do */
  }
}

export default function SignOutPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      // Supabase clears its own auth cookies; we clear the *app* caches.
      try { await supabase.auth.signOut(); } catch { /* already signed out */ }
      clearUserScopedStorage();
      router.push("/auth/login");
    })();
  }, [router]);

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: "20px",
    }}>
      <div style={{
        width: "36px", height: "36px", borderRadius: "8px",
        background: "var(--brand)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2L14 12H2L8 2Z" fill="white" fillOpacity="0.9"/>
        </svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
        <div style={{
          width: "20px", height: "20px",
          border: "2px solid var(--border)",
          borderTopColor: "var(--brand)",
          borderRadius: "50%",
          animation: "spin 0.7s linear infinite",
        }} />
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: "11px",
          letterSpacing: "0.12em", textTransform: "uppercase",
          color: "var(--text-tertiary)",
        }}>
          Signing out
        </span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
