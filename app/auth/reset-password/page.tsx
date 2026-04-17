"use client";

// app/auth/reset-password/page.tsx
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

export default function ResetPasswordPage() {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) { setError("Enter a valid email address."); return; }
    setLoading(true); setError(null);
    const { error: authErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    });
    if (authErr) { setError(authErr.message); setLoading(false); return; }
    setSent(true); setLoading(false);
  }

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "40px 24px",
    }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE_EXPO }}
        style={{ width: "100%", maxWidth: "380px" }}
      >
        <Link href="/auth/login" style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          fontFamily: "var(--font-body)", fontSize: "13px",
          color: "var(--text-tertiary)", textDecoration: "none",
          marginBottom: "40px", transition: "color 0.16s",
        }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"}
        >
          <ArrowLeft size={13} /> Back to sign in
        </Link>

        {sent ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE_EXPO }}>
            <div style={{ width: "48px", height: "1px", background: "var(--signal-green)", marginBottom: "32px" }} />
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", letterSpacing: "-0.04em", lineHeight: 1, fontWeight: 400, color: "var(--text-primary)", marginBottom: "12px" }}>
              Check your email.
            </h1>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "32px" }}>
              We sent a reset link to <strong style={{ color: "var(--text-primary)", fontWeight: 500 }}>{email}</strong>. It expires in 60 minutes.
            </p>
            <Link href="/auth/login" style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-tertiary)", textDecoration: "underline", textUnderlineOffset: "3px" }}>
              Return to sign in
            </Link>
          </motion.div>
        ) : (
          <>
            <div style={{ width: "48px", height: "1px", background: "var(--brand)", marginBottom: "32px" }} />
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", letterSpacing: "-0.04em", lineHeight: 1, fontWeight: 400, color: "var(--text-primary)", marginBottom: "10px" }}>
              Reset password
            </h1>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-secondary)", marginBottom: "32px", lineHeight: 1.6 }}>
              Enter your account email and we'll send a reset link.
            </p>

            {error && (
              <div style={{ padding: "12px 14px", background: "rgba(255,23,68,0.08)", border: "1px solid rgba(255,23,68,0.20)", borderRadius: "8px", marginBottom: "20px", fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--signal-red)" }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "8px" }}>
                  Email
                </label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com" required
                  style={{ width: "100%", padding: "11px 14px", fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-primary)", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "8px", outline: "none", transition: "border-color 0.16s", boxSizing: "border-box" as const }}
                  onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
                  onBlur={e =>  e.currentTarget.style.borderColor = "var(--border-strong)"}
                />
              </div>

              <button type="submit" disabled={loading} style={{
                width: "100%", padding: "13px",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 500,
                color: "#fff", background: loading ? "var(--muted)" : "var(--brand)",
                border: "none", borderRadius: "8px",
                cursor: loading ? "not-allowed" : "pointer", transition: "opacity 0.16s",
              }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
              >
                {loading
                  ? <div style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                  : <>Send reset link <ArrowRight size={14} /></>
                }
              </button>
            </form>
          </>
        )}
      </motion.div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
