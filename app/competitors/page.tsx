"use client";

// app/competitors/page.tsx
// =============================================================================
// AI Marketing Labs — Competitor Intelligence
// Live DataForSEO data · Add manual competitors · Threat analysis
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe2, TrendingUp, TrendingDown, Minus,
  ExternalLink, AlertTriangle, Plus, RefreshCw,
  Shield, BarChart3, X, ArrowUpRight,
} from "lucide-react";
import { useDomain } from "@/lib/useDomain";
import { supabase } from "@/lib/supabase";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

interface Competitor {
  id?:               string;
  domain:            string;
  competitor_url:    string;
  domain_authority:  number;
  monthly_traffic:   number;
  keywords:          number;
  overlap:           number;
  content_gap:       number;
  threat:            "low" | "medium" | "high" | "critical";
  trend:             "up" | "down" | "stable";
  discovered_via_ai: boolean;
}

function threatColor(t: string) {
  return { critical: "var(--signal-red)", high: "var(--signal-amber)", medium: "var(--brand)", low: "var(--signal-green)" }[t] ?? "var(--text-tertiary)";
}
function threatBg(t: string) {
  return { critical: "rgba(255,23,68,0.08)", high: "rgba(255,171,0,0.08)", medium: "rgba(37,99,235,0.08)", low: "rgba(0,230,118,0.08)" }[t] ?? "var(--muted)";
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "20px 22px" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem,3vw,2.4rem)", letterSpacing: "-0.04em", lineHeight: 1, color, marginBottom: "6px" }}>{value}</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-secondary)" }}>{label}</div>
    </div>
  );
}

function TrendIcon({ t }: { t: string }) {
  if (t === "up")   return <TrendingUp  size={13} color="var(--signal-green)" />;
  if (t === "down") return <TrendingDown size={13} color="var(--signal-red)" />;
  return <Minus size={13} color="var(--text-tertiary)" />;
}

