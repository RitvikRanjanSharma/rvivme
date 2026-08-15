"use client";

// app/settings/page.tsx
// =============================================================================
// AI Marketing Lab — Settings
// Profile saves to Supabase · Branding persisted · AI Marketing Lab brand
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { BRAND_DEFAULT } from "@/app/ui/app-shell";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Palette, Plug, CreditCard, Shield, Database,
  CheckCircle2, AlertCircle, Save, RefreshCw,
  Globe2, BarChart3, Cpu, Trash2, Eye, EyeOff, Brain, HelpCircle, Volume2,
} from "lucide-react";
import {
  listVoices, pickDefaultVoice, speak, speechSupported, type SpeechVoice,
} from "@/lib/speech";
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

// Luminous Copper leads, since it's the default. The rest are picked to sit
// on both Pale Linen and Midnight Teal — the old set was chosen against
// near-black and several of them washed out on a warm light background.
const BRAND_PRESETS = [
  "#B86D48","#8C5A3C","#A8442F","#7A6A52",
  "#2F6F6B","#3D5A80","#6B4E71","#4A5D3A",
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
      background: saved ? "#25b57e" : loading ? "var(--muted)" : brandColor,
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
            <div className="aiml-field-pair" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
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
                <TextInput value={hex} onChange={apply} placeholder="#B86D48" />
              </div>
            </Field>

            <SaveBtn brandColor={brandColor} onClick={handleSave} loading={saving} saved={saved} label="Apply Brand Colour" />
          </div>
        </Panel>
      </motion.div>

      <motion.div variants={pv(0.18)} initial="hidden" animate="visible">
        <VoicePanel brandColor={brandColor} />
      </motion.div>
    </div>
  );
}

