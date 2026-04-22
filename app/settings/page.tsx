"use client";

// app/settings/page.tsx
// =============================================================================
// AI Marketing Lab — Settings
// Profile saves to Supabase · Branding persisted · AI Marketing Lab brand
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Palette, Plug, CreditCard, Shield, Database,
  CheckCircle2, AlertCircle, Save, RefreshCw,
  Globe2, BarChart3, Cpu, Trash2, Eye, EyeOff, Brain,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

type TabId = "profile" | "branding" | "integrations" | "billing" | "security";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "profile",      label: "Profile",          icon: User      },
  { id: "branding",     label: "Branding",          icon: Palette   },
  { id: "integrations", label: "Integrations",      icon: Plug      },
  { id: "billing",      label: "Billing",           icon: CreditCard},
  { id: "security",     label: "Security",          icon: Shield    },
];

const BRAND_PRESETS = [
  "#2563eb","#7c3aed","#db2777","#ea580c",
  "#16a34a","#dc2626","#d97706","#0891b2",
];

const EASE = [0.16, 1, 0.3, 1] as const;
function pv(delay = 0) {
  return {
    hidden:  { opacity: 0, y: 14 },
    visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 30, delay } },
  };
}

function hexToRgb(hex: string) {
  const c = hex.replace("#","");
  return `${parseInt(c.slice(0,2),16)}, ${parseInt(c.slice(2,4),16)}, ${parseInt(c.slice(4,6),16)}`;
}