export default function CompetitorsPage() {
  const { domain, loading: domainLoading } = useDomain();
  const [brandColor,  setBrandColor]  = useState("#2563eb");
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [addUrl,      setAddUrl]      = useState("");
  const [adding,      setAdding]      = useState(false);
  const [showAdd,     setShowAdd]     = useState(false);

  useEffect(() => {
    const b = localStorage.getItem("aiml-brand") || localStorage.getItem("rvivme-brand");
    if (b) setBrandColor(b);
  }, []);

  const loadCompetitors = useCallback(async () => {
    if (!domain || domainLoading) return;
    setLoading(true); setError(null);
    try {
      // First load any manually saved competitors from Supabase
      const { data: { user } } = await supabase.auth.getUser();
      let savedDomains: string[] = [];
      if (user) {
        const { data: saved } = await supabase
          .from("competitors")
          .select("domain, competitor_url")
          .eq("user_id", user.id)
          .eq("is_active", true);
        savedDomains = (saved ?? []).map((c: any) => c.domain);
      }

      // Fetch AI-discovered competitors from DataForSEO
      const res  = await fetch("/api/dataforseo/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, limit: 10 }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to load competitors");

      // Merge: mark saved ones, add any extra saved ones not in AI list
      const aiList: Competitor[] = data.competitors ?? [];
      const merged = aiList.map((c: Competitor) => ({
        ...c,
        discovered_via_ai: !savedDomains.includes(c.domain),
      }));

      setCompetitors(merged);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [domain, domainLoading]);

  useEffect(() => { loadCompetitors(); }, [loadCompetitors]);

  async function handleAddCompetitor() {
    if (!addUrl.trim()) return;
    setAdding(true);
    try {
      const url     = addUrl.trim().startsWith("http") ? addUrl.trim() : `https://${addUrl.trim()}`;
      const domain2 = url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

      // Save to Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("competitors").upsert({
          user_id:        user.id,
          competitor_url: url,
          is_active:      true,
        } as never);
      }

      // Fetch metrics for this domain
      const res  = await fetch("/api/dataforseo/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain2, limit: 1 }),
      });
      const data = await res.json();
      const newComp: Competitor = data.competitors?.[0] ?? {
        domain: domain2, competitor_url: url,
        domain_authority: 0, monthly_traffic: 0, keywords: 0,
        overlap: 0, content_gap: 0, threat: "low", trend: "stable",
        discovered_via_ai: false,
      };

      setCompetitors(prev => [{ ...newComp, discovered_via_ai: false }, ...prev.filter(c => c.domain !== domain2)]);
      setAddUrl(""); setShowAdd(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(domain2: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("competitors").update({ is_active: false } as never)
        .eq("user_id", user.id).eq("competitor_url", `https://${domain2}`);
    }
    setCompetitors(prev => prev.filter(c => c.domain !== domain2));
  }

  const critical = competitors.filter(c => c.threat === "critical").length;
  const high     = competitors.filter(c => c.threat === "high").length;
  const avgDA    = competitors.length ? Math.round(competitors.reduce((s,c) => s + c.domain_authority, 0) / competitors.length) : 0;

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "32px 24px 80px", maxWidth: "1280px", margin: "0 auto" }}>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE_EXPO }}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}
      >
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem,3.5vw,2.8rem)", letterSpacing: "-0.04em", lineHeight: 1, fontWeight: 400, color: "var(--text-primary)", marginBottom: "6px" }}>
            Competitor Intelligence
          </h1>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
            {domainLoading ? "Loading…" : `Analysing competitors of ${domain}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => setShowAdd(true)} style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500, color: "#fff", background: brandColor, border: "none", borderRadius: "8px", padding: "10px 18px", cursor: "pointer", transition: "opacity 0.16s" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
          >
            <Plus size={13} /> Add competitor
          </button>
          <button onClick={loadCompetitors} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-secondary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 14px", cursor: "pointer", letterSpacing: "0.06em" }}>
            <RefreshCw size={11} style={{ animation: loading ? "spin 0.7s linear infinite" : "none" }} /> REFRESH
          </button>
        </div>
      </motion.div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: "12px", marginBottom: "24px" }}>
        <KpiCard label="Competitors tracked"  value={competitors.length} color={brandColor} />
        <KpiCard label="Critical threats"     value={critical}           color="var(--signal-red)" />
        <KpiCard label="High threats"         value={high}               color="var(--signal-amber)" />
        <KpiCard label="Avg domain authority" value={avgDA}              color="var(--text-primary)" />
      </div>

      {/* Error */}
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", background: "rgba(255,171,0,0.08)", border: "1px solid rgba(255,171,0,0.25)", borderRadius: "10px", marginBottom: "16px" }}>
          <AlertTriangle size={14} color="var(--signal-amber)" />
          <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--signal-amber)" }}>{error}</span>
        </div>
      )}

      {/* Add competitor modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
            onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}
          >
            <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}
              style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "14px", padding: "28px", width: "100%", maxWidth: "440px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", letterSpacing: "-0.03em", fontWeight: 400, color: "var(--text-primary)" }}>Add competitor</h3>
                <button onClick={() => setShowAdd(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex" }}><X size={16} /></button>
              </div>
              <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "8px" }}>Domain or URL</label>
              <input value={addUrl} onChange={e => setAddUrl(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAddCompetitor(); }}
                placeholder="competitor.com"
                style={{ width: "100%", padding: "11px 14px", fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-primary)", background: "var(--card)", border: "1px solid var(--border-strong)", borderRadius: "8px", outline: "none", marginBottom: "16px", boxSizing: "border-box" as const }}
                onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
                onBlur={e =>  e.currentTarget.style.borderColor = "var(--border-strong)"}
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={handleAddCompetitor} disabled={adding || !addUrl.trim()} style={{ flex: 1, padding: "11px", fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 500, color: "#fff", background: adding ? "var(--muted)" : brandColor, border: "none", borderRadius: "8px", cursor: "pointer", transition: "opacity 0.16s" }}>
                  {adding ? "Adding…" : "Add competitor"}
                </button>
                <button onClick={() => setShowAdd(false)} style={{ padding: "11px 18px", fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-secondary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "60px", display: "flex", justifyContent: "center", alignItems: "center", gap: "14px", flexDirection: "column" }}>
            <div style={{ width: "20px", height: "20px", border: "2px solid var(--border)", borderTopColor: brandColor, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>
              DISCOVERING COMPETITORS FOR {domain.toUpperCase()}
            </span>
          </div>
        ) : competitors.length === 0 ? (
          <div style={{ padding: "60px 32px", textAlign: "center" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: `rgba(var(--brand-rgb),0.08)`, border: `1px solid rgba(var(--brand-rgb),0.20)`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <BarChart3 size={18} color={brandColor} />
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-secondary)", marginBottom: "6px" }}>No competitors found yet.</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-tertiary)" }}>Try refreshing or add competitors manually.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["Competitor","Authority","Traffic/mo","Keywords","Overlap","Threat","Trend",""].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {competitors.map((c, i) => (
                  <motion.tr key={c.domain}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: i * 0.05 }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--muted)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                  >
                    <td style={{ padding: "14px", borderBottom: i < competitors.length-1 ? "1px solid var(--border)":"none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "var(--card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Globe2 size={14} color="var(--text-tertiary)" />
                        </div>
                        <div>
                          <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{c.domain}</div>
                          <div style={{ display: "flex", gap: "5px", marginTop: "2px" }}>
                            {c.discovered_via_ai && (
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: brandColor, background: `rgba(var(--brand-rgb),0.08)`, border: `1px solid rgba(var(--brand-rgb),0.20)`, padding: "1px 5px", borderRadius: "100px", letterSpacing: "0.08em" }}>AI</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "14px", borderBottom: i < competitors.length-1 ? "1px solid var(--border)":"none" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>{c.domain_authority}</span>
                    </td>
                    <td style={{ padding: "14px", borderBottom: i < competitors.length-1 ? "1px solid var(--border)":"none" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)" }}>{(c.monthly_traffic || 0).toLocaleString()}</span>
                    </td>
                    <td style={{ padding: "14px", borderBottom: i < competitors.length-1 ? "1px solid var(--border)":"none" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)" }}>{(c.keywords || 0).toLocaleString()}</span>
                    </td>
                    <td style={{ padding: "14px", borderBottom: i < competitors.length-1 ? "1px solid var(--border)":"none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "48px", height: "4px", background: "var(--muted)", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${c.overlap}%`, background: brandColor, borderRadius: "2px" }} />
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-secondary)" }}>{c.overlap}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "14px", borderBottom: i < competitors.length-1 ? "1px solid var(--border)":"none" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.08em", textTransform: "uppercase", color: threatColor(c.threat), background: threatBg(c.threat), border: `1px solid ${threatColor(c.threat)}30`, padding: "3px 8px", borderRadius: "100px" }}>
                        {c.threat}
                      </span>
                    </td>
                    <td style={{ padding: "14px", borderBottom: i < competitors.length-1 ? "1px solid var(--border)":"none" }}>
                      <TrendIcon t={c.trend} />
                    </td>
                    <td style={{ padding: "14px", borderBottom: i < competitors.length-1 ? "1px solid var(--border)":"none" }}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <a href={c.competitor_url} target="_blank" rel="noopener noreferrer"
                          style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text-tertiary)", transition: "all 0.15s", textDecoration: "none" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = brandColor; (e.currentTarget as HTMLElement).style.color = brandColor; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; }}
                        >
                          <ExternalLink size={11} />
                        </a>
                        <button onClick={() => handleRemove(c.domain)}
                          style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid transparent", borderRadius: "6px", cursor: "pointer", color: "var(--text-tertiary)", transition: "all 0.15s" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,23,68,0.3)"; (e.currentTarget as HTMLElement).style.color = "var(--signal-red)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,23,68,0.08)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
