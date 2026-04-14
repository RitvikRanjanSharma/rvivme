"use client";

// app/settings/page.tsx
// =============================================================================
// AI Marketing Labs — Settings & Configuration Centre
// Brand theming · API integrations · Profile · Billing · Data providers
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import {
  User, Palette, Plug, CreditCard, Shield, Database,
  CheckCircle2, XCircle, AlertCircle, ChevronRight,
  Save, RefreshCw, ExternalLink, Eye, EyeOff, Zap,
  Globe2, BarChart3, Cpu, Lock, Bell, Trash2,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type TabId = "profile" | "branding" | "integrations" | "data-providers" | "billing" | "security";

interface Integration {
  id:       string;
  name:     string;
  desc:     string;
  icon:     React.ElementType;
  status:   "connected" | "disconnected" | "pending";
  scopes:   string[];
  lastSync: string | null;
}

interface DataProvider {
  id:       string;
  name:     string;
  desc:     string;
  status:   "active" | "inactive" | "error";
  plan:     string;
  units:    number;
  unitCap:  number;
  endpoint: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────
const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "profile",        label: "Profile",         icon: User       },
  { id: "branding",       label: "Branding & Theme", icon: Palette    },
  { id: "integrations",   label: "Integrations",     icon: Plug       },
  { id: "data-providers", label: "Data Providers",   icon: Database   },
  { id: "billing",        label: "Billing",          icon: CreditCard },
  { id: "security",       label: "Security",         icon: Shield     },
];

const INTEGRATIONS: Integration[] = [
  {
    id: "ga4", name: "Google Analytics 4", desc: "Traffic, conversions, and user behaviour data",
    icon: BarChart3, status: "disconnected", scopes: ["analytics.readonly"],
    lastSync: null,
  },
  {
    id: "gsc", name: "Google Search Console", desc: "Impressions, clicks, average position, CTR",
    icon: Globe2, status: "disconnected", scopes: ["webmasters.readonly"],
    lastSync: null,
  },
  {
    id: "dataforseo", name: "DataForSEO", desc: "Keyword rankings, SERP data, backlinks, AI Overview detection",
    icon: Cpu, status: "active" as any, scopes: ["serp", "keywords", "backlinks"],
    lastSync: "09:41 GMT today",
  },
];

const DATA_PROVIDERS: DataProvider[] = [
  {
    id: "dataforseo", name: "DataForSEO", desc: "Primary data intelligence layer — SERP, keywords, backlinks, AI Overview",
    status: "active", plan: "Standard", units: 8420, unitCap: 50000, endpoint: "api.dataforseo.com",
  },
  {
    id: "ahrefs", name: "Ahrefs API", desc: "Premium backlink index — configure for authority gap analysis",
    status: "inactive", plan: "—", units: 0, unitCap: 0, endpoint: "apiv3.ahrefs.com",
  },
  {
    id: "gsc-api", name: "Google Search Console API", desc: "First-party performance data — connect GSC to activate",
    status: "error", plan: "Free", units: 0, unitCap: 25000, endpoint: "searchconsole.googleapis.com",
  },
];

const BRAND_PRESETS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f97316",
  "#10b981", "#ef4444", "#f59e0b", "#06b6d4",
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const SPRING = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const;
function pv(delay = 0) {
  return { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { ...SPRING, delay } } };
}

function hexToRgb(hex: string): string {
  const c = hex.replace("#", "");
  return `${parseInt(c.slice(0,2),16)}, ${parseInt(c.slice(2,4),16)}, ${parseInt(c.slice(4,6),16)}`;
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", ...style }}>{children}</div>;
}

function PanelHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
      <div style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: subtitle ? "3px" : 0 }}>{title}</div>
      {subtitle && <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", color: "var(--text-tertiary)" }}>{subtitle}</div>}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <label style={{ display: "block", fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "11px", color: "var(--text-tertiary)", marginTop: "5px" }}>{hint}</div>}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", padding: "9px 12px",
        fontFamily: "var(--font-inter), sans-serif", fontSize: "13px",
        color: "var(--text-primary)", background: "var(--card)",
        border: "1px solid var(--border)", borderRadius: "7px", outline: "none",
        transition: "border-color 0.18s",
      }}
      onFocus={e => (e.currentTarget.style.borderColor = "var(--brand)")}
      onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
    />
  );
}

