"use client";

// app/auth/signup/page.tsx
// =============================================================================
// AI Marketing Lab — Signup
// Editorial minimal · Same visual language as login
// =============================================================================

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const EASE = [0.16, 1, 0.3, 1] as const;

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "8px" }}>
        {label}
      </label>
      {children}
      {hint && <span style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-tertiary)", marginTop: "5px", display: "block" }}>{hint}</span>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: "100%", padding: "11px 14px", fontFamily: type === "password" ? "var(--font-mono)" : "var(--font-body)", fontSize: "14px", color: "var(--text-primary)", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "8px", outline: "none", transition: "border-color 0.16s", boxSizing: "border-box" as const }}
      onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
      onBlur={e =>  e.currentTarget.style.borderColor = "var(--border-strong)"}
    />
  );
}

export default function SignupPage() {
  const [company,  setCompany]  = useState("");
  const [website,  setWebsite]  = useState("https://");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);

  function validate(): string | null {
    if (!company.trim())                   return "Company name is required.";
    if (!/^https?:\/\/.+/.test(website))   return "Enter a valid URL starting with https://";
    if (!email.includes("@"))              return "Enter a valid email address.";
    if (password.length < 12)             return "Password must be at least 12 characters.";
    if (!/[A-Z]/.test(password))          return "Password must include at least one uppercase letter.";
    if (!/[0-9]/.test(password))          return "Password must include at least one number.";
    return null;
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    setError(null);
    if (!isSupabaseConfigured) {
      setError(
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, then restart the dev server."
      );
      setLoading(false);
      return;
    }
    const { error: authErr } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { company_name: company.trim(), website_url: website.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (authErr) { setError(authErr.message); setLoading(false); return; }
    setSuccess(true);
  }

  async function handleGoogle() {
    setLoading(true);
    if (!isSupabaseConfigured) {
      setError("Supabase is not configured. Fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
      setLoading(false);
      return;
    }
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:  `${window.location.origin}/auth/callback`,
        // Force the Google account chooser every time so a previously-signed-in
        // browser session doesn't silently auto-sign the user in.
        queryParams: { prompt: "select_account", access_type: "offline" },
      },
    });
    if (oauthErr) { setError(oauthErr.message); setLoading(false); }
  }

  if (success) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }} style={{ maxWidth: "400px", textAlign: "center" }}>
          <div style={{ width: "48px", height: "1px", background: "var(--brand)", margin: "0 auto 32px" }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "2.4rem", letterSpacing: "-0.04em", lineHeight: 1, fontWeight: 400, color: "var(--text-primary)", marginBottom: "16px" }}>
            Check your inbox.
          </h2>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "32px" }}>
            We sent a verification link to <strong style={{ color: "var(--text-primary)", fontWeight: 500 }}>{email}</strong>. Click it to activate your account.
          </p>
          <Link href="/auth/login" style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-tertiary)", textDecoration: "underline", textUnderlineOffset: "3px" }}>
            Back to sign in
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "stretch" }}>
      {/* Left panel */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        style={{ flex: "0 0 40%", background: "var(--surface)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "40px", position: "relative", overflow: "hidden" }}
        className="hide-mobile"
      >
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 80% 20%, rgba(37,99,235,0.08) 0%, transparent 60%)", pointerEvents: "none" }} />

        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2L14 12H2L8 2Z" fill="white" fillOpacity="0.9"/></svg>
          </div>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>AI Marketing Lab</span>
        </Link>

        <div style={{ position: "relative", zIndex: 1 }}>
          <p style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem, 2.5vw, 2.6rem)", letterSpacing: "-0.04em", lineHeight: 1.05, color: "var(--text-primary)", fontWeight: 400, marginBottom: "20px" }}>
            Intelligence from day one.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {["Real GA4 traffic data", "Search Console integration", "AI 6-month forecast", "GEO citation tracking"].map(item => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--brand)", flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-secondary)" }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em", color: "var(--text-tertiary)" }}>aimarketinglab.co.uk</span>
      </motion.div>

      {/* Right — form */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 32px" }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}
          style={{ width: "100%", maxWidth: "400px" }}
        >
          <div style={{ marginBottom: "36px" }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", letterSpacing: "-0.04em", lineHeight: 1, color: "var(--text-primary)", fontWeight: 400, marginBottom: "10px" }}>
              Create account
            </h1>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-secondary)" }}>
              Already have one?{" "}
              <Link href="/auth/login" style={{ color: "var(--text-primary)", textDecoration: "underline", textUnderlineOffset: "3px" }}>Sign in</Link>
            </p>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              style={{ padding: "12px 14px", background: "rgba(255,23,68,0.08)", border: "1px solid rgba(255,23,68,0.20)", borderRadius: "8px", marginBottom: "20px", fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--signal-red)" }}
            >
              {error}
            </motion.div>
          )}

          {/* Google */}
          <button onClick={handleGoogle} disabled={loading}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", padding: "12px", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "8px", fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 500, color: "var(--text-primary)", cursor: "pointer", marginBottom: "24px", transition: "background 0.16s" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "var(--surface)"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
            <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>OR</span>
            <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
          </div>

          <form onSubmit={handleSignup}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
              <Field label="Company">
                <TextInput value={company} onChange={setCompany} placeholder="Acme Ltd" />
              </Field>
              <Field label="Website">
                <TextInput value={website} onChange={setWebsite} placeholder="https://acme.com" />
              </Field>
            </div>
            <Field label="Email">
              <TextInput type="email" value={email} onChange={setEmail} placeholder="you@company.com" />
            </Field>
            <Field label="Password" hint="12+ characters · 1 uppercase · 1 number">
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••••"
                  style={{ width: "100%", padding: "11px 42px 11px 14px", fontFamily: "var(--font-mono)", fontSize: "14px", color: "var(--text-primary)", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "8px", outline: "none", transition: "border-color 0.16s", boxSizing: "border-box" as const }}
                  onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
                  onBlur={e =>  e.currentTarget.style.borderColor = "var(--border-strong)"}
                />
                <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex" }}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </Field>

            <button type="submit" disabled={loading}
              style={{ width: "100%", padding: "13px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 500, color: "#fff", background: loading ? "var(--muted)" : "var(--brand)", border: "none", borderRadius: "8px", cursor: loading ? "not-allowed" : "pointer", marginTop: "4px", transition: "opacity 0.16s" }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            >
              {loading
                ? <div style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                : <>Create account <ArrowRight size={14} /></>
              }
            </button>
          </form>
        </motion.div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
