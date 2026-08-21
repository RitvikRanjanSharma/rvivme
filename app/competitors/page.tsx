"use client";

// app/competitors/page.tsx
// =============================================================================
// AI Marketing Lab — Competitor Intelligence
//
// WHAT CHANGED AND WHY
//
// This page used to show Authority, Traffic/mo, Keywords, Overlap %, a threat
// badge and a trend arrow. The data behind all six came from DataForSEO, which
// is switched off, so every competitor rendered 0 / 0 / 0 / 0% / LOW / falling.
//
// Not one of those was a measurement. A reader has no way to tell a measured
// zero from a missing one, so the page was quietly asserting that every
// competitor had no traffic, no keywords and no overlap — and then grading the
// threat as low on the strength of it. The trend arrow was computed from a
// domain authority we never fetched.
//
// Everything on this page now comes from fetching the competitor's own site,
// and every figure can be checked by the reader in under a minute. Where we
// don't know, the cell says "—" and the row says why. The metrics that cannot
// be observed from outside a website are named at the bottom of the page with
// the reason, rather than shown as zero or silently dropped.
//
// The user's own site is measured with the same code and pinned as the first
// row, because "43 vs your 61" is a competitive fact and "43" on its own is
// trivia.
// =============================================================================

import { Fragment, useState, useEffect, useCallback, useRef } from "react";
import { BRAND_DEFAULT } from "@/app/ui/app-shell";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe2, ExternalLink, AlertTriangle, Plus, RefreshCw, Sparkles,
  X, ChevronDown, Check, Minus, ArrowDown, HelpCircle, Info,
} from "lucide-react";
import { useDomain } from "@/lib/useDomain";
import { supabase } from "@/lib/supabase";
import {
  compareSites, describeMeasure, toOrigin, domainOf, UNMEASURABLE,
  type SiteMeasure, type Comparison, type MetricRow,
} from "@/lib/competitor-compare";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

type RowState = "queued" | "measuring" | "done" | "failed";

type Row = {
  domain:     string;
  url:        string;
  /** Where this competitor came from. Displayed, never inferred. */
  source:     "manual" | "ai_named";
  reason?:    string;
  state:      RowState;
  measure:    SiteMeasure | null;
  comparison: Comparison | null;
  message?:   string;
};

// ─── Small presentational pieces ─────────────────────────────────────────────

function VerdictMark({ v }: { v: MetricRow["verdict"] }) {
  if (v === "ahead")  return <Check size={12} color="var(--signal-green)" />;
  if (v === "behind") return <ArrowDown size={12} color="var(--signal-amber)" />;
  if (v === "level")  return <Minus size={12} color="var(--text-tertiary)" />;
  return <HelpCircle size={12} color="var(--text-tertiary)" />;
}

function Cell({ text, verdict }: { text: string; verdict?: MetricRow["verdict"] }) {
  // "—" is the only thing an unknown ever renders as. The old page printed 0
  // here, which is a different claim entirely.
  const unknown = text === "—";
  return (
    <span
      title={unknown ? "Not measured — see the row for why" : undefined}
      style={{
        fontFamily: "var(--font-mono)", fontSize: "12px",
        color: unknown ? "var(--text-tertiary)"
             : verdict === "behind" ? "var(--signal-amber)"
             : "var(--text-primary)",
      }}
    >
      {text}
    </span>
  );
}

function SourceTag({ source, brand }: { source: Row["source"]; brand: string }) {
  const isAi = source === "ai_named";
  return (
    <span
      title={isAi
        ? "Named by an AI model as an alternative to you, then checked to confirm the site actually exists. Not derived from search ranking data."
        : "You added this one."}
      style={{
        fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.08em",
        padding: "1px 5px", borderRadius: "100px",
        color:      isAi ? brand : "var(--text-tertiary)",
        background: isAi ? `rgba(var(--brand-rgb),0.08)` : "var(--muted)",
        border:     `1px solid ${isAi ? `rgba(var(--brand-rgb),0.20)` : "var(--border)"}`,
      }}
    >
      {isAi ? "NAMED BY AI" : "ADDED BY YOU"}
    </span>
  );
}

const TH: React.CSSProperties = {
  padding: "10px 14px", textAlign: "left", fontFamily: "var(--font-mono)",
  fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.1em",
  textTransform: "uppercase", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};