function SaveButton({ brandColor, onClick, label = "Save Changes" }: { brandColor: string; onClick?: () => void; label?: string }) {
  const [saved, setSaved] = useState(false);
  function handleClick() {
    onClick?.();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }
  return (
    <button
      onClick={handleClick}
      style={{
        display: "flex", alignItems: "center", gap: "6px",
        fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 600,
        color: "#fff", background: saved
          ? "linear-gradient(135deg, var(--signal-green), #00b060)"
          : `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 60%, #000))`,
        border: "none", borderRadius: "8px", padding: "9px 18px", cursor: "pointer",
        boxShadow: "0 0 16px var(--brand-glow)", transition: "all 0.25s",
      }}
    >
      {saved ? <CheckCircle2 size={13} /> : <Save size={13} />}
      {saved ? "Saved" : label}
    </button>
  );
}

function StatusBadge({ status }: { status: "connected" | "disconnected" | "pending" | "active" | "inactive" | "error" }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    connected:    { label: "Connected",    color: "var(--signal-green)", bg: "rgba(0,230,118,0.10)"  },
    active:       { label: "Active",       color: "var(--signal-green)", bg: "rgba(0,230,118,0.10)"  },
    disconnected: { label: "Disconnected", color: "var(--text-tertiary)", bg: "var(--card)"          },
    inactive:     { label: "Inactive",     color: "var(--text-tertiary)", bg: "var(--card)"          },
    pending:      { label: "Pending",      color: "var(--signal-amber)", bg: "rgba(255,171,0,0.10)"  },
    error:        { label: "Error",        color: "var(--signal-red)",   bg: "rgba(255,23,68,0.10)"  },
  };
  const c = cfg[status];
  return (
    <span style={{
      fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", fontWeight: 500,
      color: c.color, background: c.bg, border: `1px solid ${c.color}30`,
      padding: "2px 8px", borderRadius: "100px", letterSpacing: "0.08em", textTransform: "uppercase",
    }}>{c.label}</span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab panels
// ─────────────────────────────────────────────────────────────────────────────

function ProfileTab({ brandColor }: { brandColor: string }) {
  const [company, setCompany]   = useState("AI Marketing Labs");
  const [website, setWebsite]   = useState("https://aimarketinglabs.co.uk");
  const [email, setEmail]       = useState("admin@aimarketinglabs.co.uk");
  const [fullName, setFullName] = useState("Platform Administrator");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <motion.div variants={pv(0.1)} initial="hidden" animate="visible">
        <Panel>
          <PanelHeader title="Organisation Profile" subtitle="Your company details are used across all reports and exports." />
          <div style={{ padding: "22px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
              <Field label="Full Name">
                <Input value={fullName} onChange={setFullName} placeholder="Your full name" />
              </Field>
              <Field label="Email Address">
                <Input value={email} onChange={setEmail} placeholder="admin@yourcompany.com" type="email" />
              </Field>
              <Field label="Company Name">
                <Input value={company} onChange={setCompany} placeholder="Your company name" />
              </Field>
              <Field label="Primary Website URL">
                <Input value={website} onChange={setWebsite} placeholder="https://yourwebsite.com" />
              </Field>
            </div>
            <SaveButton brandColor={brandColor} />
          </div>
        </Panel>
      </motion.div>

      <motion.div variants={pv(0.18)} initial="hidden" animate="visible">
        <Panel>
          <PanelHeader title="Danger Zone" subtitle="Irreversible account operations." />
          <div style={{ padding: "22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>Delete Account</div>
              <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", color: "var(--text-tertiary)" }}>Permanently deletes all data including keywords, competitors, and predictions. This action cannot be undone.</div>
            </div>
            <button style={{
              display: "flex", alignItems: "center", gap: "5px",
              fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", fontWeight: 600,
              color: "var(--signal-red)", background: "rgba(255,23,68,0.08)",
              border: "1px solid rgba(255,23,68,0.25)", borderRadius: "7px",
              padding: "8px 14px", cursor: "pointer", transition: "all 0.18s", flexShrink: 0,
            }}>
              <Trash2 size={12} /> Delete Account
            </button>
          </div>
        </Panel>
      </motion.div>
    </div>
  );
}

function BrandingTab({ brandColor, onBrandChange }: { brandColor: string; onBrandChange: (hex: string) => void }) {
  const [hex, setHex]   = useState(brandColor);
  const [mode, setMode] = useState<"dark" | "light">("dark");

  function apply(color: string) {
    const clean = color.startsWith("#") ? color : `#${color}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(clean)) {
      setHex(clean);
      onBrandChange(clean);
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem("rvivme-theme") as "dark" | "light" | null;
    if (stored) setMode(stored);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <motion.div variants={pv(0.1)} initial="hidden" animate="visible">
        <Panel>
          <PanelHeader title="Brand Colour" subtitle="Sets the primary accent across charts, buttons, and active states throughout the platform." />
          <div style={{ padding: "22px" }}>
            {/* Live preview swatch */}
            <div style={{
              padding: "20px 24px", background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: "10px", marginBottom: "22px",
              display: "flex", alignItems: "center", gap: "20px",
            }}>
              <div style={{
                width: "56px", height: "56px", borderRadius: "12px",
                background: hex, boxShadow: `0 0 24px rgba(${hexToRgb(hex)},0.45)`,
                flexShrink: 0, transition: "background 0.2s, box-shadow 0.2s",
              }} />
              <div>
                <div style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "3px" }}>
                  Current Brand Colour
                </div>
                <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "13px", color: hex }}>{hex.toUpperCase()}</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
                <button style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "6px", padding: "6px 12px", cursor: "pointer" }}>
                  Extract from Logo
                </button>
              </div>
            </div>

            {/* Presets */}
            <Field label="Colour Presets">
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {BRAND_PRESETS.map(preset => (
                  <button
                    key={preset}
                    onClick={() => apply(preset)}
                    style={{
                      width: "32px", height: "32px", borderRadius: "8px",
                      background: preset, border: `2px solid ${hex === preset ? "var(--text-primary)" : "transparent"}`,
                      cursor: "pointer", transition: "transform 0.15s, border-color 0.15s",
                      boxShadow: hex === preset ? `0 0 12px rgba(${hexToRgb(preset)},0.5)` : "none",
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = "scale(1.1)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = "scale(1)"}
                  />
                ))}
              </div>
            </Field>

            {/* Hex input */}
            <Field label="Custom Hex Value" hint="Enter any valid 6-digit hex colour code.">
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <div style={{
                  width: "36px", height: "36px", borderRadius: "7px",
                  background: hex, flexShrink: 0, border: "1px solid var(--border)",
                  transition: "background 0.15s",
                }} />
                <div style={{ flex: 1 }}>
                  <Input
                    value={hex}
                    onChange={v => apply(v)}
                    placeholder="#3b82f6"
                  />
                </div>
              </div>
            </Field>

            <SaveButton brandColor={brandColor} onClick={() => onBrandChange(hex)} label="Apply Brand Colour" />
          </div>
        </Panel>
      </motion.div>

      <motion.div variants={pv(0.18)} initial="hidden" animate="visible">
        <Panel>
          <PanelHeader title="Interface Mode" subtitle="Toggle between dark and light mode." />
          <div style={{ padding: "22px", display: "flex", gap: "12px" }}>
            {(["dark", "light"] as const).map(m => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  localStorage.setItem("rvivme-theme", m);
                  document.documentElement.classList.toggle("dark", m === "dark");
                  document.documentElement.classList.toggle("light", m === "light");
                }}
                style={{
                  flex: 1, padding: "14px", borderRadius: "9px", cursor: "pointer",
                  border: `1px solid ${mode === m ? brandColor : "var(--border)"}`,
                  background: mode === m ? `rgba(var(--brand-rgb), 0.08)` : "var(--card)",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "13px", fontWeight: 700, color: mode === m ? brandColor : "var(--text-secondary)", textTransform: "capitalize", marginBottom: "3px" }}>
                  {m} Mode
                </div>
                <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "11px", color: "var(--text-tertiary)" }}>
                  {m === "dark" ? "Obsidian black — default" : "Clean white surfaces"}
                </div>
              </button>
            ))}
          </div>
        </Panel>
      </motion.div>
    </div>
  );
}

function IntegrationsTab({ brandColor }: { brandColor: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {INTEGRATIONS.map((intg, i) => {
        const Icon = intg.icon;
        const connected = intg.status === "connected" || (intg.status as string) === "active";
        return (
          <motion.div key={intg.id} variants={pv(0.08 + i * 0.07)} initial="hidden" animate="visible">
            <Panel style={{ padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1 }}>
                  <div style={{
                    width: "42px", height: "42px", borderRadius: "10px",
                    background: connected ? `rgba(var(--brand-rgb),0.10)` : "var(--card)",
                    border: `1px solid ${connected ? `rgba(var(--brand-rgb),0.25)` : "var(--border)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <Icon size={18} color={connected ? brandColor : "var(--text-tertiary)"} />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                      <span style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>{intg.name}</span>
                      <StatusBadge status={intg.status as any} />
                    </div>
                    <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "4px" }}>{intg.desc}</div>
                    {intg.lastSync && (
                      <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
                        LAST SYNC: {intg.lastSync}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: "4px", marginTop: "6px", flexWrap: "wrap" }}>
                      {intg.scopes.map(s => (
                        <span key={s} style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", color: "var(--text-tertiary)", background: "var(--card)", border: "1px solid var(--border)", padding: "1px 6px", borderRadius: "100px", letterSpacing: "0.06em" }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                  {connected ? (
                    <>
                      <button style={{ display: "flex", alignItems: "center", gap: "4px", fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "6px", padding: "6px 10px", cursor: "pointer", letterSpacing: "0.06em" }}>
                        <RefreshCw size={10} /> SYNC
                      </button>
                      <button style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--signal-red)", background: "rgba(255,23,68,0.08)", border: "1px solid rgba(255,23,68,0.20)", borderRadius: "6px", padding: "6px 10px", cursor: "pointer", letterSpacing: "0.06em" }}>
                        DISCONNECT
                      </button>
                    </>
                  ) : (
                    <button style={{
                      display: "flex", alignItems: "center", gap: "5px",
                      fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", fontWeight: 600,
                      color: "#fff", background: `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 60%, #000))`,
                      border: "none", borderRadius: "7px", padding: "8px 14px", cursor: "pointer",
                      boxShadow: "0 0 12px var(--brand-glow)", transition: "all 0.2s",
                    }}>
                      <Plug size={12} /> Connect
                    </button>
                  )}
                </div>
              </div>
            </Panel>
          </motion.div>
        );
      })}
    </div>
  );
}

