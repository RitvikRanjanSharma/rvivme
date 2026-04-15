"use client";

// app/auth/login/page.tsx
// =============================================================================
// AI Marketing Labs — Login
// Editorial minimal · No decoration · Purposeful
// =============================================================================

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";

const EASE = [0.16, 1, 0.3, 1] as const;

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <label style={{
        display:     "block",
        fontFamily:  "var(--font-mono)",
        fontSize:    "10px",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color:       "var(--text-tertiary)",
        marginBottom: "8px",
      }}>
        {label}
      </label>
      {children}
      {hint && (
        <span style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-tertiary)", marginTop: "5px", display: "block" }}>
          {hint}
        </span>
      )}
    </div>
  );
}

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirect     = searchParams.get("redirect") ?? "/dashboard";

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr) { setError(authErr.message); setLoading(false); return; }
    router.push(redirect);
  }

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?redirect=${redirect}` },
    });
    if (oauthErr) { setError(oauthErr.message); setLoading(false); }
  }

  return (
    <div style={{
      minHeight:      "100vh",
      background:     "var(--bg)",
      display:        "flex",
      alignItems:     "stretch",
    }}>
      {/* Left — branding panel */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        style={{
          flex:           "0 0 40%",
          background:     "var(--surface)",
          borderRight:    "1px solid var(--border)",
          display:        "flex",
          flexDirection:  "column",
          justifyContent: "space-between",
          padding:        "40px",
          position:       "relative",
          overflow:       "hidden",
        }}
        className="hide-mobile"
      >
        <div style={{
          position:   "absolute",
          inset:      0,
          background: "radial-gradient(ellipse 80% 60% at 20% 80%, rgba(37,99,235,0.08) 0%, transparent 60%)",
          pointerEvents: "none",
        }} />

        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 12H2L8 2Z" fill="white" fillOpacity="0.9"/>
            </svg>
          </div>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
            AI Marketing Labs
          </span>
        </Link>

        <div style={{ position: "relative", zIndex: 1 }}>
          <p style={{
            fontFamily:    "var(--font-display)",
            fontSize:      "clamp(2rem, 3vw, 3rem)",
            letterSpacing: "-0.04em",
            lineHeight:    1.05,
            color:         "var(--text-primary)",
            fontWeight:    400,
            marginBottom:  "20px",
          }}>
            Your search intelligence workspace.
          </p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.7 }}>
            GA4, Search Console, DataForSEO and AI forecasting in one place.
          </p>
        </div>

        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em", color: "var(--text-tertiary)" }}>
          aimarketinglab.co.uk
        </span>
      </motion.div>

      {/* Right — form */}
      <div style={{
        flex:           1,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        padding:        "40px 32px",
      }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}
          style={{ width: "100%", maxWidth: "380px" }}
        >
          <div style={{ marginBottom: "40px" }}>
            <h1 style={{
              fontFamily:    "var(--font-display)",
              fontSize:      "2rem",
              letterSpacing: "-0.04em",
              lineHeight:    1,
              color:         "var(--text-primary)",
              fontWeight:    400,
              marginBottom:  "10px",
            }}>
              Sign in
            </h1>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-secondary)" }}>
              No account?{" "}
              <Link href="/auth/signup" style={{ color: "var(--text-primary)", textDecoration: "underline", textUnderlineOffset: "3px" }}>
                Create one
              </Link>
            </p>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                padding:      "12px 14px",
                background:   "rgba(255,23,68,0.08)",
                border:       "1px solid rgba(255,23,68,0.20)",
                borderRadius: "8px",
                marginBottom: "20px",
                fontFamily:   "var(--font-body)",
                fontSize:     "13px",
                color:        "var(--signal-red)",
              }}
            >
              {error}
            </motion.div>
          )}

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            style={{
              width:         "100%",
              display:       "flex",
              alignItems:    "center",
              justifyContent: "center",
              gap:           "10px",
              padding:       "12px",
              background:    "var(--surface)",
              border:        "1px solid var(--border-strong)",
              borderRadius:  "8px",
              fontFamily:    "var(--font-body)",
              fontSize:      "14px",
              fontWeight:    500,
              color:         "var(--text-primary)",
              cursor:        "pointer",
              marginBottom:  "24px",
              transition:    "background 0.16s, border-color 0.16s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--text-tertiary)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)"; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
            <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>OR</span>
            <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
          </div>

          {/* Form */}
          <form onSubmit={handleLogin}>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                style={{
                  width:        "100%",
                  padding:      "11px 14px",
                  fontFamily:   "var(--font-body)",
                  fontSize:     "14px",
                  color:        "var(--text-primary)",
                  background:   "var(--surface)",
                  border:       "1px solid var(--border-strong)",
                  borderRadius: "8px",
                  outline:      "none",
                  transition:   "border-color 0.16s",
                  boxSizing:    "border-box" as const,
                }}
                onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
                onBlur={e =>  e.currentTarget.style.borderColor = "var(--border-strong)"}
              />
            </Field>

            <Field label="Password">
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••••"
                  style={{
                    width:        "100%",
                    padding:      "11px 42px 11px 14px",
                    fontFamily:   "var(--font-mono)",
                    fontSize:     "14px",
                    color:        "var(--text-primary)",
                    background:   "var(--surface)",
                    border:       "1px solid var(--border-strong)",
                    borderRadius: "8px",
                    outline:      "none",
                    transition:   "border-color 0.16s",
                    boxSizing:    "border-box" as const,
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
                  onBlur={e =>  e.currentTarget.style.borderColor = "var(--border-strong)"}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex" }}
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <Link href="/auth/reset-password" style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-tertiary)", textDecoration: "none", float: "right", marginTop: "6px", transition: "color 0.16s" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"}
              >
                Forgot password?
              </Link>
            </Field>

            <button
              type="submit"
              disabled={loading}
              style={{
                width:        "100%",
                padding:      "13px",
                display:      "flex",
                alignItems:   "center",
                justifyContent: "center",
                gap:          "8px",
                fontFamily:   "var(--font-body)",
                fontSize:     "14px",
                fontWeight:   500,
                color:        "#fff",
                background:   loading ? "var(--muted)" : "var(--brand)",
                border:       "none",
                borderRadius: "8px",
                cursor:       loading ? "not-allowed" : "pointer",
                marginTop:    "8px",
                transition:   "opacity 0.16s",
              }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            >
              {loading
                ? <div style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                : <>Sign in <ArrowRight size={14} /></>
              }
            </button>
          </form>
        </motion.div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg)" }} />}>
      <LoginForm />
    </Suspense>
  );
}
