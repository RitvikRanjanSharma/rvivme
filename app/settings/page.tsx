"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, CreditCard, Database, Palette, Plug, Shield, User } from "lucide-react";
import { supabase, type Database as AppDatabase } from "@/lib/supabase";

type UserRow = AppDatabase["public"]["Tables"]["users"]["Row"];
type TabId = "profile" | "branding" | "integrations" | "data" | "billing" | "security";

const tabs = [
  { id: "profile", label: "Profile", icon: User },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "data", label: "Data", icon: Database },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "security", label: "Security", icon: Shield },
] as const;

const brandPresets = ["#2563eb", "#f97316", "#10b981", "#e11d48", "#06b6d4", "#7c3aed"] as const;

const defaultProfile: Pick<
  UserRow,
  "company_name" | "gsc_connected" | "ga4_connected" | "onboarding_complete" | "primary_color_hex" | "subscription_tier" | "theme_mode" | "website_url"
> = {
  company_name: "Rvivme",
  website_url: "https://rvivme.example",
  primary_color_hex: "#2563eb",
  subscription_tier: "free",
  ga4_connected: false,
  gsc_connected: false,
  theme_mode: "dark",
  onboarding_complete: false,
};

function isTabId(value: string | null): value is TabId {
  return tabs.some((tab) => tab.id === value);
}

function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "24px",
        padding: "24px",
      }}
    >
      <div style={{ alignItems: "start", display: "flex", gap: "16px", justifyContent: "space-between", marginBottom: "20px" }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem", letterSpacing: "-0.05em", margin: 0 }}>{title}</h2>
          <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, margin: "10px 0 0" }}>{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ color: "var(--text-secondary)", display: "block", fontSize: "0.9rem", marginBottom: "8px" }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          color: "var(--text-primary)",
          padding: "14px 16px",
          width: "100%",
        }}
      />
    </label>
  );
}