function DataProvidersTab({ brandColor }: { brandColor: string }) {
  const [showKey, setShowKey] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {DATA_PROVIDERS.map((dp, i) => (
        <motion.div key={dp.id} variants={pv(0.08 + i * 0.07)} initial="hidden" animate="visible">
          <Panel style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                  <span style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>{dp.name}</span>
                  <StatusBadge status={dp.status} />
                  {dp.plan !== "—" && (
                    <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", color: brandColor, background: `rgba(var(--brand-rgb),0.08)`, border: `1px solid rgba(var(--brand-rgb),0.18)`, padding: "1px 6px", borderRadius: "100px", letterSpacing: "0.06em" }}>
                      {dp.plan}
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", color: "var(--text-tertiary)" }}>{dp.desc}</div>
                <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", marginTop: "4px", letterSpacing: "0.06em" }}>
                  ENDPOINT: {dp.endpoint}
                </div>
              </div>
              {dp.status === "active" && (
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "18px", fontWeight: 500, color: "var(--text-primary)", lineHeight: 1, marginBottom: "2px" }}>
                    {dp.units.toLocaleString()}
                  </div>
                  <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
                    / {dp.unitCap.toLocaleString()} UNITS
                  </div>
                </div>
              )}
            </div>

            {dp.unitCap > 0 && (
              <div style={{ marginBottom: "14px" }}>
                <div style={{ height: "4px", background: "var(--border)", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.round((dp.units / dp.unitCap) * 100)}%`,
                    background: dp.status === "error" ? "var(--signal-red)" : dp.status === "active" ? brandColor : "var(--text-tertiary)",
                    borderRadius: "2px", transition: "width 0.6s ease",
                  }} />
                </div>
                <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", color: "var(--text-tertiary)", marginTop: "4px", letterSpacing: "0.06em" }}>
                  {Math.round((dp.units / dp.unitCap) * 100)}% OF MONTHLY ALLOCATION CONSUMED
                </div>
              </div>
            )}

            {/* API key field */}
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type={showKey === dp.id ? "text" : "password"}
                defaultValue={dp.status === "active" ? "dk_live_••••••••••••••••••••••••" : ""}
                placeholder={dp.status !== "active" ? "Enter API key to activate..." : undefined}
                style={{
                  flex: 1, padding: "8px 12px",
                  fontFamily: "var(--font-dm-mono), monospace", fontSize: "12px",
                  color: "var(--text-primary)", background: "var(--card)",
                  border: "1px solid var(--border)", borderRadius: "7px", outline: "none",
                }}
              />
              <button
                onClick={() => setShowKey(showKey === dp.id ? null : dp.id)}
                style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "7px", width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-tertiary)", flexShrink: 0 }}
              >
                {showKey === dp.id ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button style={{
                fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", fontWeight: 600,
                color: dp.status === "active" ? "var(--text-secondary)" : "#fff",
                background: dp.status === "active"
                  ? "transparent"
                  : `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 60%, #000))`,
                border: dp.status === "active" ? "1px solid var(--border)" : "none",
                borderRadius: "7px", padding: "8px 14px", cursor: "pointer",
                boxShadow: dp.status !== "active" ? "0 0 12px var(--brand-glow)" : "none",
                transition: "all 0.2s", flexShrink: 0,
              }}>
                {dp.status === "active" ? "Update Key" : "Activate"}
              </button>
            </div>
          </Panel>
        </motion.div>
      ))}
    </div>
  );
}

