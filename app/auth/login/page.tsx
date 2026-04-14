"use client";

// app/auth/login/page.tsx
// =============================================================================
// AI Marketing Labs — Login Page
// Email + password · Google OAuth · Redirect-aware · Error states
// =============================================================================

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Zap, Mail, Lock, Eye, EyeOff, AlertCircle, Globe } from "lucide-react";
import { supabase } from "@/lib/supabase";

const SPRING = { type: "spring", stiffness: 260, damping: 28, mass: 0.9 } as const;

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirect     = searchParams.get("redirect") ?? "/dashboard";

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [brandColor] = useState("#3b82f6");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push(redirect);
  }

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?redirect=${redirect}` },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight:      "100vh",
      background:     "var(--bg)",
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
      padding:        "24px",
      position:       "relative",
      overflow:       "hidden",
    }}>
      {/* Ambient glow */}
      <div style={{
        position:    "absolute",
        top:         "-20%",
        left:        "50%",
        transform:   "translateX(-50%)",
        width:       "600px",
        height:      "400px",
        background:  `radial-gradient(ellipse, rgba(var(--brand-rgb), 0.08) 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.1 }}
        style={{
          width:        "100%",
          maxWidth:     "420px",
          position:     "relative",
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <Link href="/" style={{ textDecoration: "none", display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <div style={{
              width:        "44px",
              height:       "44px",
              borderRadius: "12px",
              background:   `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 55%, #000))`,
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              boxShadow:    "0 0 20px var(--brand-glow)",
            }}>
              <Zap size={20} color="#fff" strokeWidth={2.5} />
            </div>
            <span style={{
              fontFamily:    "var(--font-syne), sans-serif",
              fontSize:      "22px",
              fontWeight:    800,
              color:         "var(--text-primary)",
              letterSpacing: "-0.025em",
            }}>
              AI <span style={{ color: brandColor }}>Marketing</span> Labs
            </span>
          </Link>
          <p style={{
            fontFamily:  "var(--font-inter), sans-serif",
            fontSize:    "14px",
            color:       "var(--text-secondary)",
            marginTop:   "8px",
          }}>
            Sign in to your intelligence platform
          </p>
        </div>

        {/* Card */}
        <div style={{
          background:   "var(--surface)",
          border:       "1px solid var(--border)",
          borderRadius: "14px",
          padding:      "28px",
        }}>
          {/* Error banner */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          "8px",
                padding:      "10px 14px",
                background:   "rgba(255,23,68,0.08)",
                border:       "1px solid rgba(255,23,68,0.25)",
                borderRadius: "8px",
                marginBottom: "20px",
              }}
            >
              <AlertCircle size={13} color="var(--signal-red)" />
              <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--signal-red)" }}>
                {error}
              </span>
            </motion.div>
          )}

          {/* Google OAuth */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            style={{
              width:        "100%",
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              gap:          "8px",
              padding:      "10px",
              background:   "var(--card)",
              border:       "1px solid var(--border)",
              borderRadius: "8px",
              fontFamily:   "var(--font-inter), sans-serif",
              fontSize:     "13px",
              fontWeight:   600,
              color:        "var(--text-primary)",
              cursor:       "pointer",
              marginBottom: "16px",
              transition:   "border-color 0.18s, background 0.18s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = brandColor;
              (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLElement).style.background = "var(--card)";
            }}
          >
            <Globe size={15} />
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
            <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>OR</span>
            <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
          </div>

          {/* Form */}
          <form onSubmit={handleLogin}>
            {/* Email */}
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                Email Address
              </label>
              <div style={{ position: "relative" }}>
                <Mail size={13} color="var(--text-tertiary)" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="admin@yourcompany.com"
                  style={{
                    width:      "100%",
                    padding:    "9px 12px 9px 34px",
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize:   "13px",
                    color:      "var(--text-primary)",
                    background: "var(--card)",
                    border:     "1px solid var(--border)",
                    borderRadius: "7px",
                    outline:    "none",
                    transition: "border-color 0.18s",
                    boxSizing:  "border-box",
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = brandColor)}
                  onBlur={e =>  (e.currentTarget.style.borderColor = "var(--border)")}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <label style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Password
                </label>
                <Link href="/auth/reset-password" style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "11px", color: brandColor, textDecoration: "none" }}>
                  Forgot password?
                </Link>
              </div>
              <div style={{ position: "relative" }}>
                <Lock size={13} color="var(--text-tertiary)" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••••"
                  style={{
                    width:      "100%",
                    padding:    "9px 38px 9px 34px",
                    fontFamily: "var(--font-dm-mono), monospace",
                    fontSize:   "14px",
                    color:      "var(--text-primary)",
                    background: "var(--card)",
                    border:     "1px solid var(--border)",
                    borderRadius: "7px",
                    outline:    "none",
                    transition: "border-color 0.18s",
                    boxSizing:  "border-box",
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = brandColor)}
                  onBlur={e =>  (e.currentTarget.style.borderColor = "var(--border)")}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex", alignItems: "center" }}
                >
                  {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width:        "100%",
                padding:      "11px",
                display:      "flex",
                alignItems:   "center",
                justifyContent: "center",
                gap:          "6px",
                fontFamily:   "var(--font-inter), sans-serif",
                fontSize:     "14px",
                fontWeight:   700,
                color:        "#fff",
                background:   loading
                  ? "var(--muted)"
                  : `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 60%, #000))`,
                border:       "none",
                borderRadius: "8px",
                cursor:       loading ? "not-allowed" : "pointer",
                boxShadow:    loading ? "none" : "0 0 20px var(--brand-glow)",
                transition:   "all 0.25s",
              }}
            >
              {loading ? (
                <div style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              ) : (
                <>
                  <Zap size={14} strokeWidth={2.5} />
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--text-tertiary)", marginTop: "20px" }}>
          No account?{" "}
          <Link href="/auth/signup" style={{ color: brandColor, textDecoration: "none", fontWeight: 600 }}>
            Create one free
          </Link>
        </p>
      </motion.div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}