function SaveButton({
  disabled,
  label,
  onClick,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={disabled}
      style={{
        background: disabled ? "var(--muted)" : "linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 55%, #081018))",
        border: "none",
        borderRadius: "999px",
        color: "#ffffff",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "12px 18px",
      }}
    >
      {label}
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab: TabId = isTabId(requestedTab) ? requestedTab : "profile";

  const [companyName, setCompanyName] = useState(defaultProfile.company_name);
  const [websiteUrl, setWebsiteUrl] = useState(defaultProfile.website_url);
  const [fullName, setFullName] = useState("Marketing Operator");
  const [email, setEmail] = useState("team@rvivme.com");
  const [brandColor, setBrandColor] = useState(defaultProfile.primary_color_hex);
  const [profile, setProfile] = useState(defaultProfile);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const setTab = (tab: TabId) => {
    router.replace(`/settings?tab=${tab}`);
  };

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setStatusMessage(null);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setLoading(false);
      setStatusMessage(authError?.message ?? "Sign in to manage settings.");
      return;
    }

    setEmail(user.email ?? "");
    setFullName((user.user_metadata?.full_name as string | undefined) ?? "");

    const { data, error } = await supabase.from("users").select("*").eq("id", user.id).single();
    const userProfile = data as UserRow | null;

    if (error || !userProfile) {
      setLoading(false);
      setStatusMessage(error?.message ?? "Unable to load workspace profile.");
      return;
    }

    setProfile(userProfile);
    setCompanyName(userProfile.company_name);
    setWebsiteUrl(userProfile.website_url);
    setBrandColor(userProfile.primary_color_hex);
    window.localStorage.setItem("rvivme-brand", userProfile.primary_color_hex);
    window.localStorage.setItem("rvivme-theme", userProfile.theme_mode);
    document.documentElement.style.setProperty("--brand", userProfile.primary_color_hex);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProfile();
  }, [loadProfile]);

  const saveProfile = useCallback(async () => {
    setSaving(true);
    setStatusMessage(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSaving(false);
      setStatusMessage("You need to sign in again before saving.");
      return;
    }

    const { error } = await supabase
      .from("users")
      .update({
        company_name: companyName,
        website_url: websiteUrl,
      } as never)
      .eq("id", user.id);

    if (!error) {
      const { error: authUpdateError } = await supabase.auth.updateUser({
        data: { full_name: fullName },
      });

      setStatusMessage(authUpdateError ? authUpdateError.message : "Profile saved.");
    } else {
      setStatusMessage(error.message);
    }

    setSaving(false);
    void loadProfile();
  }, [companyName, fullName, loadProfile, websiteUrl]);

  const saveBranding = useCallback(async () => {
    setSaving(true);
    setStatusMessage(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSaving(false);
      setStatusMessage("You need to sign in again before saving.");
      return;
    }

    const { error } = await supabase
      .from("users")
      .update({
        primary_color_hex: brandColor,
        theme_mode: profile.theme_mode,
      } as never)
      .eq("id", user.id);

    if (error) {
      setStatusMessage(error.message);
    } else {
      window.localStorage.setItem("rvivme-brand", brandColor);
      document.documentElement.style.setProperty("--brand", brandColor);
      setStatusMessage("Brand settings saved.");
    }

    setSaving(false);
    void loadProfile();
  }, [brandColor, loadProfile, profile.theme_mode]);

  const metrics = useMemo(
    () => [
      { label: "Connected sources", value: `${Number(profile.ga4_connected) + Number(profile.gsc_connected)} live` },
      { label: "Subscription", value: profile.subscription_tier },
      { label: "Onboarding", value: profile.onboarding_complete ? "Complete" : "In progress" },
    ],
    [profile.ga4_connected, profile.gsc_connected, profile.onboarding_complete, profile.subscription_tier],
  );

  const renderContent = () => {
    switch (activeTab) {
      case "profile":
        return (
          <SectionCard
            title="Workspace profile"
            description="These values are stored in Supabase and used across reports, onboarding, and platform defaults."
            action={<SaveButton disabled={saving || loading} label={saving ? "Saving..." : "Save profile"} onClick={saveProfile} />}
          >
            <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <Field label="Full name" value={fullName} onChange={setFullName} />
              <Field label="Email" value={email} onChange={setEmail} type="email" />
              <Field label="Company name" value={companyName} onChange={setCompanyName} />
              <Field label="Primary domain" value={websiteUrl} onChange={setWebsiteUrl} />
            </div>
          </SectionCard>
        );
      case "branding":
        return (
          <SectionCard
            title="Brand system"
            description="Primary color and theme preferences are now read from and written back to your user profile."
            action={<SaveButton disabled={saving || loading} label={saving ? "Saving..." : "Save branding"} onClick={saveBranding} />}
          >
            <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "16px" }}>
              {brandPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setBrandColor(preset)}
                  style={{
                    background: preset,
                    border: brandColor === preset ? "3px solid white" : "1px solid rgba(255,255,255,0.2)",
                    borderRadius: "18px",
                    cursor: "pointer",
                    height: "54px",
                    width: "54px",
                  }}
                />
              ))}
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "18px", padding: "12px 16px" }}>
                <p style={{ color: "var(--text-tertiary)", fontSize: "0.85rem", margin: 0 }}>Current accent</p>
                <p style={{ fontFamily: "var(--font-mono)", margin: "6px 0 0" }}>{brandColor.toUpperCase()}</p>
              </div>
            </div>
          </SectionCard>
        );
      case "integrations":
        return (
          <SectionCard title="Integrations" description="Connection status is now reflecting the actual booleans stored on your user record.">
            <div style={{ display: "grid", gap: "14px" }}>
              {[
                { name: "Google Search Console", status: profile.gsc_connected ? "Connected" : "Pending connection" },
                { name: "GA4", status: profile.ga4_connected ? "Connected" : "Ready to connect" },
                { name: "DataForSEO", status: "Configured via environment variables" },
              ].map((integration) => (
                <div
                  key={integration.name}
                  style={{ alignItems: "center", background: "var(--card)", borderRadius: "18px", display: "flex", justifyContent: "space-between", padding: "16px 18px" }}
                >
                  <div>
                    <p style={{ margin: 0 }}>{integration.name}</p>
                    <p style={{ color: "var(--text-secondary)", margin: "6px 0 0" }}>{integration.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        );
      case "data":
        return (
          <SectionCard title="Data operations" description="This section is pulling from your connected profile state and current app configuration.">
            <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {[
                { label: "Theme mode", value: profile.theme_mode },
                { label: "Primary color", value: profile.primary_color_hex },
                { label: "Site domain", value: profile.website_url },
              ].map((item) => (
                <div key={item.label} style={{ background: "var(--card)", borderRadius: "18px", padding: "18px" }}>
                  <p style={{ color: "var(--text-tertiary)", fontSize: "0.85rem", margin: 0 }}>{item.label}</p>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", margin: "8px 0 0" }}>{item.value}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        );
      case "billing":
        return (
          <SectionCard title="Billing" description="Billing status is now reading from the real subscription tier stored on your account.">
            <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {[
                { label: "Plan", value: profile.subscription_tier },
                { label: "Workspace status", value: profile.onboarding_complete ? "Active" : "Setup pending" },
                { label: "Theme preference", value: profile.theme_mode },
              ].map((item) => (
                <div key={item.label} style={{ background: "var(--card)", borderRadius: "18px", padding: "18px" }}>
                  <p style={{ color: "var(--text-tertiary)", fontSize: "0.85rem", margin: 0 }}>{item.label}</p>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", margin: "8px 0 0" }}>{item.value}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        );
      case "security":
        return (
          <SectionCard title="Security" description="Security posture now reflects your authenticated account state and workspace flags.">
            <div style={{ display: "grid", gap: "14px" }}>
              {[
                `Signed in as ${email || "unknown user"}`,
                `Onboarding ${profile.onboarding_complete ? "completed" : "not completed"}`,
                `Theme preference stored as ${profile.theme_mode}`,
              ].map((line) => (
                <div key={line} style={{ background: "var(--card)", borderRadius: "18px", padding: "16px 18px" }}>
                  {line}
                </div>
              ))}
            </div>
          </SectionCard>
        );
    }
  };

  return (
    <div style={{ margin: "0 auto", maxWidth: "1280px", padding: "40px 24px 80px" }}>
      <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "14px", justifyContent: "space-between", marginBottom: "28px" }}>
        <div>
          <p style={{ color: "var(--brand)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", margin: 0, textTransform: "uppercase" }}>
            Settings
          </p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 5vw, 3.4rem)", letterSpacing: "-0.06em", margin: "8px 0 0" }}>
            Tune the workspace around your team.
          </h1>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={() => void loadProfile()}
            style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "999px", color: "var(--text-secondary)", display: "flex", gap: "8px", padding: "12px 16px" }}
          >
            <Bell size={16} />
            Refresh
          </button>
        </div>
      </div>

      {statusMessage ? (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "18px", color: "var(--text-secondary)", marginBottom: "18px", padding: "14px 16px" }}>
          {statusMessage}
        </div>
      ) : null}

      <div className="settings-grid" style={{ display: "grid", gap: "24px", gridTemplateColumns: "260px minmax(0, 1fr)" }}>
        <aside style={{ alignSelf: "start", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "24px", padding: "12px" }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.id === activeTab;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                style={{
                  alignItems: "center",
                  background: active ? "rgba(var(--brand-rgb), 0.12)" : "transparent",
                  border: "none",
                  borderRadius: "16px",
                  color: active ? "var(--brand)" : "var(--text-secondary)",
                  cursor: "pointer",
                  display: "flex",
                  gap: "10px",
                  padding: "14px 16px",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}

          <div style={{ background: "var(--card)", borderRadius: "18px", marginTop: "14px", padding: "16px" }}>
            {metrics.map((metric) => (
              <div key={metric.label} style={{ marginBottom: metric.label === metrics.at(-1)?.label ? 0 : "14px" }}>
                <p style={{ color: "var(--text-tertiary)", fontSize: "0.78rem", margin: 0 }}>{metric.label}</p>
                <p style={{ fontFamily: "var(--font-mono)", margin: "6px 0 0" }}>{loading ? "Loading..." : metric.value}</p>
              </div>
            ))}
          </div>
        </aside>

        <div>{renderContent()}</div>
      </div>
    </div>
  );
}