function BillingTab({ brandColor }: { brandColor: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <motion.div variants={pv(0.1)} initial="hidden" animate="visible">
        <Panel>
          <PanelHeader title="Current Plan" />
          <div style={{ padding: "22px" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "18px 20px", background: `rgba(var(--brand-rgb),0.06)`,
              border: `1px solid rgba(var(--brand-rgb),0.20)`, borderRadius: "10px", marginBottom: "20px",
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <Zap size={14} color={brandColor} />
                  <span style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "16px", fontWeight: 800, color: "var(--text-primary)" }}>Professional</span>
                </div>
                <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", color: "var(--text-tertiary)" }}>
                  500 employees · 6 months forecast · Priority support
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "24px", fontWeight: 500, color: "var(--text-primary)" }}>£899</div>
                <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>PER MONTH</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px" }}>
              {[
                { label: "Next Billing Date",  value: "14 May 2026"   },
                { label: "Payment Method",     value: "Visa ···· 4242" },
                { label: "Billing Cycle",      value: "Monthly"       },
                { label: "Account Status",     value: "Active"        },
              ].map(item => (
                <div key={item.label} style={{ padding: "12px 14px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                  <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "4px" }}>{item.label}</div>
                  <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button style={{
                display: "flex", alignItems: "center", gap: "5px",
                fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", fontWeight: 600,
                color: "#fff", background: `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 60%, #000))`,
                border: "none", borderRadius: "7px", padding: "8px 16px", cursor: "pointer",
                boxShadow: "0 0 12px var(--brand-glow)",
              }}>
                Upgrade to Enterprise
              </button>
              <button style={{
                fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", fontWeight: 500,
                color: "var(--text-secondary)", background: "transparent",
                border: "1px solid var(--border)", borderRadius: "7px", padding: "8px 14px", cursor: "pointer",
              }}>
                Download Invoice
              </button>
            </div>
          </div>
        </Panel>
      </motion.div>
    </div>
  );
}

function SecurityTab({ brandColor }: { brandColor: string }) {
  const [current, setCurrent]  = useState("");
  const [newPw, setNewPw]      = useState("");
  const [confirm, setConfirm]  = useState("");
  const [twoFa, setTwoFa]      = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <motion.div variants={pv(0.1)} initial="hidden" animate="visible">
        <Panel>
          <PanelHeader title="Change Password" />
          <div style={{ padding: "22px" }}>
            <Field label="Current Password">
              <Input value={current} onChange={setCurrent} type="password" placeholder="••••••••••••" />
            </Field>
            <Field label="New Password" hint="Minimum 12 characters. Must include uppercase, number, and symbol.">
              <Input value={newPw} onChange={setNewPw} type="password" placeholder="••••••••••••" />
            </Field>
            <Field label="Confirm New Password">
              <Input value={confirm} onChange={setConfirm} type="password" placeholder="••••••••••••" />
            </Field>
            <SaveButton brandColor={brandColor} label="Update Password" />
          </div>
        </Panel>
      </motion.div>

      <motion.div variants={pv(0.18)} initial="hidden" animate="visible">
        <Panel>
          <PanelHeader title="Two-Factor Authentication" subtitle="Adds an additional layer of security to your account." />
          <div style={{ padding: "22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                Authenticator App (TOTP)
              </div>
              <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: twoFa ? "var(--signal-green)" : "var(--text-tertiary)", letterSpacing: "0.06em" }}>
                {twoFa ? "ENABLED" : "DISABLED"}
              </div>
            </div>
            <button
              onClick={() => setTwoFa(!twoFa)}
              style={{
                width: "44px", height: "24px", borderRadius: "100px",
                background: twoFa ? brandColor : "var(--muted)",
                border: "none", cursor: "pointer",
                position: "relative", transition: "background 0.25s",
                boxShadow: twoFa ? "0 0 10px var(--brand-glow)" : "none",
              }}
            >
              <div style={{
                position: "absolute", top: "3px",
                left: twoFa ? "23px" : "3px",
                width: "18px", height: "18px", borderRadius: "50%",
                background: "#fff", transition: "left 0.25s",
              }} />
            </button>
          </div>
        </Panel>
      </motion.div>

      <motion.div variants={pv(0.26)} initial="hidden" animate="visible">
        <Panel>
          <PanelHeader title="Active Sessions" subtitle="Devices currently signed in to your account." />
          <div style={{ padding: "22px" }}>
            {[
              { device: "Chrome · macOS Ventura", ip: "82.44.18.201",    location: "London, GB",     current: true  },
              { device: "Safari · iPhone 15 Pro",  ip: "82.44.18.201",    location: "London, GB",     current: false },
              { device: "Firefox · Windows 11",    ip: "193.122.44.8",    location: "Manchester, GB", current: false },
            ].map((s, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 0", borderBottom: i < 2 ? "1px solid var(--border)" : "none",
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "2px" }}>
                    <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{s.device}</span>
                    {s.current && (
                      <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", color: "var(--signal-green)", background: "rgba(0,230,118,0.10)", border: "1px solid rgba(0,230,118,0.20)", padding: "1px 6px", borderRadius: "100px", letterSpacing: "0.06em" }}>CURRENT</span>
                    )}
                  </div>
                  <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.04em" }}>
                    {s.ip} · {s.location}
                  </div>
                </div>
                {!s.current && (
                  <button style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--signal-red)", background: "rgba(255,23,68,0.08)", border: "1px solid rgba(255,23,68,0.20)", borderRadius: "5px", padding: "4px 10px", cursor: "pointer", letterSpacing: "0.06em" }}>
                    REVOKE
                  </button>
                )}
              </div>
            ))}
          </div>
        </Panel>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [brandColor, setBrandColor] = useState("#3b82f6");
const searchParams = useSearchParams();
const [activeTab, setActiveTab]   = useState<TabId>(
  (searchParams.get("tab") as TabId) ?? "profile"
);

  useEffect(() => {
    const stored = localStorage.getItem("rvivme-brand");
    if (stored) setBrandColor(stored);
  }, []);

  function handleBrandChange(hex: string) {
    setBrandColor(hex);
    localStorage.setItem("rvivme-brand", hex);
    document.documentElement.style.setProperty("--brand", hex);
    const rgb = hex.replace("#", "");
    const r = parseInt(rgb.slice(0,2),16), g = parseInt(rgb.slice(2,4),16), b = parseInt(rgb.slice(4,6),16);
    document.documentElement.style.setProperty("--brand-rgb", `${r}, ${g}, ${b}`);
    document.documentElement.style.setProperty("--brand-glow", `rgba(${r},${g},${b},0.30)`);
  }

  const content: Record<TabId, React.ReactNode> = {
    profile:        <ProfileTab brandColor={brandColor} />,
    branding:       <BrandingTab brandColor={brandColor} onBrandChange={handleBrandChange} />,
    integrations:   <IntegrationsTab brandColor={brandColor} />,
    "data-providers": <DataProvidersTab brandColor={brandColor} />,
    billing:        <BillingTab brandColor={brandColor} />,
    security:       <SecurityTab brandColor={brandColor} />,
  };

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "32px 24px 80px", maxWidth: "1100px", margin: "0 auto" }}>
      <motion.div variants={pv(0)} initial="hidden" animate="visible" style={{ marginBottom: "28px" }}>
        <h1 style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "clamp(1.5rem,3vw,2rem)", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1, marginBottom: "6px" }}>
          Settings
        </h1>
        <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
          PLATFORM CONFIGURATION · AI MARKETING LABS
        </span>
      </motion.div>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "20px", alignItems: "start" }}>
        {/* Sidebar tabs */}
        <motion.div variants={pv(0.08)} initial="hidden" animate="visible">
          <Panel style={{ padding: "8px" }}>
            {TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: "9px",
                    padding: "9px 12px", borderRadius: "7px", border: "none", cursor: "pointer",
                    fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: active ? 600 : 400,
                    color: active ? brandColor : "var(--text-secondary)",
                    background: active ? `rgba(var(--brand-rgb),0.08)` : "transparent",
                    transition: "all 0.18s", textAlign: "left",
                    marginBottom: "2px",
                  }}
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "var(--card)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; } }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; } }}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </Panel>
        </motion.div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {content[activeTab]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
