"use client";

// app/auth/signup/page.tsx
// =============================================================================
// AI Marketing Labs — Signup Page
// Email + password with company name + website URL captured at registration.
// These are passed as user_metadata and picked up by the DB trigger.
// =============================================================================

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Zap, Mail, Lock, Eye, EyeOff, AlertCircle, Building2, Globe } from "lucide-react";
import { supabase } from "@/lib/supabase";

const SPRING = { type: "spring", stiffness: 260, damping: 28, mass: 0.9 } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <label style={{ display: "block", fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const brandColor = "#3b82f6";

  const [companyName, setCompanyName] = useState("");
  const [websiteUrl,  setWebsiteUrl]  = useState("https://");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [showPw,      setShowPw]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState(false);

  function validate(): string | null {
    if (!companyName.trim()) return "Company name is required.";
    if (!/^https?:\/\/.+/.test(websiteUrl)) return "Please enter a valid URL starting with https://";
    if (!email.includes("@")) return "Please enter a valid email address.";
    if (password.length < 12) return "Password must be at least 12 characters.";
    if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter.";
    if (!/[0-9]/.test(password)) return "Password must include at least one number.";
    return null;
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          company_name: companyName.trim(),
          website_url:  websiteUrl.trim(),
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
  }

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...SPRING }}
          style={{ maxWidth: "400px", textAlign: "center" }}
        >
          <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "rgba(0,230,118,0.12)", border: "1px solid rgba(0,230,118,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <Zap size={24} color="var(--signal-green)" />
          </div>
          <h2 style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "22px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.025em", marginBottom: "10px" }}>
            Check your email
          </h2>
          <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.7 }}>
            We sent a verification link to <strong style={{ color: "var(--text-primary)" }}>{email}</strong>. Click it to activate your RVIVME account and access the platform.
          </p>
          <Link href="/auth/login" style={{ display: "inline-block", marginTop: "24px", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: brandColor, textDecoration: "none", fontWeight: 600 }}>
            Back to login
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "-20%", left: "50%", transform: "translateX(-50%)", width: "600px", height: "400px", background: `radial-gradient(ellipse, rgba(var(--brand-rgb), 0.08) 0%, transparent 70%)`, pointerEvents: "none" }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.1 }}
        style={{ width: "100%", maxWidth: "440px", position: "relative" }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <Link href="/" style={{ textDecoration: "none", display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 55%, #000))`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px var(--brand-glow)" }}>
              <Zap size={20} color="#fff" strokeWidth={2.5} />
            </div>
            <span style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "22px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.025em" }}>
              RV<span style={{ color: brandColor }}>IVM</span>E
            </span>
          </Link>
          <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "14px", color: "var(--text-secondary)", marginTop: "8px" }}>
            Create your intelligence platform account
          </p>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "28px" }}>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "rgba(255,23,68,0.08)", border: "1px solid rgba(255,23,68,0.25)", borderRadius: "8px", marginBottom: "20px" }}
            >
              <AlertCircle size={13} color="var(--signal-red)" />
              <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--signal-red)" }}>{error}</span>
            </motion.div>
          )}

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "10px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", cursor: "pointer", marginBottom: "16px", transition: "border-color 0.18s, background 0.18s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = brandColor; (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.background = "var(--card)"; }}
          >
            <Globe size={15} /> Continue with Google
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
            <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>OR</span>
            <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
          </div>

          <form onSubmit={handleSignup}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
              <Field label="Company Name">
                <div style={{ position: "relative" }}>
                  <Building2 size={13} color="var(--text-tertiary)" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                  <input
                    value={companyName} onChange={e => setCompanyName(e.target.value)} required placeholder="Acme Corp"
                    style={{ width: "100%", padding: "9px 12px 9px 34px", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--text-primary)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "7px", outline: "none", boxSizing: "border-box", transition: "border-color 0.18s" }}
                    onFocus={e => (e.currentTarget.style.borderColor = brandColor)}
                    onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
                  />
                </div>
              </Field>
              <Field label="Website URL">
                <div style={{ position: "relative" }}>
                  <Globe size={13} color="var(--text-tertiary)" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                  <input
                    value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} required placeholder="https://acme.com"
                    style={{ width: "100%", padding: "9px 12px 9px 34px", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--text-primary)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "7px", outline: "none", boxSizing: "border-box", transition: "border-color 0.18s" }}
                    onFocus={e => (e.currentTarget.style.borderColor = brandColor)}
                    onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
                  />
                </div>
              </Field>
            </div>

            <Field label="Email Address">
              <div style={{ position: "relative" }}>
                <Mail size={13} color="var(--text-tertiary)" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="admin@acme.com"
                  style={{ width: "100%", padding: "9px 12px 9px 34px", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--text-primary)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "7px", outline: "none", boxSizing: "border-box", transition: "border-color 0.18s" }}
                  onFocus={e => (e.currentTarget.style.borderColor = brandColor)}
                  onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
                />
              </div>
            </Field>

            <Field label="Password">
              <div style={{ position: "relative" }}>
                <Lock size={13} color="var(--text-tertiary)" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input
                  type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required placeholder="Min. 12 chars, uppercase + number"
                  style={{ width: "100%", padding: "9px 38px 9px 34px", fontFamily: "var(--font-dm-mono), monospace", fontSize: "13px", color: "var(--text-primary)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "7px", outline: "none", boxSizing: "border-box", transition: "border-color 0.18s" }}
                  onFocus={e => (e.currentTarget.style.borderColor = brandColor)}
                  onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
                />
                <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex", alignItems: "center" }}>
                  {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "11px", color: "var(--text-tertiary)", marginTop: "5px" }}>
                Minimum 12 characters · 1 uppercase · 1 number
              </div>
            </Field>

            <button
              type="submit" disabled={loading}
              style={{ width: "100%", padding: "11px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontFamily: "var(--font-inter), sans-serif", fontSize: "14px", fontWeight: 700, color: "#fff", background: loading ? "var(--muted)" : `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 60%, #000))`, border: "none", borderRadius: "8px", cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? "none" : "0 0 20px var(--brand-glow)", transition: "all 0.25s" }}
            >
              {loading ? (
                <div style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              ) : (
                <><Zap size={14} strokeWidth={2.5} /> Create Account</>
              )}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--text-tertiary)", marginTop: "20px" }}>
          Already have an account?{" "}
          <Link href="/auth/login" style={{ color: brandColor, textDecoration: "none", fontWeight: 600 }}>Sign in</Link>
        </p>
      </motion.div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