// ── Read-aloud voice ──────────────────────────────────────────────────────────
// Voices come from the operating system, not from us, so this lists whatever
// the current device actually has and lets the reader choose. That's why the
// options differ between a Windows desktop and an iPhone — and why we show the
// raw voice name rather than only "British male / female".
function VoicePanel({ brandColor }: { brandColor: string }) {
  const [voices,   setVoices]   = useState<SpeechVoice[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading,  setLoading]  = useState(true);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listVoices();
      if (cancelled) return;
      setVoices(list);
      const stored = localStorage.getItem("aiml-voice-name");
      setSelected(stored || (await pickDefaultVoice()) || "");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  function choose(name: string) {
    setSelected(name);
    localStorage.setItem("aiml-voice-name", name);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function preview() {
    if (!selected) return;
    speak(
      "This is how articles will sound when read aloud on AI Marketing Lab.",
      { voiceName: selected },
    );
  }

  const british = voices.filter(v => v.british);
  const others  = voices.filter(v => !v.british);

  const label = (v: SpeechVoice) =>
    `${v.name}${v.gender !== "unknown" ? ` — ${v.gender === "male" ? "male" : "female"}` : ""}`;

  return (
    <Panel>
      <PH title="Read-aloud voice" subtitle="Used by the Listen button on blog posts. Saved to this browser." />
      <div style={{ padding: "22px" }}>
        {!speechSupported() ? (
          <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)" }}>
            This browser doesn&rsquo;t support speech synthesis, so read-aloud is unavailable here.
          </div>
        ) : loading ? (
          <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-tertiary)" }}>
            Loading voices…
          </div>
        ) : voices.length === 0 ? (
          <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)" }}>
            No English voices are installed on this device.
          </div>
        ) : (
          <>
            <Field
              label="Voice"
              hint={british.length
                ? "British voices are listed first. The choice is stored per browser, so set it again on other devices."
                : "No British voices found on this device — the list below falls back to other English voices."}
            >
              <select
                value={selected}
                onChange={e => choose(e.target.value)}
                style={{
                  width: "100%", padding: "9px 12px",
                  fontFamily: "var(--font-inter), sans-serif", fontSize: "13px",
                  color: "var(--text-primary)", background: "var(--card)",
                  border: "1px solid var(--border)", borderRadius: "7px",
                  outline: "none", boxSizing: "border-box" as const,
                }}
              >
                {british.length > 0 && (
                  <optgroup label="British English">
                    {british.map(v => <option key={v.name} value={v.name}>{label(v)}</option>)}
                  </optgroup>
                )}
                {others.length > 0 && (
                  <optgroup label="Other English">
                    {others.map(v => <option key={v.name} value={v.name}>{label(v)} ({v.lang})</option>)}
                  </optgroup>
                )}
              </select>
            </Field>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <button
                onClick={preview}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "7px",
                  padding: "9px 16px",
                  fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 500,
                  color: "#fff", background: brandColor,
                  border: "none", borderRadius: "8px", cursor: "pointer",
                }}
              >
                <Volume2 size={13} /> Preview voice
              </button>
              {saved && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", color: "var(--signal-green)" }}>
                  <CheckCircle2 size={12} /> Saved
                </span>
              )}
            </div>

            <div style={{ marginTop: "14px", fontFamily: "var(--font-body)", fontSize: "11.5px", color: "var(--text-tertiary)", lineHeight: 1.6 }}>
              Voices are provided by your operating system and browser, so the list
              differs between devices. Nothing is sent to a server — the text is
              spoken locally.
            </div>
          </>
        )}
      </div>
    </Panel>
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

  // Per-user analytics config (stored on public.users). Empty string while we
  // load — TextInput treats that as an editable blank field.
  const [gscSiteUrl,    setGscSiteUrl]    = useState<string>("");
  const [ga4PropertyId, setGa4PropertyId] = useState<string>("");
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(true);
  const [analyticsSaving,  setAnalyticsSaving]  = useState<boolean>(false);
  const [analyticsSaved,   setAnalyticsSaved]   = useState<boolean>(false);
  const [analyticsError,   setAnalyticsError]   = useState<string | null>(null);

  // ── Google OAuth connection ──────────────────────────────────────────────
  type Ga4Property = { id: string; name: string; account?: string };
  type GscSite     = { siteUrl: string; permissionLevel: string };
  const [gConfigured,  setGConfigured]  = useState(true);
  const [gConnected,   setGConnected]   = useState(false);
  const [gNeedsReauth, setGNeedsReauth] = useState(false);
  const [gEmail,       setGEmail]       = useState<string | null>(null);
  const [gProps,       setGProps]       = useState<Ga4Property[]>([]);
  const [gSites,       setGSites]       = useState<GscSite[]>([]);
  const [gLoading,     setGLoading]     = useState(true);
  const [gBanner,      setGBanner]      = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const loadGoogle = useCallback(async () => {
    setGLoading(true);
    try {
      const r = await fetch("/api/integrations/google");
      if (!r.ok) { setGConnected(false); return; }
      const d = await r.json();
      setGConfigured(d.configured !== false);
      setGConnected(!!d.connected);
      setGNeedsReauth(!!d.needsReauth);
      setGEmail(d.googleEmail ?? null);
      setGProps(d.ga4Properties ?? []);
      setGSites(d.gscSites ?? []);
    } catch {
      setGConnected(false);
    } finally {
      setGLoading(false);
    }
  }, []);

  useEffect(() => { loadGoogle(); }, [loadGoogle]);

  // The OAuth callback bounces back here with ?google=… / ?google_error=…
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const ok  = q.get("google");
    const err = q.get("google_error");
    if (!ok && !err) return;

    const messages: Record<string, string> = {
      connected:       "Google account connected.",
      cancelled:       "Connection cancelled — nothing was changed.",
      not_configured:  "Google sign-in isn't set up on this deployment yet.",
      session_expired: "Your session expired during sign-in. Please try again.",
      state_mismatch:  "Sign-in could not be verified. Please try again.",
      missing_code:    "Google didn't return an authorisation code. Please try again.",
      // These three all mean "Google was fine, our side wasn't" — each names
      // the actual fix rather than saying "try again", which would never work.
      exchange_failed: "Google rejected the sign-in. Check GOOGLE_OAUTH_CLIENT_SECRET is correct and that the redirect URI matches exactly.",
      table_missing:   "Sign-in worked, but the google_connections table is missing. Run migration 009 in Supabase.",
      service_role:    "Sign-in worked, but SUPABASE_SERVICE_ROLE_KEY is missing or invalid on this deployment.",
      save_failed:     "Sign-in worked, but the connection couldn't be saved. Check the deployment logs for details.",
    };
    const key = ok ?? err ?? "";
    setGBanner({ kind: ok === "connected" ? "ok" : "err", text: messages[key] ?? "Unknown result." });

    // Strip the params so a refresh doesn't re-show the banner.
    q.delete("google"); q.delete("google_error");
    const rest = q.toString();
    window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
  }, []);

  async function disconnectGoogle() {
    setGLoading(true);
    try {
      await fetch("/api/auth/google/disconnect", { method: "POST" });
      setGBanner({ kind: "ok", text: "Google account disconnected." });
      await loadGoogle();
    } catch {
      setGBanner({ kind: "err", text: "Could not disconnect. Please try again." });
    } finally {
      setGLoading(false);
    }
  }

  useEffect(() => {
    const d = localStorage.getItem("aiml-domain");
    if (d) setDomain(d);
  }, []);

  // Load the caller's current GSC / GA4 pointers from Supabase. Every user
  // has their own row, so this is exactly their own config — no cross-user
  // leakage.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (alive) setAnalyticsLoading(false); return; }
        const { data } = await supabase
          .from("users")
          .select("gsc_site_url, ga4_property_id")
          .eq("id", user.id)
          .single();
        if (!alive) return;
        const row = data as { gsc_site_url: string | null; ga4_property_id: string | null } | null;
        if (row) {
          setGscSiteUrl(row.gsc_site_url ?? "");
          setGa4PropertyId(row.ga4_property_id ?? "");
        }
      } finally {
        if (alive) setAnalyticsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Real connection state — one lightweight server call that only checks
  // whether the required credentials are present. Never hits the downstream
  // APIs, so it's fast and safe to run on every mount.
  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/integrations/status");
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
      setGa4St("error"); setGscSt("error"); setDfsSt("error"); setAntSt("error");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await refreshStatus(); })();
    return () => { alive = false; };
  }, [refreshStatus]);

  async function handleSaveAnalytics() {
    setAnalyticsSaving(true); setAnalyticsError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setAnalyticsSaving(false);
      setAnalyticsError("Your session has expired — please sign in again.");
      return;
    }
    const { error: dbErr } = await supabase.from("users").update({
      gsc_site_url:    gscSiteUrl.trim()    || null,
      ga4_property_id: ga4PropertyId.trim() || null,
    } as never).eq("id", user.id);
    setAnalyticsSaving(false);
    if (dbErr) { setAnalyticsError(dbErr.message); return; }
    setAnalyticsSaved(true);
    setTimeout(() => setAnalyticsSaved(false), 2500);
    // Pick up the new pill colours right away
    await refreshStatus();
  }

  const integrations = [
    { id: "anthropic",  name: "Anthropic (Claude)",      desc: "AI strategy generation, keyword matching",    icon: Brain,    status: antSt, note: "ANTHROPIC_API_KEY in server env" },
    { id: "ga4",        name: "Google Analytics 4",      desc: "Traffic, sessions, and user behaviour data",  icon: BarChart3, status: ga4St, note: ga4PropertyId.trim() ? `property ${ga4PropertyId.trim()}` : "Not configured — add your property ID below" },
    { id: "gsc",        name: "Google Search Console",   desc: "Impressions, clicks, positions, CTR",         icon: Globe2,   status: gscSt, note: gscSiteUrl.trim() || `Not configured — add your site URL below` },
    { id: "dataforseo", name: "DataForSEO",              desc: "Retired — backlinks, competitor data, live SERP", icon: Cpu,  status: dfsSt, note: "Out of credits — keyword data now comes from Google Trends + Search Console" },
  ] as const;

  const statusCfg: Record<IntgStatus, { label: string; color: string; bg: string }> = {
    connected:    { label: "Connected",    color: "var(--signal-green)", bg: "rgba(37,181,126,0.08)"  },
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

      {/* Per-user analytics configuration — this is what makes GA4/GSC
          show *your* data instead of whichever workspace the shared env
          vars happen to point at. */}
      <motion.div variants={pv(0.28)} initial="hidden" animate="visible">
        <Panel>
          <PH title="Your Analytics Properties" subtitle="Saved to your account. Only you can see or query this data." />
          <div style={{ padding: "22px" }}>
            {analyticsError && (
              <div style={{ padding: "10px 14px", background: "rgba(255,23,68,0.08)", border: "1px solid rgba(255,23,68,0.20)", borderRadius: "7px", marginBottom: "16px", fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--signal-red)" }}>
                {analyticsError}
              </div>
            )}
            {/* ── Google account connection ──────────────────────────────── */}
            {gBanner && (
              <div style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "10px 14px", marginBottom: "16px", borderRadius: "9px",
                background: gBanner.kind === "ok" ? "rgba(37,181,126,0.08)" : "rgba(255,171,0,0.08)",
                border: `1px solid ${gBanner.kind === "ok" ? "rgba(37,181,126,0.25)" : "rgba(255,171,0,0.25)"}`,
                fontFamily: "var(--font-inter), sans-serif", fontSize: "12.5px",
                color: gBanner.kind === "ok" ? "var(--signal-green)" : "var(--signal-amber)",
              }}>
                {gBanner.kind === "ok" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                {gBanner.text}
              </div>
            )}

            <div style={{
              padding: "16px 18px", marginBottom: "20px",
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: "10px",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                    Google account
                  </div>
                  <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {gLoading
                      ? "Checking…"
                      : !gConfigured
                      ? "Google sign-in isn't set up on this deployment yet."
                      : gNeedsReauth
                      ? "Access expired or was revoked — reconnect to resume reading your data."
                      : gConnected
                      ? <>Connected{gEmail ? <> as <strong style={{ color: "var(--text-primary)" }}>{gEmail}</strong></> : null}. Read-only access to your Analytics and Search Console.</>
                      : "Sign in with Google to read your own Analytics and Search Console data. Read-only, and you can disconnect at any time."}
                  </div>
                </div>

                {gConfigured && !gLoading && (
                  gConnected && !gNeedsReauth ? (
                    <button
                      onClick={disconnectGoogle}
                      style={{
                        flexShrink: 0, padding: "9px 16px",
                        fontFamily: "var(--font-inter), sans-serif", fontSize: "12.5px", fontWeight: 500,
                        color: "var(--text-secondary)", background: "transparent",
                        border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer",
                      }}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <a
                      href="/api/auth/google/start"
                      style={{
                        flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "7px",
                        padding: "9px 16px", textDecoration: "none",
                        fontFamily: "var(--font-inter), sans-serif", fontSize: "12.5px", fontWeight: 600,
                        color: "#fff", background: brandColor,
                        border: "none", borderRadius: "8px",
                      }}
                    >
                      {gNeedsReauth ? "Reconnect Google" : "Connect Google"}
                    </a>
                  )
                )}
              </div>
            </div>

            <div className="grid-1-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
              <Field
                label="Google Search Console site"
                hint={gSites.length
                  ? "Pick the property you want this workspace to report on."
                  : 'e.g. "sc-domain:yourdomain.com" for a domain property, or "https://yourdomain.com/" for a URL-prefix property.'}
              >
                {/* Once connected we know exactly which sites the user can read,
                    so offer them rather than asking for a hand-typed URL — the
                    sc-domain vs https:// distinction was a frequent mistake. */}
                {gSites.length > 0 ? (
                  <select
                    value={gscSiteUrl}
                    onChange={e => setGscSiteUrl(e.target.value)}
                    disabled={analyticsLoading}
                    style={{
                      width: "100%", padding: "9px 12px",
                      fontFamily: "var(--font-inter), sans-serif", fontSize: "13px",
                      color: "var(--text-primary)", background: "var(--card)",
                      border: "1px solid var(--border)", borderRadius: "7px",
                      outline: "none", boxSizing: "border-box" as const,
                    }}
                  >
                    <option value="">Select a site…</option>
                    {gSites.map(s => (
                      <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</option>
                    ))}
                  </select>
                ) : (
                  <TextInput
                    value={gscSiteUrl}
                    onChange={setGscSiteUrl}
                    placeholder="sc-domain:yourdomain.com"
                    disabled={analyticsLoading}
                  />
                )}
              </Field>
              <Field
                label="GA4 property"
                hint={gProps.length
                  ? "Pick the property you want this workspace to report on."
                  : 'The numeric ID of your GA4 property. Not the "G-XXXXXXX" measurement ID — see the steps below.'}
              >
                {gProps.length > 0 ? (
                  <select
                    value={ga4PropertyId}
                    onChange={e => setGa4PropertyId(e.target.value)}
                    disabled={analyticsLoading}
                    style={{
                      width: "100%", padding: "9px 12px",
                      fontFamily: "var(--font-inter), sans-serif", fontSize: "13px",
                      color: "var(--text-primary)", background: "var(--card)",
                      border: "1px solid var(--border)", borderRadius: "7px",
                      outline: "none", boxSizing: "border-box" as const,
                    }}
                  >
                    <option value="">Select a property…</option>
                    {gProps.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.account ? ` — ${p.account}` : ""} ({p.id})
                      </option>
                    ))}
                  </select>
                ) : (
                  <TextInput
                    value={ga4PropertyId}
                    onChange={setGa4PropertyId}
                    placeholder="123456789"
                    disabled={analyticsLoading}
                  />
                )}
              </Field>
            </div>

            {/* Where-do-I-find-this guide. The single most common setup mistake
                is pasting the G-XXXXXXX measurement ID, which looks like an ID
                but is a different thing entirely and silently fails. */}
            <details style={{ marginTop: "4px", marginBottom: "18px" }}>
              <summary style={{
                cursor: "pointer", listStyle: "none",
                display: "inline-flex", alignItems: "center", gap: "6px",
                fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 500,
                color: brandColor,
              }}>
                <HelpCircle size={12} />
                Where do I find my GA4 property ID?
              </summary>
              <div style={{
                marginTop: "12px", padding: "14px 16px",
                background: "var(--card)", border: "1px solid var(--border)",
                borderRadius: "10px",
              }}>
                <ol style={{
                  margin: 0, paddingLeft: "18px",
                  fontFamily: "var(--font-body)", fontSize: "12.5px",
                  color: "var(--text-reading)", lineHeight: 1.75,
                }}>
                  <li>
                    Go to{" "}
                    <a
                      href="https://analytics.google.com/analytics/web/#/admin"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: brandColor, textDecoration: "underline", textUnderlineOffset: "2px" }}
                    >
                      analytics.google.com
                    </a>{" "}
                    and sign in.
                  </li>
                  <li>Click the <strong>Admin</strong> cog (bottom-left).</li>
                  <li>
                    In the <strong>Property</strong> column, make sure the correct
                    property is selected, then click <strong>Property settings</strong>.
                  </li>
                  <li>
                    Your <strong>Property ID</strong> is shown top-right — a plain
                    number like <code style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", background: "var(--muted)", padding: "1px 5px", borderRadius: "4px" }}>123456789</code>.
                  </li>
                  <li>Paste just that number above — no “G-”, no spaces.</li>
                </ol>

                <div style={{
                  marginTop: "12px", paddingTop: "12px",
                  borderTop: "1px solid var(--border)",
                  fontFamily: "var(--font-body)", fontSize: "12px",
                  color: "var(--text-secondary)", lineHeight: 1.65,
                }}>
                  <strong style={{ color: "var(--signal-amber)" }}>Common mix-up:</strong>{" "}
                  the <code style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px" }}>G-XXXXXXXXXX</code>{" "}
                  measurement ID (used in your site&rsquo;s tracking snippet) is a
                  different value and won&rsquo;t work here.
                </div>

                <div style={{
                  marginTop: "10px",
                  fontFamily: "var(--font-body)", fontSize: "12px",
                  color: "var(--text-secondary)", lineHeight: 1.65,
                }}>
                  <strong>One more step:</strong> in the same Admin screen open{" "}
                  <strong>Property access management</strong> → <strong>+</strong> →
                  add{" "}
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: "11px", wordBreak: "break-all" }}>
                    aiml-ga4-reader@ai-marketing-labs.iam.gserviceaccount.com
                  </code>{" "}
                  with the <strong>Viewer</strong> role. Without this the ID saves
                  fine but the dashboard can&rsquo;t read any data.
                </div>
              </div>
            </details>
            <SaveBtn
              brandColor={brandColor}
              onClick={handleSaveAnalytics}
              loading={analyticsSaving}
              saved={analyticsSaved}
              label="Save analytics properties"
            />
            <div style={{ fontFamily: "var(--font-body)", fontSize: "11px", color: "var(--text-tertiary)", marginTop: "14px" }}>
              These are read using the Google account connected above — only
              properties you already have access to are listed, and access is
              read-only.
              {domain && domain !== "aimarketinglab.co.uk" && (
                <> Your current workspace domain is <strong>{domain}</strong>.</>
              )}
            </div>
          </div>
        </Panel>
      </motion.div>

      <motion.div variants={pv(0.34)} initial="hidden" animate="visible">
        <div style={{ padding: "16px 20px", background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "12px" }}>
          <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "4px" }}>
            GA4 and Search Console use a shared service account managed by
            your admin. DataForSEO and Anthropic keys are global — update
            them in your deployment environment.
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
            GA4_SERVICE_ACCOUNT_KEY · ANTHROPIC_API_KEY · PERPLEXITY_API_KEY
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
  const [brandColor, setBrandColor] = useState(BRAND_DEFAULT);

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
    <div className="aiml-page-pad" style={{ background: "var(--bg)", minHeight: "100vh", padding: "32px 24px 80px", maxWidth: "1100px", margin: "0 auto" }}>
      <motion.div variants={pv(0)} initial="hidden" animate="visible" style={{ marginBottom: "32px" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem,3vw,2.6rem)", letterSpacing: "-0.04em", lineHeight: 1, fontWeight: 400, color: "var(--text-primary)", marginBottom: "6px" }}>Settings</h1>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-secondary)" }}>Manage your account, integrations, and preferences.</p>
      </motion.div>

      <div className="aiml-settings-grid" style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "24px", alignItems: "start" }}>
        {/* Sidebar */}
        <motion.nav variants={pv(0.06)} initial="hidden" animate="visible" className="aiml-settings-tabs"
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
