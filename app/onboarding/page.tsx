"use client";

// app/onboarding/page.tsx
// =============================================================================
// AI Marketing Lab — Onboarding Wizard
// =============================================================================
// New users land here from the auth callback when their `onboarding_complete`
// flag is FALSE. The wizard is intentionally short and skippable: every step
// can be deferred to the Settings page later. The point of onboarding is to
// give the user a workspace they can poke around in within ~60 seconds, not
// to demand all their info upfront.
//
// Steps:
//   1. Welcome     — quick "what this is" and what we'll set up.
//   2. Domain      — your website URL + company name.
//   3. Analytics   — connect Google Analytics 4 + Search Console (paste IDs;
//                    we'll move this to OAuth in a later iteration).
//   4. Competitors — add up to 3 competitor URLs (optional).
//   5. Audit       — kick off the first site audit and let it run in the
//                    background while we drop the user on the dashboard.
//
// Each step persists state to public.users / public.competitors as it goes,
// so the user can refresh and resume. We mark onboarding_complete on the
// final step.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Check, ChevronRight, Globe2, BarChart3, Search,
  Users as UsersIcon, Sparkles, Loader2, Plus, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type StepId = "welcome" | "domain" | "analytics" | "competitors" | "audit";
const STEPS: { id: StepId; title: string; subtitle: string }[] = [
  { id: "welcome",     title: "Welcome",     subtitle: "Let's get your workspace going" },
  { id: "domain",      title: "Your site",   subtitle: "What are we tracking?" },
  { id: "analytics",   title: "Analytics",   subtitle: "Connect GA4 & Search Console" },
  { id: "competitors", title: "Competitors", subtitle: "Who do we compare against?" },
  { id: "audit",       title: "First audit", subtitle: "Run a baseline scan" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Form state — hydrated from public.users on mount.
  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl]   = useState("");
  const [ga4Id, setGa4Id]             = useState("");
  const [gscUrl, setGscUrl]           = useState("");
  const [competitors, setCompetitors] = useState<string[]>([""]);

  // Hydrate from server.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/auth/login?redirect=/onboarding"); return; }
      setUserId(user.id);

      const { data } = await supabase
        .from("users")
        .select("company_name, website_url, ga4_property_id, gsc_site_url, onboarding_complete")
        .eq("id", user.id)
        .maybeSingle();

      if (data) {
        // Already completed onboarding — bounce to dashboard.
        if (data.onboarding_complete) { router.replace("/dashboard"); return; }
        setCompanyName(data.company_name ?? "");
        // Don't pre-fill the placeholder example.com value
        setWebsiteUrl(
          data.website_url && data.website_url !== "https://example.com"
            ? data.website_url : ""
        );
        setGa4Id(data.ga4_property_id ?? "");
        setGscUrl(data.gsc_site_url ?? "");
      }

      const { data: comps } = await supabase
        .from("competitors")
        .select("competitor_url")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(3);
      if (comps && comps.length) {
        setCompetitors(comps.map(c => c.competitor_url));
      }
    })();
  }, [router]);

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  async function persistDomain() {
    if (!userId) return;
    await supabase
      .from("users")
      .update({
        company_name: companyName.trim() || "My Workspace",
        website_url:  normaliseUrl(websiteUrl),
      })
      .eq("id", userId);
  }

  async function persistAnalytics() {
    if (!userId) return;
    await supabase
      .from("users")
      .update({
        ga4_property_id: ga4Id.trim() || null,
        gsc_site_url:    gscUrl.trim() || null,
      })
      .eq("id", userId);
  }

  async function persistCompetitors() {
    if (!userId) return;
    const urls = competitors
      .map(u => u.trim())
      .filter(Boolean)
      .map(normaliseUrl);
    if (!urls.length) return;
    // Replace existing competitor list with what we have here.
    await supabase.from("competitors").delete().eq("user_id", userId);
    if (urls.length) {
      // `as never` matches the project convention for array inserts under
      // postgrest v12 strict typing — see app/keywords/page.tsx for the same.
      await supabase.from("competitors").insert(
        urls.map(u => ({
          user_id:        userId,
          competitor_url: u,
          domain:         hostFor(u),
        })) as never,
      );
    }
  }

  async function kickoffFirstAudit() {
    // Fire and forget — the dashboard picks up the latest audit row.
    if (!websiteUrl) return;
    try {
      await fetch("/api/site-audit", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ domain: hostFor(websiteUrl) }),
      });
    } catch { /* swallow — user can re-run from the audit page */ }
  }

  async function finish() {
    if (!userId) return;
    setBusy(true);
    await persistDomain();
    await persistAnalytics();
    await persistCompetitors();
    await supabase
      .from("users")
      .update({ onboarding_complete: true })
      .eq("id", userId);
    void kickoffFirstAudit();
    router.replace("/dashboard");
  }

  async function next() {
    if (busy) return;
    setBusy(true);
    try {
      if (step.id === "domain")      await persistDomain();
      if (step.id === "analytics")   await persistAnalytics();
      if (step.id === "competitors") await persistCompetitors();
      if (isLast) { await finish(); return; }
      setStepIdx(i => i + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight:      "100vh",
        background:     "var(--bg)",
        color:          "var(--text-primary)",
        display:        "flex",
        alignItems:     "stretch",
        justifyContent: "center",
        padding:        "48px 24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 640 }}>
        <Stepper activeIdx={stepIdx} />

        <div
          style={{
            marginTop:    32,
            padding:      "40px 36px",
            background:   "var(--surface)",
            border:       "1px solid var(--border)",
            borderRadius: "var(--radius-2xl)",
            boxShadow:    "var(--shadow-card)",
          }}
        >
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
              Step {stepIdx + 1} of {STEPS.length}
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, lineHeight: 1.15, margin: 0 }}>
              {step.title}
            </h1>
            <p style={{ color: "var(--text-secondary)", margin: "8px 0 0", fontSize: 15 }}>
              {step.subtitle}
            </p>
          </div>

          {step.id === "welcome"     && <WelcomeStep />}
          {step.id === "domain"      && <DomainStep
            companyName={companyName} setCompanyName={setCompanyName}
            websiteUrl={websiteUrl}   setWebsiteUrl={setWebsiteUrl} />}
          {step.id === "analytics"   && <AnalyticsStep
            ga4Id={ga4Id}   setGa4Id={setGa4Id}
            gscUrl={gscUrl} setGscUrl={setGscUrl} />}
          {step.id === "competitors" && <CompetitorsStep
            competitors={competitors} setCompetitors={setCompetitors} />}
          {step.id === "audit"       && <AuditStep websiteUrl={websiteUrl} />}

          <div
            style={{
              marginTop:      32,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              gap:            12,
            }}
          >
            <button
              onClick={() => setStepIdx(i => Math.max(0, i - 1))}
              disabled={stepIdx === 0 || busy}
              style={btnGhost(stepIdx === 0)}
            >
              Back
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              {!isLast && step.id !== "welcome" && (
                <button onClick={() => setStepIdx(i => i + 1)} disabled={busy} style={btnGhost(false)}>
                  Skip for now
                </button>
              )}
              <button onClick={next} disabled={busy || !canAdvance(step.id, { websiteUrl })} style={btnPrimary(busy)}>
                {busy
                  ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Working…</>
                  : isLast ? <>Finish <Check size={14} /></>
                  : <>Continue <ArrowRight size={14} /></>}
              </button>
            </div>
          </div>
        </div>

        <p style={{ color: "var(--text-tertiary)", fontSize: 12, textAlign: "center", marginTop: 18 }}>
          You can change any of this later from{" "}
          <a href="/settings" style={{ color: "var(--text-secondary)" }}>Settings</a>.
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function WelcomeStep() {
  const items = [
    { icon: Globe2,     text: "Tell us about your site"           },
    { icon: BarChart3,  text: "Connect GA4 & Search Console"      },
    { icon: UsersIcon,  text: "Add a couple of competitors"        },
    { icon: Sparkles,   text: "Run your first SEO audit"            },
  ];
  return (
    <div>
      <p style={{ color: "var(--text-secondary)", fontSize: 15, lineHeight: 1.6, marginTop: 0 }}>
        AI Marketing Lab is a unified SEO + AI-search analytics workspace. We&rsquo;ll
        get you set up in under a minute. Anything you skip can be configured later.
      </p>
      <div
        style={{
          marginTop:    20,
          display:      "grid",
          gap:          10,
          padding:      "16px 18px",
          background:   "var(--surface-2)",
          borderRadius: "var(--radius-md)",
          border:       "1px solid var(--border)",
        }}
      >
        {items.map(({ icon: Icon, text }, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-secondary)", fontSize: 14 }}>
            <span style={{
              width: 26, height: 26, borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(var(--brand-rgb), 0.12)", color: "var(--brand)",
            }}>
              <Icon size={14} />
            </span>
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}

function DomainStep({
  companyName, setCompanyName, websiteUrl, setWebsiteUrl,
}: {
  companyName: string; setCompanyName: (v: string) => void;
  websiteUrl: string;  setWebsiteUrl: (v: string) => void;
}) {
  return (
    <div>
      <Field label="Company / brand name">
        <Input value={companyName} onChange={setCompanyName} placeholder="Atlas Bakery" />
      </Field>
      <Field label="Website URL" required>
        <Input value={websiteUrl} onChange={setWebsiteUrl} placeholder="https://atlasbakery.co.uk" />
      </Field>
      <p style={{ color: "var(--text-tertiary)", fontSize: 12, margin: 0 }}>
        We track this domain across keyword rankings, AI citations, and the technical audit.
      </p>
    </div>
  );
}

function AnalyticsStep({
  ga4Id, setGa4Id, gscUrl, setGscUrl,
}: {
  ga4Id: string;   setGa4Id: (v: string) => void;
  gscUrl: string;  setGscUrl: (v: string) => void;
}) {
  return (
    <div>
      <Field
        label="GA4 property ID"
        hint="Find it in Google Analytics → Admin → Property settings. Looks like 123456789."
      >
        <Input value={ga4Id} onChange={setGa4Id} placeholder="123456789" />
      </Field>
      <Field
        label="Search Console site"
        hint='For domain properties, prefix with "sc-domain:" (e.g. sc-domain:atlasbakery.co.uk).'
      >
        <Input value={gscUrl} onChange={setGscUrl} placeholder="sc-domain:atlasbakery.co.uk" />
      </Field>
      <div
        style={{
          marginTop:    14,
          padding:      "12px 14px",
          background:   "rgba(var(--brand-rgb), 0.07)",
          border:       "1px solid rgba(var(--brand-rgb), 0.2)",
          borderRadius: "var(--radius-md)",
          color:        "var(--text-secondary)",
          fontSize:     13,
        }}
      >
        You&rsquo;ll need to grant our service account read access to these properties.
        We&rsquo;ll show you how on the dashboard. Skip for now if you&rsquo;d rather do
        it later — the rest of the app still works.
      </div>
    </div>
  );
}

function CompetitorsStep({
  competitors, setCompetitors,
}: {
  competitors: string[]; setCompetitors: (v: string[]) => void;
}) {
  function update(i: number, val: string) {
    const next = [...competitors]; next[i] = val; setCompetitors(next);
  }
  function add() {
    if (competitors.length >= 5) return;
    setCompetitors([...competitors, ""]);
  }
  function remove(i: number) {
    const next = competitors.filter((_, idx) => idx !== i);
    setCompetitors(next.length ? next : [""]);
  }
  return (
    <div>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 0 }}>
        Add up to 5 competitors so we can compare keyword overlap, content gaps, and
        share of voice. You can add more later.
      </p>
      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        {competitors.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Input value={c} onChange={(v) => update(i, v)} placeholder="https://competitor.co.uk" />
            <button
              onClick={() => remove(i)}
              aria-label="Remove"
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 8, color: "var(--text-tertiary)",
                width: 36, height: 36, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      {competitors.length < 5 && (
        <button
          onClick={add}
          style={{
            marginTop: 12,
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "transparent", border: "1px dashed var(--border-strong)",
            borderRadius: 8, color: "var(--text-secondary)",
            padding: "8px 12px", fontSize: 13, cursor: "pointer",
          }}
        >
          <Plus size={14} /> Add competitor
        </button>
      )}
    </div>
  );
}

function AuditStep({ websiteUrl }: { websiteUrl: string }) {
  return (
    <div>
      <p style={{ color: "var(--text-secondary)", fontSize: 15, lineHeight: 1.6, marginTop: 0 }}>
        We&rsquo;re ready to run your first technical SEO audit on{" "}
        <strong style={{ color: "var(--text-primary)" }}>{hostFor(websiteUrl) || "your domain"}</strong>.
        It checks meta tags, headings, broken links, schema, and Core Web Vitals.
      </p>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
        The audit runs in the background while you explore the dashboard. You&rsquo;ll
        see results in the Site Audit panel within ~60 seconds.
      </p>
      <div
        style={{
          marginTop:    16,
          padding:      "16px 18px",
          background:   "var(--surface-2)",
          border:       "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          fontSize:     13,
          color:        "var(--text-secondary)",
          display:      "flex", alignItems: "center", gap: 10,
        }}
      >
        <Search size={16} /> Click <strong style={{ color: "var(--text-primary)" }}>Finish</strong> to start the audit and open your dashboard.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stepper / shared
// ---------------------------------------------------------------------------

function Stepper({ activeIdx }: { activeIdx: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
      {STEPS.map((_, i) => {
        const done = i < activeIdx, active = i === activeIdx;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center" }}>
            <span
              style={{
                width: active ? 28 : 8, height: 8, borderRadius: 4,
                background: done ? "var(--brand)" : active ? "var(--brand)" : "var(--border-strong)",
                transition: "all 0.25s var(--ease-expo)",
              }}
            />
            {i < STEPS.length - 1 && <span style={{ width: 4 }} />}
          </div>
        );
      })}
    </div>
  );
}

function Field({
  label, children, hint, required,
}: {
  label: string; children: React.ReactNode; hint?: string; required?: boolean;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{
        display: "block", fontFamily: "var(--font-mono)", fontSize: 10,
        letterSpacing: "0.1em", textTransform: "uppercase",
        color: "var(--text-tertiary)", marginBottom: 7,
      }}>
        {label}{required && <span style={{ color: "var(--brand)", marginLeft: 4 }}>*</span>}
      </label>
      {children}
      {hint && (
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6, lineHeight: 1.5 }}>{hint}</div>
      )}
    </div>
  );
}

function Input({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", padding: "11px 14px", background: "var(--card)",
        border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)",
        fontSize: 14, outline: "none", boxSizing: "border-box",
      }}
      onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
      onBlur={e => e.currentTarget.style.borderColor = "var(--border)"}
    />
  );
}

function btnPrimary(busy: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 8,
    padding: "10px 18px", borderRadius: "var(--radius-pill)",
    background: "var(--brand)", color: "#fff", border: "none",
    fontSize: 14, fontWeight: 500, cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.7 : 1,
  };
}

function btnGhost(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 16px", borderRadius: "var(--radius-pill)",
    background: "transparent", color: "var(--text-secondary)",
    border: "1px solid var(--border-strong)",
    fontSize: 14, fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function canAdvance(stepId: StepId, ctx: { websiteUrl: string }) {
  if (stepId === "domain") return Boolean(ctx.websiteUrl.trim());
  return true;
}

function normaliseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function hostFor(input: string): string {
  if (!input) return "";
  try {
    return new URL(normaliseUrl(input)).hostname.replace(/^www\./, "");
  } catch {
    return input.replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0];
  }
}