// ── UI primitives ─────────────────────────────────────────────────────────────
function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", ...style }}>{children}</div>;
}
function PH({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
      <div style={{ fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: subtitle ? "3px" : 0 }}>{title}</div>
      {subtitle && <div style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-tertiary)" }}>{subtitle}</div>}
    </div>
  );
}
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "7px" }}>{label}</label>
      {children}
      {hint && <div style={{ fontFamily: "var(--font-body)", fontSize: "11px", color: "var(--text-tertiary)", marginTop: "5px" }}>{hint}</div>}
    </div>
  );
}
function TextInput({ value, onChange, placeholder, type="text", disabled }: { value: string; onChange: (v:string)=>void; placeholder?: string; type?: string; disabled?: boolean }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
      style={{ width: "100%", padding: "10px 13px", fontFamily: "var(--font-body)", fontSize: "13px", color: disabled ? "var(--text-tertiary)" : "var(--text-primary)", background: disabled ? "var(--muted)" : "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", outline: "none", transition: "border-color 0.16s", boxSizing: "border-box" as const, cursor: disabled ? "not-allowed" : "text" }}
      onFocus={e => { if (!disabled) e.currentTarget.style.borderColor = "var(--brand)"; }}
      onBlur={e =>  { e.currentTarget.style.borderColor = "var(--border)"; }}
    />
  );
}
function SaveBtn({ brandColor, onClick, loading, saved, label="Save changes" }: { brandColor: string; onClick?: ()=>void; loading?: boolean; saved?: boolean; label?: string }) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      display: "inline-flex", alignItems: "center", gap: "7px",
      fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
      color: "#fff",
      background: saved ? "#16a34a" : loading ? "var(--muted)" : brandColor,
      border: "none", borderRadius: "8px", padding: "10px 20px",
      cursor: loading ? "not-allowed" : "pointer", transition: "opacity 0.16s, background 0.3s",
    }}
      onMouseEnter={e => { if (!loading && !saved) (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
    >
      {loading ? <div style={{ width: "12px", height: "12px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        : saved ? <CheckCircle2 size={13} /> : <Save size={13} />}
      {saved ? "Saved" : label}
    </button>
  );
}

// ── Profile tab ───────────────────────────────────────────────────────────────
function ProfileTab({ brandColor }: { brandColor: string }) {
  const [company,  setCompany]  = useState("");
  const [website,  setWebsite]  = useState("");
  const [email,    setEmail]    = useState("");
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState<string|null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      const { data } = await supabase.from("users").select("company_name, website_url").eq("id", user.id).single();
      const row = data as { company_name: string; website_url: string } | null;
      if (row) { setCompany(row.company_name ?? ""); setWebsite(row.website_url ?? ""); }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error: dbErr } = await supabase.from("users").update({
      company_name: company.trim(),
      website_url:  website.trim(),
    } as never).eq("id", user.id);
    if (dbErr) { setError(dbErr.message); setSaving(false); return; }
    // Update localStorage fallback domain
    if (typeof window !== "undefined") {
      localStorage.setItem("aiml-domain", website.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, ""));
    }
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <motion.div variants={pv(0.1)} initial="hidden" animate="visible">
        <Panel>
          <PH title="Organisation Profile" subtitle="Used across all reports, exports, and API calls." />
          <div style={{ padding: "22px" }}>
            {error && <div style={{ padding: "10px 14px", background: "rgba(255,23,68,0.08)", border: "1px solid rgba(255,23,68,0.20)", borderRadius: "7px", marginBottom: "16px", fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--signal-red)" }}>{error}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
              <Field label="Company Name">
                <TextInput value={company} onChange={setCompany} placeholder="AI Marketing Lab" disabled={loading} />
              </Field>
              <Field label="Email Address">
                <TextInput value={email} onChange={setEmail} placeholder="admin@company.com" type="email" disabled={true} />
              </Field>
              <Field label="Primary Website URL" hint="Used for keyword and competitor analysis.">
                <TextInput value={website} onChange={setWebsite} placeholder="https://yourwebsite.com" disabled={loading} />
              </Field>
            </div>
            <SaveBtn brandColor={brandColor} onClick={handleSave} loading={saving} saved={saved} />
          </div>
        </Panel>
      </motion.div>

      <motion.div variants={pv(0.18)} initial="hidden" animate="visible">
        <Panel>
          <PH title="Danger Zone" subtitle="Irreversible account operations." />
          <div style={{ padding: "22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>Delete Account</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-tertiary)" }}>Permanently deletes all data. This cannot be undone.</div>
            </div>
            <button style={{ display: "flex", alignItems: "center", gap: "5px", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 500, color: "var(--signal-red)", background: "rgba(255,23,68,0.08)", border: "1px solid rgba(255,23,68,0.25)", borderRadius: "7px", padding: "8px 14px", cursor: "pointer" }}>
              <Trash2 size={12} /> Delete Account
            </button>
          </div>
        </Panel>
      </motion.div>
    </div>
  );
}

// ── Branding tab ──────────────────────────────────────────────────────────────
function BrandingTab({ brandColor, onBrandChange }: { brandColor: string; onBrandChange: (hex: string) => void }) {
  const [hex,     setHex]     = useState(brandColor);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  function apply(color: string) {
    const clean = color.startsWith("#") ? color : `#${color}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(clean)) { setHex(clean); onBrandChange(clean); }
  }

  async function handleSave() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("users").update({ primary_color_hex: hex } as never).eq("id", user.id);
    }
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <motion.div variants={pv(0.1)} initial="hidden" animate="visible">
        <Panel>
          <PH title="Brand Colour" subtitle="Sets the primary accent across charts, buttons, and active states." />
          <div style={{ padding: "22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "16px 20px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", marginBottom: "22px" }}>
              <div style={{ width: "52px", height: "52px", borderRadius: "12px", background: hex, boxShadow: `0 0 20px rgba(${hexToRgb(hex)},0.4)`, flexShrink: 0, transition: "background 0.2s" }} />
              <div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>Current Brand Colour</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: hex }}>{hex.toUpperCase()}</div>
              </div>
            </div>

            <Field label="Colour Presets">
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {BRAND_PRESETS.map(p => (
                  <button key={p} onClick={() => apply(p)}
                    style={{ width: "32px", height: "32px", borderRadius: "8px", background: p, border: `2px solid ${hex === p ? "var(--text-primary)" : "transparent"}`, cursor: "pointer", transition: "transform 0.15s" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = "scale(1.12)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = "scale(1)"}
                  />
                ))}
              </div>
            </Field>

            <Field label="Custom Hex">
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "7px", background: hex, flexShrink: 0, border: "1px solid var(--border)" }} />
                <TextInput value={hex} onChange={apply} placeholder="#2563eb" />
              </div>
            </Field>

            <SaveBtn brandColor={brandColor} onClick={handleSave} loading={saving} saved={saved} label="Apply Brand Colour" />
          </div>
        </Panel>
      </motion.div>
    </div>
  );
}

// ── Integrations tab ──────────────────────────────────────────────────────────
type IntgStatus = "connected" | "disconnected" | "error" | "checking";

function IntegrationsTab({ brandColor }: { brandColor: string }) {
  // Keep the note text deterministic on first render — only fill in the domain
  // after mount. Otherwise the server (no localStorage) and client (has
  // localStorage) produce different HTML and React throws a hydration error.
  const [domain,  setDomain]  = useState("aimarketinglab.co.uk");
  const [ga4St,   setGa4St]   = useState<IntgStatus>("checking");
  const [gscSt,   setGscSt]   = useState<IntgStatus>("checking");
  const [dfsSt,   setDfsSt]   = useState<IntgStatus>("checking");
  const [antSt,   setAntSt]   = useState<IntgStatus>("checking");

  useEffect(() => {
    const d = localStorage.getItem("aiml-domain");
    if (d) setDomain(d);
  }, []);

  // Real connection state — one lightweight server call that only checks
  // whether the required credentials are present. Never hits the downstream
  // APIs, so it's fast and safe to run on every mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/integrations/status");
        if (!alive) return;
        if (!r.ok) {
          setGa4St("error"); setGscSt("error"); setDfsSt("error"); setAntSt("error");
          return;
        }
        const d = await r.json();
        setGa4St(d.ga4        === "connected" ? "connected" : "disconnected");
        setGscSt(d.gsc        === "connected" ? "connected" : "disconnected");
        setDfsSt(d.dataforseo === "connected" ? "connected" : "disconnected");
        setAntSt(d.anthropic  === "connected" ? "connected" : "disconnected");
      } catch {
        if (!alive) return;
        setGa4St("error"); setGscSt("error"); setDfsSt("error"); setAntSt("error");
      }
    })();
    return () => { alive = false; };
  }, []);

  const integrations = [
    { id: "anthropic",  name: "Anthropic (Claude)",      desc: "AI strategy generation, citation tracking",   icon: Brain,    status: antSt, note: "ANTHROPIC_API_KEY in server env" },
    { id: "ga4",        name: "Google Analytics 4",      desc: "Traffic, sessions, and user behaviour data",  icon: BarChart3, status: ga4St, note: "Service account via GA4 Data API" },
    { id: "gsc",        name: "Google Search Console",   desc: "Impressions, clicks, positions, CTR",         icon: Globe2,   status: gscSt, note: `sc-domain:${domain}` },
    { id: "dataforseo", name: "DataForSEO",              desc: "Keywords, SERP, backlinks, AI Overviews",     icon: Cpu,      status: dfsSt, note: "UK (2826) · Standard plan" },
  ] as const;

  const statusCfg: Record<IntgStatus, { label: string; color: string; bg: string }> = {
    connected:    { label: "Connected",    color: "var(--signal-green)", bg: "rgba(0,230,118,0.08)"  },
    disconnected: { label: "Disconnected", color: "var(--text-tertiary)", bg: "var(--card)"          },
    error:        { label: "Error",        color: "var(--signal-red)",   bg: "rgba(255,23,68,0.08)" },
    checking:     { label: "Checking…",    color: "var(--text-tertiary)", bg: "var(--card)"          },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {integrations.map((intg, i) => {
        const Icon = intg.icon;
        const sc = statusCfg[intg.status];
        return (
          <motion.div key={intg.id} variants={pv(0.08 + i * 0.07)} initial="hidden" animate="visible">
            <Panel style={{ padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1, minWidth: 0 }}>
                  <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: `rgba(var(--brand-rgb),0.08)`, border: `1px solid rgba(var(--brand-rgb),0.20)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={18} color={brandColor} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{intg.name}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: sc.color, background: sc.bg, border: `1px solid ${sc.color}30`, padding: "2px 8px", borderRadius: "100px", letterSpacing: "0.08em", textTransform: "uppercase" }}>{sc.label}</span>
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-secondary)", marginBottom: "3px" }}>{intg.desc}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>{intg.note}</div>
                  </div>
                </div>
                <button style={{ display: "flex", alignItems: "center", gap: "4px", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "6px", padding: "6px 10px", cursor: "pointer", letterSpacing: "0.06em", flexShrink: 0 }}>
                  <RefreshCw size={10} /> SYNC
                </button>
              </div>
            </Panel>
          </motion.div>
        );
      })}

      <motion.div variants={pv(0.3)} initial="hidden" animate="visible">
        <div style={{ padding: "16px 20px", background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "12px" }}>
          <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "4px" }}>
            To connect or reconfigure integrations, update the environment variables in your Vercel dashboard and redeploy.
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
            GA4_SERVICE_ACCOUNT_KEY · GA4_PROPERTY_ID · GSC_SITE_URL · DATAFORSEO_LOGIN · DATAFORSEO_PASSWORD
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Security tab ──────────────────────────────────────────────────────────────
function SecurityTab({ brandColor }: { brandColor: string }) {
  const [current, setCurrent] = useState("");
  const [pw,      setPw]      = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw,  setShowPw]  = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string|null>(null);

  async function handleSave() {
    if (pw.length < 12) { setError("Password must be at least 12 characters."); return; }
    if (pw !== confirm)  { setError("Passwords do not match."); return; }
    setSaving(true); setError(null);
    const { error: authErr } = await supabase.auth.updateUser({ password: pw });
    if (authErr) { setError(authErr.message); setSaving(false); return; }
    setSaving(false); setSaved(true); setPw(""); setConfirm(""); setCurrent("");
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <motion.div variants={pv(0.1)} initial="hidden" animate="visible">
        <Panel>
          <PH title="Change Password" subtitle="Minimum 12 characters." />
          <div style={{ padding: "22px" }}>
            {error && <div style={{ padding: "10px 14px", background: "rgba(255,23,68,0.08)", border: "1px solid rgba(255,23,68,0.20)", borderRadius: "7px", marginBottom: "16px", fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--signal-red)" }}>{error}</div>}
            <Field label="New Password">
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••••••"
                  style={{ width: "100%", padding: "10px 42px 10px 13px", fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--text-primary)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", outline: "none", transition: "border-color 0.16s", boxSizing: "border-box" as const }}
                  onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
                  onBlur={e =>  e.currentTarget.style.borderColor = "var(--border)"}
                />
                <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex" }}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </Field>
            <Field label="Confirm Password">
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••••••"
                style={{ width: "100%", padding: "10px 13px", fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--text-primary)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", outline: "none", transition: "border-color 0.16s", boxSizing: "border-box" as const }}
                onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
                onBlur={e =>  e.currentTarget.style.borderColor = "var(--border)"}
              />
            </Field>
            <SaveBtn brandColor={brandColor} onClick={handleSave} loading={saving} saved={saved} label="Update Password" />
          </div>
        </Panel>
      </motion.div>
    </div>
  );
}

// ── Billing tab ───────────────────────────────────────────────────────────────
function BillingTab({ brandColor }: { brandColor: string }) {
  return (
    <motion.div variants={pv(0.1)} initial="hidden" animate="visible">
      <Panel>
        <PH title="Billing & Subscription" subtitle="Manage your plan and payment details." />
        <div style={{ padding: "40px 22px", textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "3rem", letterSpacing: "-0.04em", lineHeight: 1, color: "var(--text-primary)", marginBottom: "12px", fontWeight: 400 }}>Free</div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-secondary)", marginBottom: "28px" }}>Currently on the free plan. Upgrade to unlock full keyword research, competitor tracking, and AI strategy generation.</div>
          <button style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 500, color: "#fff", background: brandColor, border: "none", borderRadius: "100px", padding: "12px 28px", cursor: "pointer", transition: "opacity 0.16s" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
          >
            Upgrade plan
          </button>
        </div>
      </Panel>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function SettingsContent() {
  const searchParams   = useSearchParams();
  const defaultTab     = (searchParams.get("tab") as TabId) || "profile";
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);
  const [brandColor, setBrandColor] = useState("#2563eb");

  useEffect(() => {
    const b = localStorage.getItem("aiml-brand") || localStorage.getItem("rvivme-brand");
    if (b) setBrandColor(b);
  }, []);

  function handleBrandChange(hex: string) {
    setBrandColor(hex);
    localStorage.setItem("aiml-brand",   hex);
    localStorage.setItem("rvivme-brand", hex);
    document.documentElement.style.setProperty("--brand", hex);
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "32px 24px 80px", maxWidth: "1100px", margin: "0 auto" }}>
      <motion.div variants={pv(0)} initial="hidden" animate="visible" style={{ marginBottom: "32px" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem,3vw,2.6rem)", letterSpacing: "-0.04em", lineHeight: 1, fontWeight: 400, color: "var(--text-primary)", marginBottom: "6px" }}>Settings</h1>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-secondary)" }}>Manage your account, integrations, and preferences.</p>
      </motion.div>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "24px", alignItems: "start" }}>
        {/* Sidebar */}
        <motion.nav variants={pv(0.06)} initial="hidden" animate="visible"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" }}
        >
          {TABS.map(tab => {
            const Icon   = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: "10px",
                padding: "12px 16px", fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                background: active ? "var(--muted)" : "transparent",
                border: "none", borderLeft: `2px solid ${active ? "var(--brand)" : "transparent"}`,
                cursor: "pointer", transition: "all 0.16s", textAlign: "left",
              }}>
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </motion.nav>

        {/* Content */}
        <div>
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {activeTab === "profile"      && <ProfileTab       brandColor={brandColor} />}
              {activeTab === "branding"     && <BrandingTab      brandColor={brandColor} onBrandChange={handleBrandChange} />}
              {activeTab === "integrations" && <IntegrationsTab  brandColor={brandColor} />}
              {activeTab === "billing"      && <BillingTab       brandColor={brandColor} />}
              {activeTab === "security"     && <SecurityTab      brandColor={brandColor} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function SettingsPage() {
  return <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg)" }} />}><SettingsContent /></Suspense>;
}