const COLUMNS = [
  { key: "answerScore",       label: "Answer-ready" },
  { key: "pagesInSitemap",    label: "Pages" },
  { key: "wordCount",         label: "Homepage words" },
  { key: "answerBotsAllowed", label: "AI engines allowed" },
  { key: "schemaTypes",       label: "Schema" },
] as const;

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CompetitorsPage() {
  const { domain, loading: domainLoading } = useDomain();
  const [brandColor, setBrandColor] = useState(BRAND_DEFAULT);

  const [you,      setYou]      = useState<SiteMeasure | null>(null);
  const [youState, setYouState] = useState<RowState>("queued");
  // Why the baseline failed. measureSite has always produced this and the row
  // threw it away, leaving "couldn't reach your site" with no way to act on it.
  const [youError, setYouError] = useState<string | null>(null);
  const [rows,     setRows]     = useState<Row[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [showAdd,   setShowAdd]   = useState(false);
  const [addUrl,    setAddUrl]    = useState("");
  const [adding,    setAdding]    = useState(false);
  const [addError,  setAddError]  = useState<string | null>(null);

  const [discovering, setDiscovering] = useState(false);
  const [discoverNote, setDiscoverNote] = useState<string | null>(null);

  // Guards against a slow measurement from a previous domain landing after the
  // user has already switched to another one.
  const runId = useRef(0);

  useEffect(() => {
    const b = localStorage.getItem("aiml-brand") || localStorage.getItem("rvivme-brand");
    if (b) setBrandColor(b);
  }, []);

  const measure = useCallback(async (d: string): Promise<{ measure: SiteMeasure | null; message: string | null }> => {
    try {
      const res = await fetch("/api/competitors/measure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: d }),
      });
      const j = await res.json();
      if (!j?.success) return { measure: null, message: j?.message ?? "That site couldn't be measured." };
      return { measure: j.measure as SiteMeasure, message: j.message ?? null };
    } catch (e) {
      return { measure: null, message: e instanceof Error ? e.message : "Request failed." };
    }
  }, []);

  const load = useCallback(async () => {
    if (domainLoading) return;
    const id = ++runId.current;

    setLoading(true);
    setError(null);
    setYou(null);
    setYouError(null);
    setYouState(domain ? "measuring" : "failed");

    // 1. Saved competitors.
    let saved: Array<{ competitor_url: string; discovered_via_ai: boolean; notes: string | null }> = [];
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("competitors")
          .select("competitor_url, discovered_via_ai, notes")
          .eq("user_id", user.id)
          .eq("is_active", true);
        saved = (data ?? []) as typeof saved;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your saved competitors.");
    }

    if (id !== runId.current) return;

    const initial: Row[] = saved.map(s => ({
      domain: domainOf(s.competitor_url),
      url:    s.competitor_url,
      source: s.discovered_via_ai ? "ai_named" : "manual",
      reason: s.notes ?? undefined,
      state:  "measuring",
      measure: null,
      comparison: null,
    }));
    setRows(initial);
    setLoading(false);

    // 2. Your own site, then every competitor — all in flight together. The
    //    baseline is not a prerequisite for fetching, only for comparing, so
    //    there is no reason to serialise them.
    const yourPromise = domain
      ? measure(domain)
      : Promise.resolve({ measure: null, message: null });

    const theirPromises = initial.map(r => measure(r.domain));

    const yourResult = await yourPromise;
    if (id !== runId.current) return;
    setYou(yourResult.measure);
    setYouState(yourResult.measure?.reachable ? "done" : "failed");
    setYouError(yourResult.measure?.reachable
      ? null
      : (yourResult.measure?.error ?? yourResult.message ?? null));

    await Promise.all(theirPromises.map(async (p, i) => {
      const { measure: m, message } = await p;
      if (id !== runId.current) return;
      setRows(prev => {
        const next = [...prev];
        if (!next[i]) return prev;
        next[i] = {
          ...next[i],
          state:      m?.reachable ? "done" : "failed",
          measure:    m,
          message:    message ?? undefined,
          comparison: m?.reachable && yourResult.measure?.reachable
            ? compareSites(yourResult.measure, m)
            : null,
        };
        return next;
      });
    }));
  }, [domain, domainLoading, measure]);

  useEffect(() => { load(); }, [load]);

  // ── Add ──────────────────────────────────────────────────────────────────
  async function handleAdd() {
    const origin = toOrigin(addUrl);
    if (!origin) { setAddError("That doesn't look like a domain. Try example.co.uk"); return; }
    const d = domainOf(origin);
    if (d === domain) { setAddError("That's your own site."); return; }
    if (rows.some(r => r.domain === d)) { setAddError("Already tracking that one."); return; }

    setAdding(true); setAddError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in — can't save this competitor.");

      const { data, error: upErr } = await supabase.from("competitors").upsert({
        user_id: user.id, competitor_url: origin, is_active: true, discovered_via_ai: false,
      } as never, { onConflict: "user_id,competitor_url" }).select("id");
      if (upErr) throw new Error(upErr.message);
      // PostgREST reports an UPDATE matching zero rows as success. Checking the
      // returned rows is the only way to know the write landed.
      if (!data || data.length === 0) throw new Error("The competitor didn't save. Check your profile is set up in Settings.");

      setRows(prev => [
        { domain: d, url: origin, source: "manual", state: "measuring", measure: null, comparison: null },
        ...prev,
      ]);
      setAddUrl(""); setShowAdd(false);

      const { measure: m, message } = await measure(d);
      setRows(prev => prev.map(r => r.domain === d ? {
        ...r,
        state:   m?.reachable ? "done" : "failed",
        measure: m, message: message ?? undefined,
        comparison: m?.reachable && you?.reachable ? compareSites(you, m) : null,
      } : r));
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Couldn't add that competitor.");
    } finally {
      setAdding(false);
    }
  }

  // ── Discover ─────────────────────────────────────────────────────────────
  async function handleDiscover() {
    if (!domain) return;
    setDiscovering(true); setError(null); setDiscoverNote(null);
    try {
      const res = await fetch("/api/competitors/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, exclude: rows.map(r => r.domain) }),
      });
      const j = await res.json();
      if (!j?.success) { setError(j?.message ?? "Couldn't work out who you compete with."); return; }

      const found = (j.competitors ?? []) as Array<{ domain: string; reason: string }>;
      if (found.length === 0) {
        setDiscoverNote("Nothing new came back that we could verify. Add competitors manually if you know them.");
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("competitors").upsert(
          found.map(f => ({
            user_id: user.id, competitor_url: `https://${f.domain}`,
            is_active: true, discovered_via_ai: true, notes: f.reason,
          })) as never,
          { onConflict: "user_id,competitor_url" },
        ).select("id");
      }

      const newRows: Row[] = found.map(f => ({
        domain: f.domain, url: `https://${f.domain}`, source: "ai_named",
        reason: f.reason, state: "measuring", measure: null, comparison: null,
      }));
      setRows(prev => [...prev, ...newRows]);

      setDiscoverNote(
        j.dropped > 0
          ? `${found.length} verified. ${j.dropped} more were named but their sites didn't respond, so they were dropped.`
          : `${found.length} named and verified reachable.`
      );

      await Promise.all(newRows.map(async nr => {
        const { measure: m, message } = await measure(nr.domain);
        setRows(prev => prev.map(r => r.domain === nr.domain ? {
          ...r,
          state: m?.reachable ? "done" : "failed",
          measure: m, message: message ?? undefined,
          comparison: m?.reachable && you?.reachable ? compareSites(you, m) : null,
        } : r));
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discovery failed.");
    } finally {
      setDiscovering(false);
    }
  }

  async function handleRemove(d: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("competitors").update({ is_active: false } as never)
        .eq("user_id", user.id).eq("domain", d).select("id");
    }
    setRows(prev => prev.filter(r => r.domain !== d));
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const measured  = rows.filter(r => r.state === "done");
  const behindAny = measured.filter(r => (r.comparison?.behindOn ?? 0) > 0).length;
  const unreached = rows.filter(r => r.state === "failed").length;

  const noDomain = !domainLoading && !domain;

  return (
    <div className="aiml-page-pad" style={{ background: "var(--bg)", minHeight: "100vh", padding: "32px 24px 80px", maxWidth: "1280px", margin: "0 auto" }}>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE_EXPO }}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "10px", flexWrap: "wrap", gap: "12px" }}
      >
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem,3.5vw,2.8rem)", letterSpacing: "-0.04em", lineHeight: 1, fontWeight: 400, color: "var(--text-primary)", marginBottom: "6px" }}>
            Competitor Intelligence
          </h1>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
            {domainLoading ? "LOADING…" : domain ? `COMPARED AGAINST ${domain.toUpperCase()}` : "NO SITE SET"}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={handleDiscover} disabled={discovering || !domain}
            style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500, color: "#fff", background: (discovering || !domain) ? "var(--muted)" : brandColor, border: "none", borderRadius: "8px", padding: "10px 18px", cursor: (discovering || !domain) ? "not-allowed" : "pointer" }}
          >
            <Sparkles size={13} /> {discovering ? "Looking…" : "Find competitors"}
          </button>
          <button onClick={() => { setShowAdd(true); setAddError(null); }}
            style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-primary)", background: "transparent", border: "1px solid var(--border-strong)", borderRadius: "8px", padding: "10px 16px", cursor: "pointer" }}
          >
            <Plus size={13} /> Add
          </button>
          <button onClick={load} disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-secondary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 14px", cursor: "pointer", letterSpacing: "0.06em" }}>
            <RefreshCw size={11} style={{ animation: loading ? "spin 0.7s linear infinite" : "none" }} /> REFRESH
          </button>
        </div>
      </motion.div>

      <p style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)", maxWidth: "620px", marginBottom: "24px", lineHeight: 1.5 }}>
        Every figure below is read from the competitor&rsquo;s own live site — their homepage, their robots.txt, their sitemap.
        Nothing is estimated, and you can verify any of it yourself.
      </p>

      {/* No site set */}
      {noDomain && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 16px", background: "rgba(255,171,0,0.08)", border: "1px solid rgba(255,171,0,0.25)", borderRadius: "10px", marginBottom: "16px" }}>
          <AlertTriangle size={14} color="var(--signal-amber)" />
          <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--signal-amber)" }}>
            Set your website in Settings and we can compare competitors against it. Until then you can still measure them individually.
          </span>
        </div>
      )}

      {/* Errors / notes */}
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", background: "rgba(255,171,0,0.08)", border: "1px solid rgba(255,171,0,0.25)", borderRadius: "10px", marginBottom: "16px" }}>
          <AlertTriangle size={14} color="var(--signal-amber)" />
          <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--signal-amber)" }}>{error}</span>
        </div>
      )}
      {discoverNote && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "10px", marginBottom: "16px" }}>
          <Info size={14} color="var(--text-tertiary)" />
          <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)" }}>{discoverNote}</span>
        </div>
      )}

      {/* Summary — counts of things we actually established */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px,1fr))", gap: "12px", marginBottom: "24px" }}>
        <Kpi label="Competitors tracked" value={rows.length} color={brandColor} />
        <Kpi label="Measured successfully" value={measured.length} color="var(--text-primary)" />
        <Kpi
          label="Beating you on something"
          value={you?.reachable ? behindAny : "—"}
          color={behindAny > 0 ? "var(--signal-amber)" : "var(--text-primary)"}
          hint={you?.reachable ? undefined : "Needs your own site measured first"}
        />
        <Kpi label="Couldn't be reached" value={unreached} color={unreached > 0 ? "var(--text-tertiary)" : "var(--text-primary)"} />
      </div>

      {/* Add modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
            onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}
          >
            <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}
              style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "14px", padding: "28px", width: "100%", maxWidth: "440px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", letterSpacing: "-0.03em", fontWeight: 400, color: "var(--text-primary)" }}>Add competitor</h3>
                <button onClick={() => setShowAdd(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex" }}><X size={16} /></button>
              </div>
              <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "8px" }}>Domain</label>
              <input value={addUrl} onChange={e => { setAddUrl(e.target.value); setAddError(null); }}
                onKeyDown={e => { if (e.key === "Enter" && !adding) handleAdd(); }}
                placeholder="competitor.co.uk" autoFocus
                style={{ width: "100%", padding: "11px 14px", fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-primary)", background: "var(--card)", border: `1px solid ${addError ? "var(--signal-red)" : "var(--border-strong)"}`, borderRadius: "8px", outline: "none", marginBottom: addError ? "8px" : "16px", boxSizing: "border-box" }}
              />
              {addError && (
                <div style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--signal-red)", marginBottom: "14px" }}>{addError}</div>
              )}
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={handleAdd} disabled={adding || !addUrl.trim()}
                  style={{ flex: 1, padding: "11px", fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 500, color: "#fff", background: adding ? "var(--muted)" : brandColor, border: "none", borderRadius: "8px", cursor: "pointer" }}>
                  {adding ? "Measuring…" : "Add and measure"}
                </button>
                <button onClick={() => setShowAdd(false)}
                  style={{ padding: "11px 18px", fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-secondary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden", marginBottom: "20px" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "880px" }}>
            <thead>
              <tr>
                <th style={TH}>Site</th>
                {COLUMNS.map(c => <th key={c.key} style={TH}>{c.label}</th>)}
                <th style={TH} />
              </tr>
            </thead>
            <tbody>

              {/* Your own site, measured with the same code. */}
              <tr style={{ background: "var(--muted)" }}>
                <td style={{ padding: "14px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: `rgba(var(--brand-rgb),0.10)`, border: `1px solid rgba(var(--brand-rgb),0.25)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Globe2 size={14} color={brandColor} />
                    </div>
                    <div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {domain || "Your site"}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: brandColor, letterSpacing: "0.08em" }}>
                        {youState === "measuring" ? "MEASURING…" : youState === "failed" ? (domain ? "COULDN'T REACH YOUR SITE" : "SET YOUR SITE IN SETTINGS") : "YOU — BASELINE"}
                      </div>
                      {youState === "failed" && youError && (
                        // The actual cause, in the row it belongs to. A verdict
                        // without a reason is something the reader can only
                        // believe or ignore, not fix.
                        <div style={{ fontFamily: "var(--font-body)", fontSize: "11.5px", color: "var(--text-tertiary)", marginTop: "3px", maxWidth: "460px", lineHeight: 1.45 }}>
                          {youError}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                {COLUMNS.map(c => (
                  <td key={c.key} style={{ padding: "14px", borderBottom: "1px solid var(--border)" }}>
                    <Cell text={you?.reachable ? (describeMeasure(you).find(m => m.key === c.key)?.text ?? "—") : "—"} />
                  </td>
                ))}
                <td style={{ padding: "14px", borderBottom: "1px solid var(--border)" }} />
              </tr>

              {/* Competitors */}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={COLUMNS.length + 2} style={{ padding: "48px 32px", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-secondary)", marginBottom: "6px" }}>
                      No competitors yet.
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-tertiary)", maxWidth: "440px", margin: "0 auto" }}>
                      Press <strong style={{ color: "var(--text-secondary)" }}>Find competitors</strong> to see who an AI assistant names as an alternative to you — or add the ones you already know about.
                    </div>
                  </td>
                </tr>
              )}

              {rows.map((r, i) => {
                const last  = i === rows.length - 1;
                const bb    = last && expanded !== r.domain ? "none" : "1px solid var(--border)";
                const isOpen = expanded === r.domain;
                return (
                  <Fragment key={r.domain}>
                    <motion.tr
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
                      onClick={() => setExpanded(isOpen ? null : r.domain)}
                      style={{ cursor: "pointer" }}
                    >
                      <td style={{ padding: "14px", borderBottom: bb }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "var(--card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {r.state === "measuring"
                              ? <div style={{ width: "12px", height: "12px", border: "2px solid var(--border)", borderTopColor: brandColor, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                              : <Globe2 size={14} color="var(--text-tertiary)" />}
                          </div>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{r.domain}</span>
                              <ChevronDown size={11} color="var(--text-tertiary)" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.16s" }} />
                            </div>
                            <div style={{ display: "flex", gap: "5px", marginTop: "3px", alignItems: "center" }}>
                              <SourceTag source={r.source} brand={brandColor} />
                              {r.state === "failed" && (
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
                                  NOT REACHABLE
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {COLUMNS.map(c => {
                        const m = r.comparison?.metrics.find(x => x.key === c.key);
                        // No comparison (their site down, or ours unknown) still
                        // shows their own measured value where we have one.
                        const fallback = r.measure?.reachable
                          ? (describeMeasure(r.measure).find(x => x.key === c.key)?.text ?? "—")
                          : "—";
                        return (
                          <td key={c.key} style={{ padding: "14px", borderBottom: bb }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              {m && <VerdictMark v={m.verdict} />}
                              <Cell text={m?.themText ?? fallback} verdict={m?.verdict} />
                            </div>
                          </td>
                        );
                      })}

                      <td style={{ padding: "14px", borderBottom: bb }}>
                        <div style={{ display: "flex", gap: "6px" }} onClick={e => e.stopPropagation()}>
                          <a href={r.url} target="_blank" rel="noopener noreferrer"
                            style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text-tertiary)", textDecoration: "none" }}>
                            <ExternalLink size={11} />
                          </a>
                          <button onClick={() => handleRemove(r.domain)}
                            style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid transparent", borderRadius: "6px", cursor: "pointer", color: "var(--text-tertiary)" }}>
                            <X size={11} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={COLUMNS.length + 2} style={{ padding: "0 14px 20px", borderBottom: last ? "none" : "1px solid var(--border)", background: "var(--card)" }}>
                          <Detail row={r} brand={brandColor} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* What we deliberately don't show */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "20px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          <Info size={13} color="var(--text-tertiary)" />
          <h3 style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            What this page doesn&rsquo;t show, and why
          </h3>
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "12px", maxWidth: "760px" }}>
          These three appear on most competitor tools. None of them can be observed by looking at a website — they are
          modelled from a licensed dataset. We would rather leave them out than show you a number we can&rsquo;t stand behind.
        </p>
        <div style={{ display: "grid", gap: "10px" }}>
          {UNMEASURABLE.map(u => (
            <div key={u.label} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.06em", minWidth: "132px", paddingTop: "2px" }}>
                {u.label.toUpperCase()}
              </span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{u.why}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Expanded row ────────────────────────────────────────────────────────────

function Detail({ row, brand }: { row: Row; brand: string }) {
  const m = row.measure;

  if (row.state === "measuring") {
    return <div style={{ padding: "18px 0", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>MEASURING…</div>;
  }

  if (!m?.reachable) {
    return (
      <div style={{ padding: "18px 0" }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)", marginBottom: "6px" }}>
          We couldn&rsquo;t fetch this site, so there is nothing measured to show.
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)" }}>
          {row.message ?? m?.error ?? "No response."}
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: "16px", display: "grid", gap: "18px" }}>

      {row.reason && (
        <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5, fontStyle: "italic" }}>
          &ldquo;{row.reason}&rdquo;
          <span style={{ fontStyle: "normal", fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)", marginLeft: "8px", letterSpacing: "0.06em" }}>
            — WHY AI NAMED THEM
          </span>
        </div>
      )}

      {/* Evidence: what their page actually says. This is the part that makes
          the numbers above checkable rather than trusted. */}
      <div style={{ display: "grid", gap: "8px" }}>
        <Evidence label="Their title"       value={m.title} />
        <Evidence label="Their description" value={m.description} />
        <Evidence label="Their H1"          value={m.h1} />
        <Evidence label="Sitemap"           value={m.sitemapUrl} mono />
        <Evidence
          label="Answer engines blocked"
          value={!m.robotsKnown ? null
               : m.answerBotsBlocked.length === 0 ? "None — all answer engines can reach them"
               : m.answerBotsBlocked.join(", ")}
        />
        <Evidence label="Schema types" value={m.schemaTypes.length ? m.schemaTypes.join(", ") : "None found"} />
      </div>

      {/* Per-metric meaning, only where we could actually compare. */}
      {row.comparison ? (
        <div style={{ display: "grid", gap: "10px" }}>
          {row.comparison.metrics.map(metric => (
            <div key={metric.key} style={{ display: "flex", gap: "10px", alignItems: "flex-start", paddingTop: "10px", borderTop: "1px solid var(--border)" }}>
              <div style={{ paddingTop: "3px" }}><VerdictMark v={metric.verdict} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-body)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>
                  {metric.label}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 400, color: "var(--text-tertiary)", marginLeft: "8px" }}>
                    you {metric.youText} · them {metric.themText}
                  </span>
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  {metric.why}
                </div>
                {metric.note && (
                  <div style={{ fontFamily: "var(--font-body)", fontSize: "12.5px", color: brand, marginTop: "5px", lineHeight: 1.5 }}>
                    {metric.note}
                  </div>
                )}
                {metric.verdict === "unknown" && (
                  <div style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-tertiary)", marginTop: "5px" }}>
                    Not compared — we couldn&rsquo;t establish this for one of the two sites.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontFamily: "var(--font-body)", fontSize: "12.5px", color: "var(--text-tertiary)", paddingTop: "10px", borderTop: "1px solid var(--border)" }}>
          Measured, but not compared — set your own website in Settings so we have something to compare against.
        </div>
      )}
    </div>
  );
}

function Evidence({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase", minWidth: "160px", paddingTop: "2px" }}>
        {label}
      </span>
      <span style={{
        fontFamily: mono ? "var(--font-mono)" : "var(--font-body)",
        fontSize: mono ? "11px" : "12.5px",
        color: value ? "var(--text-secondary)" : "var(--text-tertiary)",
        lineHeight: 1.5, wordBreak: "break-word",
      }}>
        {value ?? "— not present"}
      </span>
    </div>
  );
}

function Kpi({ label, value, color, hint }: { label: string; value: string | number; color: string; hint?: string }) {
  return (
    <div title={hint} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "20px 22px" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem,3vw,2.4rem)", letterSpacing: "-0.04em", lineHeight: 1, color, marginBottom: "6px" }}>{value}</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-secondary)" }}>{label}</div>
    </div>
  );
}
