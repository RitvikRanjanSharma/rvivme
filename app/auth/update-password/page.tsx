"use client";

// app/auth/update-password/page.tsx
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

export default function UpdatePasswordPage() {
  const router    = useRouter();
  const [pw,      setPw]      = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw,  setShowPw]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 12) { setError("Password must be at least 12 characters."); return; }
    if (pw !== confirm)  { setError("Passwords do not match."); return; }
    setLoading(true); setError(null);
    const { error: authErr } = await supabase.auth.updateUser({ password: pw });
    if (authErr) { setError(authErr.message); setLoading(false); return; }
    router.push("/dashboard");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE_EXPO }}
        style={{ width: "100%", maxWidth: "380px" }}
      >
        <div style={{ width: "48px", height: "1px", background: "var(--brand)", marginBottom: "32px" }} />
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", letterSpacing: "-0.04em", lineHeight: 1, fontWeight: 400, color: "var(--text-primary)", marginBottom: "10px" }}>
          New password
        </h1>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-secondary)", marginBottom: "32px" }}>
          12+ characters required.
        </p>

        {error && (
          <div style={{ padding: "12px 14px", background: "rgba(255,23,68,0.08)", border: "1px solid rgba(255,23,68,0.20)", borderRadius: "8px", marginBottom: "20px", fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--signal-red)" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {[
            { label: "New Password", val: pw, set: setPw },
            { label: "Confirm Password", val: confirm, set: setConfirm },
          ].map(({ label, val, set }) => (
            <div key={label} style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "8px" }}>{label}</label>
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} value={val} onChange={e => set(e.target.value)} required
                  style={{ width: "100%", padding: "11px 42px 11px 14px", fontFamily: "var(--font-mono)", fontSize: "14px", color: "var(--text-primary)", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "8px", outline: "none", transition: "border-color 0.16s", boxSizing: "border-box" as const }}
                  onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
                  onBlur={e =>  e.currentTarget.style.borderColor = "var(--border-strong)"}
                />
                {label === "New Password" && (
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex" }}
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </div>
            </div>
          ))}

          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "13px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 500,
            color: "#fff", background: loading ? "var(--muted)" : "var(--brand)",
            border: "none", borderRadius: "8px", cursor: loading ? "not-allowed" : "pointer", transition: "opacity 0.16s",
          }}>
            {loading
              ? <div style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              : <>Update password <ArrowRight size={14} /></>
            }
          </button>
        </form>
      </motion.div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
