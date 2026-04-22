"use client";

// app/competitors/page.tsx
// =============================================================================
// AI Marketing Lab — Competitor Intelligence
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
      // 1. Manually-saved competitors (Supabase)
      const { data: { user } } = await supabase.auth.getUser();
      let savedRows: Array<{ domain: string; competitor_url: string }> = [];
      if (user) {
        const { data: saved } = await supabase
          .from("competitors")
          .select("domain, competitor_url")
          .eq("user_id", user.id)
          .eq("is_active", true);
        savedRows = (saved ?? []) as Array<{ domain: string; competitor_url: string }>;
      }
      const savedDomains = savedRows.map(r => r.domain).filter(Boolean);

      // 2. AI-discovered competitors (DataForSEO). Don't throw the whole load
      //    if this fails — we still want to show saved competitors.
      let aiList: Competitor[] = [];
      let aiError: string | null = null;
      try {
        const res  = await fetch("/api/dataforseo/competitors", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ domain, limit: 10 }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? "Failed to load competitors");
        aiList = (data.competitors ?? []) as Competitor[];
      } catch (e: any) {
        aiError = e.message;
      }

      const aiDomains = new Set(aiList.map(c => c.domain));

      // 2a. Baseline for the user's own domain — we need its keyword count to
      //     compute overlap % for manually-added competitors.
      let yourKeywords = 0;
      try {
        const res  = await fetch("/api/dataforseo/domain-metrics", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ domains: [domain] }),
        });
        const data = await res.json();
        yourKeywords = data?.metrics?.[domain]?.keywords ?? 0;
      } catch {
        // Non-fatal — overlap just won't be computable for manual competitors.
      }

      // 3. Any saved competitors not already returned by DFS need their own
      //    metrics — fetch them in a single bulk call.
      const missing = savedDomains.filter(d => !aiDomains.has(d));
      const savedOnly: Competitor[] = [];
      if (missing.length > 0) {
        let metricsMap: Record<string, { domain_authority: number; monthly_traffic: number; keywords: number }> = {};
        try {
          const res  = await fetch("/api/dataforseo/domain-metrics", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ domains: missing }),
          });
          const data = await res.json();
          metricsMap = data?.metrics ?? {};
        } catch {
          // Keep metricsMap empty; each row will render with zeros.
        }

        for (const row of savedRows) {
          if (aiDomains.has(row.domain)) continue;
          const m = metricsMap[row.domain] ?? { domain_authority: 0, monthly_traffic: 0, keywords: 0 };

          // Overlap = proportion of competitor's keyword footprint that *could*
          // intersect with ours. Scaled so you don't get 99% for a giant site
          // just because they dwarf you — capped at 100.
          const overlap = yourKeywords > 0 && m.keywords > 0
            ? Math.min(100, Math.round((Math.min(m.keywords, yourKeywords * 5) / Math.max(yourKeywords, 1)) * 20))
            : 0;

          // Threat based on overlap AND raw scale — a much bigger site is a
          // threat even if our overlap calc is conservative.
          const sizeFactor = m.domain_authority;
          let threat: Competitor["threat"] = "low";
          if      (overlap > 60 || sizeFactor > 80) threat = "critical";
          else if (overlap > 40 || sizeFactor > 65) threat = "high";
          else if (overlap > 20 || sizeFactor > 45) threat = "medium";

          // Trend: without time-series data we default to "up" for large sites
          // (they're pulling away), "down" for tiny ones, else stable.
          const trend: Competitor["trend"] =
            sizeFactor > 60 ? "up" : sizeFactor < 20 ? "down" : "stable";

          savedOnly.push({
            domain:            row.domain,
            competitor_url:    row.competitor_url,
            domain_authority:  m.domain_authority,
            monthly_traffic:   m.monthly_traffic,
            keywords:          m.keywords,
            overlap,
            content_gap:       Math.max(0, m.keywords - yourKeywords),
            threat,
            trend,
            discovered_via_ai: false,
          });
        }
      }

      // 4. Merge: saved (manual) first, then AI-discovered. Flag correctly.
      const savedSet = new Set(savedDomains);
      const merged: Competitor[] = [
        ...savedOnly,
        ...aiList.map(c => ({ ...c, discovered_via_ai: !savedSet.has(c.domain) })),
      ];

      setCompetitors(merged);
      if (aiError && merged.length === 0) setError(aiError);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [domain, domainLoading]);

  useEffect(() => { loadCompetitors(); }, [loadCompetitors]);

  async function handleAddCompetitor() {
    if (!addUrl.trim()) return;
    setAdding(true); setError(null);
    try {
      const url     = addUrl.trim().startsWith("http") ? addUrl.trim() : `https://${addUrl.trim()}`;
      const domain2 = url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

      // Save to Supabase — onConflict lets a re-added competitor flip back to active
      // instead of tripping the UNIQUE (user_id, competitor_url) constraint.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in — can't save competitor.");

      const { error: upErr } = await supabase.from("competitors").upsert({
        user_id:        user.id,
        competitor_url: url,
        is_active:      true,
      } as never, { onConflict: "user_id,competitor_url" });
      if (upErr) throw new Error(upErr.message);

      // Fetch metrics for THIS specific domain AND the user's own domain in a
      // single bulk call so we can compute overlap without a second round-trip.
      let m = { domain_authority: 0, monthly_traffic: 0, keywords: 0 };
      let yourKw = 0;
      try {
        const res  = await fetch("/api/dataforseo/domain-metrics", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ domains: [domain2, domain] }),
        });
        const data = await res.json();
        if (data?.metrics?.[domain2]) m = data.metrics[domain2];
        yourKw = data?.metrics?.[domain]?.keywords ?? 0;
      } catch {
        // Metrics lookup is best-effort — still show the saved row.
      }

      const overlap = yourKw > 0 && m.keywords > 0
        ? Math.min(100, Math.round((Math.min(m.keywords, yourKw * 5) / Math.max(yourKw, 1)) * 20))
        : 0;

      const sizeFactor = m.domain_authority;
      let threat: Competitor["threat"] = "low";
      if      (overlap > 60 || sizeFactor > 80) threat = "critical";
      else if (overlap > 40 || sizeFactor > 65) threat = "high";
      else if (overlap > 20 || sizeFactor > 45) threat = "medium";

      const trend: Competitor["trend"] =
        sizeFactor > 60 ? "up" : sizeFactor < 20 ? "down" : "stable";

      const newComp: Competitor = {
        domain:            domain2,
        competitor_url:    url,
        domain_authority:  m.domain_authority,
        monthly_traffic:   m.monthly_traffic,
        keywords:          m.keywords,
        overlap,
        content_gap:       Math.max(0, m.keywords - yourKw),
        threat,
        trend,
        discovered_via_ai: false,
      };

      setCompetitors(prev => [newComp, ...prev.filter(c => c.domain !== domain2)]);
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
      // Match on the GENERATED `domain` column — the original competitor_url could
      // have been entered as http/https, with or without www, or a trailing slash.
      await supabase.from("competitors").update({ is_active: false } as never)
        .eq("user_id", user.id).eq("domain", domain2);
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
