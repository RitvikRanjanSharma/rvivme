"use client";

// app/content/page.tsx
// =============================================================================
// AI Marketing Lab — Content generator
// Drafts a full post (not an outline) using Claude, then saves it to
// ai_content. Blog/article drafts can be published in-place into the existing
// blog_posts table for the public site.
//
// Supports query params:
//   ?strategy=<id>        pre-select a strategy and pull its target keywords
//   ?checklist=<id>       mark the checklist item as completed after publish
//   ?type=<blog|article|landing|social|email>   pre-select content type
//   ?draft=<id>           resume editing an existing ai_content row
// =============================================================================

import Link from "next/link";
import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  PenLine, Sparkles, Send, Save, AlertCircle, CheckCircle2,
  FileText, Layout, MessageSquare, Mail, Wand2, Target,
  Clock, Hash, Copy, Trash2, Plus, X,
} from "lucide-react";
import {
  generateDraft, saveDraft, listDrafts, getDraft, deleteDraft,
  publishDraftToBlog, autoDetectContentType,
  type ContentType, type GeneratedDraft,
} from "@/lib/content-gen";
import {
  listStrategies, getStrategyKeywords, toggleChecklistItem,
  type Strategy, type StrategyKeyword,
} from "@/lib/strategies";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

const TYPE_META: Record<ContentType, {
  label:       string;
  description: string;
  Icon:        React.ComponentType<{size?:number;color?:string}>;
  publishable: boolean;
}> = {
  blog:    { label: "Blog post",    description: "Editorial SEO post. Goes live on /blog when published.", Icon: FileText,       publishable: true  },
  article: { label: "Article",      description: "Long-form feature piece. Publishable to /blog.",         Icon: FileText,       publishable: true  },
  landing: { label: "Landing page", description: "Conversion-focused copy. Saves as a draft to reuse.",    Icon: Layout,         publishable: false },
  social:  { label: "Social thread",description: "6-10 short posts for X/LinkedIn.",                       Icon: MessageSquare,  publishable: false },
  email:   { label: "Email",        description: "Newsletter-style email with subject line.",              Icon: Mail,           publishable: false },
};

const LENGTH_OPTIONS = [
  { value: "short",  label: "Short",  hint: "~800 w"  },
  { value: "medium", label: "Medium", hint: "~1.3k w" },
  { value: "long",   label: "Long",   hint: "~2k w"   },
] as const;

const TONE_OPTIONS = [
  { value: "editorial",      label: "Editorial"      },
  { value: "technical",      label: "Technical"      },
  { value: "conversational", label: "Conversational" },
  { value: "authoritative",  label: "Authoritative"  },
] as const;

// Wrap in Suspense so useSearchParams doesn't break SSR.
export default function ContentPageRoot() {
  return (
    <Suspense fallback={<div style={{ padding: "32px 36px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Loading…</div>}>
      <ContentPage/>
    </Suspense>
  );
}

function ContentPage() {
  const qs = useSearchParams();

  const strategyId = qs.get("strategy");
  const checklistId = qs.get("checklist");
  const qType       = (qs.get("type") ?? "") as ContentType | "";
  const draftId     = qs.get("draft");

  // Core form state.
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [contentType, setContentType] = useState<ContentType | "auto">("auto");
  const [keywords,   setKeywords]   = useState<string[]>([]);
  const [kwInput,    setKwInput]    = useState("");
  const [length,     setLength]     = useState<"short"|"medium"|"long">("medium");
  const [tone,       setTone]       = useState<"editorial"|"technical"|"conversational"|"authoritative">("editorial");
  const [companyName, setCompanyName] = useState<string>("");
  const [publishDomain, setPublishDomain] = useState<string>("");
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);

  // Result / preview state.
  const [draft,         setDraft]         = useState<GeneratedDraft | null>(null);
  const [savedId,       setSavedId]       = useState<string | null>(draftId);
  const [drafts,        setDrafts]        = useState<Awaited<ReturnType<typeof listDrafts>>>([]);

  const [generating,    setGenerating]    = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [publishing,    setPublishing]    = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [info,          setInfo]          = useState<string | null>(null);

  // ── Load strategies + prefs + existing draft ──────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const list = await listStrategies();
        setStrategies(list);

        // Default strategy: query param → active → first → none.
        const resolved = strategyId
          ? list.find(s => s.id === strategyId)
          : list.find(s => s.is_active) ?? list[0];
        if (resolved) {
          setSelectedStrategyId(resolved.id);
          // Pull that strategy's keywords as a starting point.
          const ks = await getStrategyKeywords(resolved.id);
          setKeywords(ks.map((k: StrategyKeyword) => k.keyword));
        }
      } catch (e: unknown) {
        console.warn("[content] failed to load strategies", e);
      }
    })();

    // Saved prefs from settings.
    const dom = localStorage.getItem("aiml-domain") || localStorage.getItem("rvivme-domain") || "";
    const co  = localStorage.getItem("aiml-company") || "";
    if (dom || co) setCompanyName(co || dom);
    setPublishDomain(dom || "your site");

    if (qType && qType in TYPE_META) setContentType(qType as ContentType);
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [strategyId]);

  // Resume an existing draft.
  useEffect(() => {
    if (!draftId) return;
    (async () => {
      try {
        const row = await getDraft(draftId);
        const gd: GeneratedDraft = {
          contentType:     row.content_type,
          title:           row.title,
          slug:            row.slug ?? "",
          excerpt:         row.excerpt ?? "",
          metaDescription: row.meta_description ?? "",
          bodyMarkdown:    row.body_markdown,
          wordCount:       row.word_count,
          readTimeMinutes: row.read_time_minutes,
          targetKeywords:  row.target_keywords,
        };
        setDraft(gd);
        setSavedId(row.id);
        setContentType(row.content_type);
        setKeywords(row.target_keywords ?? []);
        if (row.strategy_id) setSelectedStrategyId(row.strategy_id);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Draft not found.");
      }
    })();
  }, [draftId]);

  // Load prior drafts list (filtered by strategy when one is selected).
  useEffect(() => {
    (async () => {
      try {
        const d = await listDrafts(selectedStrategyId ?? undefined);
        setDrafts(d);
      } catch { /* ignore */ }
    })();
  }, [selectedStrategyId, saving, publishing, savedId]);

  const selectedStrategy = useMemo(
    () => strategies.find(s => s.id === selectedStrategyId) ?? null,
    [strategies, selectedStrategyId],
  );

  const resolvedContentType: ContentType = contentType === "auto"
    ? autoDetectContentType(keywords)
    : contentType;

  // ── Handlers ──────────────────────────────────────────────────────────────
  function addKeyword(raw: string) {
    const v = raw.trim().replace(/^,+|,+$/g,"").toLowerCase();
    if (!v) return;
    setKeywords(xs => xs.includes(v) ? xs : [...xs, v]);
    setKwInput("");
  }
  function removeKeyword(k: string) {
    setKeywords(xs => xs.filter(x => x !== k));
  }
  function handleKwKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword(kwInput);
    } else if (e.key === "Backspace" && !kwInput && keywords.length) {
      removeKeyword(keywords[keywords.length - 1]);
    }
  }

  async function handleGenerate() {
    if (!keywords.length) { setError("Add at least one keyword."); return; }
    setGenerating(true); setError(null); setInfo(null);
    try {
      const out = await generateDraft({
        contentType:     contentType === "auto" ? undefined : contentType,
        keywords,
        strategyTitle:     selectedStrategy?.title,
        strategyRationale: selectedStrategy?.rationale,
        domain:      localStorage.getItem("aiml-domain") ?? undefined,
        companyName: companyName || undefined,
        tone,
        lengthHint:  length,
      });
      setDraft(out);
      setSavedId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true); setError(null); setInfo(null);
    try {
      const row = await saveDraft({
        draft,
        strategyId: selectedStrategyId ?? null,
        id: savedId ?? undefined,
      });
      setSavedId(row.id);
      setInfo("Draft saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!draft) { setError("Nothing to publish yet — draft some content first."); return; }
    setPublishing(true); setError(null); setInfo(null); setPublishedSlug(null);
    try {
      // Auto-save first if the user hasn't explicitly saved yet. This makes
      // Publish a true one-click action.
      let id = savedId;
      if (!id) {
        const row = await saveDraft({
          draft,
          strategyId: selectedStrategyId ?? null,
          id: undefined,
        });
        id = row.id;
        setSavedId(id);
      }
      const post = await publishDraftToBlog(id);
      // Mark linked checklist item as done if provided.
      if (checklistId) {
        try { await toggleChecklistItem(checklistId, true); } catch { /* non-fatal */ }
      }
      setPublishedSlug(post.slug);
      setInfo(`Published to /blog/${post.slug}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Publish failed.";
      // The most common publish failure is a slug collision — give a clearer hint.
      if (/duplicate key|unique/i.test(msg)) {
        setError(`Publish failed: a blog post already uses this slug. Edit the Slug field and try again.`);
      } else {
        setError(msg);
      }
    } finally {
      setPublishing(false);
    }
  }

  async function handleCopyMarkdown() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.bodyMarkdown);
      setInfo("Copied markdown to clipboard.");
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  async function handleDeleteDraft(id: string) {
    if (!confirm("Delete this draft?")) return;
    try {
      await deleteDraft(id);
      setDrafts(xs => xs.filter(d => d.id !== id));
      if (savedId === id) {
        setSavedId(null); setDraft(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  const publishable = TYPE_META[resolvedContentType].publishable;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "32px 36px 80px", maxWidth: 1280, margin: "0 auto" }}>
      <motion.header
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE_EXPO }}
        style={{ marginBottom: 24 }}
      >
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
          textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 8,
        }}>AI content studio</div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 3.4vw, 2.5rem)",
            lineHeight: 1.05, letterSpacing: "-0.03em", margin: 0, color: "var(--text-primary)",
          }}>Draft content with AI</h1>
          {selectedStrategy && (
            <Link href={`/strategies/${selectedStrategy.id}`} style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em",
              color: "var(--brand)", textDecoration: "none",
              background: "rgba(var(--brand-rgb),0.10)", border: "1px solid rgba(var(--brand-rgb),0.30)",
              borderRadius: 100, padding: "6px 14px", textTransform: "uppercase",
            }}>
              <Target size={12}/> Writing for {selectedStrategy.acronym ?? "STR"} · {selectedStrategy.title}
            </Link>
          )}
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-secondary)", marginTop: 10, maxWidth: 720 }}>
          Pick a strategy, confirm the keywords, and let the model write a full draft — not an outline. Save to iterate; publish blog and article drafts into your existing blog feed.
        </p>
      </motion.header>

      {error && <Banner kind="error"><AlertCircle size={14}/>{error}</Banner>}
      {info  && <Banner kind="info"><CheckCircle2 size={14}/>{info}</Banner>}

      <div style={{
        display: "grid", gridTemplateColumns: "minmax(340px, 420px) 1fr",
        gap: 22, alignItems: "start",
      }}>
        {/* ─── Form column ────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <Panel label="Strategy">
            {strategies.length === 0 && (
              <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)" }}>
                No strategies yet. <Link href="/dashboard" style={{ color: "var(--brand)", textDecoration: "none" }}>Generate one →</Link>
              </div>
            )}
            {strategies.length > 0 && (
              <select
                value={selectedStrategyId ?? ""}
                onChange={async (e) => {
                  const id = e.target.value || null;
                  setSelectedStrategyId(id);
                  if (id) {
                    try {
                      const ks = await getStrategyKeywords(id);
                      if (ks.length) setKeywords(ks.map(k => k.keyword));
                    } catch { /* ignore */ }
                  }
                }}
                style={{
                  width: "100%", padding: "10px 12px",
                  fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)",
                  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
                  appearance: "none",
                }}
              >
                <option value="">No strategy (freeform)</option>
                {strategies.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.is_active ? "★ " : ""}[{s.acronym ?? "STR"}] {s.title}
                  </option>
                ))}
              </select>
            )}
          </Panel>

          <Panel label="Content type" right={
            contentType === "auto" && keywords.length > 0 ? (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
                AUTO → {resolvedContentType.toUpperCase()}
              </span>
            ) : null
          }>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6,
            }}>
              <TypeButton value="auto"  selected={contentType==="auto"}  onClick={() => setContentType("auto")} label="Auto-detect" Icon={Wand2}/>
              {(Object.keys(TYPE_META) as ContentType[]).map(t => {
                const meta = TYPE_META[t];
                return (
                  <TypeButton key={t} value={t} selected={contentType===t} onClick={() => setContentType(t)} label={meta.label} Icon={meta.Icon}/>
                );
              })}
            </div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-tertiary)", margin: "10px 0 0", lineHeight: 1.5 }}>
              {contentType === "auto"
                ? "The AI picks based on your keywords: commercial intent → landing; questions → blog; otherwise article."
                : TYPE_META[contentType as ContentType].description}
            </p>
          </Panel>

          <Panel label="Keywords" right={
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
              {keywords.length} TOTAL
            </span>
          }>
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 6,
              padding: "8px", minHeight: 44,
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 8,
            }}>
              {keywords.map(k => (
                <span key={k} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "4px 8px 4px 10px",
                  background: "rgba(var(--brand-rgb),0.10)",
                  border: "1px solid rgba(var(--brand-rgb),0.30)",
                  borderRadius: 100,
                  fontFamily: "var(--font-body)", fontSize: 12, color: "var(--brand)",
                }}>
                  {k}
                  <button onClick={() => removeKeyword(k)} aria-label={`Remove ${k}`} style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: "transparent", border: "none", cursor: "pointer",
                    color: "var(--brand)", padding: 0,
                  }}>
                    <X size={12}/>
                  </button>
                </span>
              ))}
              <input
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={handleKwKeyDown}
                onBlur={() => { if (kwInput.trim()) addKeyword(kwInput); }}
                placeholder={keywords.length ? "Add another… (Enter)" : "Type a keyword, press Enter"}
                style={{
                  flex: 1, minWidth: 140,
                  border: "none", outline: "none", background: "transparent",
                  fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)",
                  padding: "4px 6px",
                }}
              />
            </div>
            {selectedStrategy && (
              <button
                onClick={async () => {
                  if (!selectedStrategyId) return;
                  try {
                    const ks = await getStrategyKeywords(selectedStrategyId);
                    setKeywords(ks.map(k => k.keyword));
                    setInfo("Keywords reset to strategy targets.");
                  } catch { /* ignore */ }
                }}
                style={{
                  marginTop: 8,
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em",
                  color: "var(--text-secondary)", background: "transparent",
                  border: "1px solid var(--border)", borderRadius: 6,
                  padding: "4px 8px", cursor: "pointer", textTransform: "uppercase",
                }}
              >
                <Plus size={10}/> Pull from strategy
              </button>
            )}
          </Panel>

          <Panel label="Length & tone">
            <div style={{ marginBottom: 14 }}>
              <MiniLabel>Length</MiniLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 6 }}>
                {LENGTH_OPTIONS.map(o => (
                  <Segmented key={o.value} selected={length === o.value} onClick={() => setLength(o.value)}>
                    <span>{o.label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-tertiary)" }}>{o.hint}</span>
                  </Segmented>
                ))}
              </div>
            </div>
            <div>
              <MiniLabel>Tone</MiniLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6, marginTop: 6 }}>
                {TONE_OPTIONS.map(o => (
                  <Segmented key={o.value} selected={tone === o.value} onClick={() => setTone(o.value)}>
                    <span>{o.label}</span>
                  </Segmented>
                ))}
              </div>
            </div>
          </Panel>

          <button
            onClick={handleGenerate}
            disabled={generating || !keywords.length}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              width: "100%",
              fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 500,
              color: "#fff", background: "var(--brand)", border: "none",
              borderRadius: 10, padding: "13px 18px",
              cursor: (generating || !keywords.length) ? "not-allowed" : "pointer",
              opacity: (generating || !keywords.length) ? 0.6 : 1,
              boxShadow: "0 0 18px var(--brand-glow)",
            }}
          >
            {generating
              ? <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/>
              : <Sparkles size={14}/>}
            {generating ? "Drafting with Claude…" : draft ? "Regenerate draft" : "Draft with AI"}
          </button>

          {drafts.length > 0 && (
            <Panel label={`Prior drafts${selectedStrategy ? ` · ${selectedStrategy.acronym ?? "STR"}` : ""}`}>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {drafts.slice(0, 8).map(d => (
                  <li key={d.id} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px", background: savedId === d.id ? "rgba(var(--brand-rgb),0.06)" : "var(--card)",
                    border: `1px solid ${savedId === d.id ? "rgba(var(--brand-rgb),0.35)" : "var(--border)"}`,
                    borderRadius: 8,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link
                        href={`/content?draft=${d.id}`}
                        style={{
                          fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)",
                          fontWeight: 500, textDecoration: "none",
                          display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                        {d.title}
                      </Link>
                      <div style={{
                        display: "flex", gap: 8, marginTop: 2,
                        fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-tertiary)",
                        letterSpacing: "0.08em", textTransform: "uppercase",
                      }}>
                        <span>{d.content_type}</span>
                        <span>·</span>
                        <span>{d.status}</span>
                        <span>·</span>
                        <span>{d.word_count} w</span>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteDraft(d.id)} title="Delete" aria-label="Delete draft" style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
                      padding: 4, cursor: "pointer", color: "var(--text-tertiary)",
                    }}>
                      <Trash2 size={11}/>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        {/* ─── Preview column ─────────────────────────────────────────────── */}
        <div>
          <AnimatePresence mode="wait">
            {!draft && !generating && (
              <motion.div key="empty"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE_EXPO }}
                style={{
                  padding: "80px 40px", textAlign: "center",
                  background: "var(--surface)", border: "1px dashed var(--border)",
                  borderRadius: 16,
                }}>
                <PenLine size={28} color="var(--text-tertiary)" style={{ marginBottom: 14 }}/>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "var(--text-primary)", marginBottom: 6 }}>
                  Your draft will appear here.
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)", maxWidth: 420, margin: "0 auto" }}>
                  Confirm the strategy, keywords, length, and tone. Then hit draft — the model returns a full piece, not an outline.
                </div>
              </motion.div>
            )}

            {generating && (
              <motion.div key="loading"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <SkeletonLine height={42}/>
                <SkeletonLine height={18} width="60%"/>
                <div style={{ height: 20 }}/>
                <SkeletonLine height={18}/><SkeletonLine height={18}/><SkeletonLine height={18} width="80%"/>
                <SkeletonLine height={18}/><SkeletonLine height={18} width="70%"/>
                <SkeletonLine height={18}/>
              </motion.div>
            )}

            {draft && !generating && (
              <motion.div key="draft"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE_EXPO }}
                style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: 16, padding: "26px 28px",
                }}>
                {/* Toolbar */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 10, flexWrap: "wrap", marginBottom: 18,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <Meta label={TYPE_META[draft.contentType].label.toUpperCase()}/>
                    <Meta icon={<Hash size={11}/>} label={`${draft.wordCount.toLocaleString()} words`}/>
                    <Meta icon={<Clock size={11}/>} label={`${draft.readTimeMinutes} min read`}/>
                    {savedId && <Meta label="SAVED" tone="green"/>}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <ToolbarButton onClick={handleCopyMarkdown}>
                      <Copy size={12}/> Copy markdown
                    </ToolbarButton>
                    <ToolbarButton onClick={handleSave} primary busy={saving}>
                      <Save size={12}/> {saving ? "Saving…" : savedId ? "Update" : "Save draft"}
                    </ToolbarButton>
                    {publishable && (
                      <ToolbarButton onClick={handlePublish} accent busy={publishing}>
                        <Send size={12}/> {publishing ? "Publishing…" : (savedId ? "Publish to blog" : "Save & publish")}
                      </ToolbarButton>
                    )}
                  </div>
                </div>

                {/* Title + meta editable */}
                <EditableField
                  label="Title" value={draft.title}
                  onChange={(v) => setDraft({ ...draft, title: v })}
                  large
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
                  <EditableField
                    label="Slug" value={draft.slug}
                    mono
                    onChange={(v) => setDraft({ ...draft, slug: v })}
                  />
                  <EditableField
                    label="Meta description"
                    value={draft.metaDescription}
                    onChange={(v) => setDraft({ ...draft, metaDescription: v })}
                    rows={2}
                  />
                </div>
                <div style={{ marginTop: 14 }}>
                  <EditableField
                    label="Excerpt"
                    value={draft.excerpt}
                    onChange={(v) => setDraft({ ...draft, excerpt: v })}
                    rows={2}
                  />
                </div>

                {/* Body */}
                <div style={{ marginTop: 22 }}>
                  <MiniLabel>Body · markdown</MiniLabel>
                  <textarea
                    value={draft.bodyMarkdown}
                    onChange={(e) => {
                      const body = e.target.value;
                      const words = body.replace(/[`#*_>\-]/g," ").split(/\s+/).filter(Boolean).length;
                      setDraft({
                        ...draft, bodyMarkdown: body,
                        wordCount: words,
                        readTimeMinutes: Math.max(1, Math.round(words / 220)),
                      });
                    }}
                    spellCheck
                    style={{
                      width: "100%", marginTop: 6,
                      minHeight: 460,
                      padding: "14px 16px",
                      fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.65,
                      color: "var(--text-primary)",
                      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
                      resize: "vertical",
                    }}
                  />
                </div>

                {publishable && (
                  <div style={{
                    marginTop: 18, padding: "14px 16px",
                    background: "rgba(var(--brand-rgb),0.06)",
                    border: "1px solid rgba(var(--brand-rgb),0.25)",
                    borderRadius: 10,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: 14, flexWrap: "wrap",
                  }}>
                    <div>
                      <div style={{
                        fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em",
                        textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4,
                      }}>
                        Destination
                      </div>
                      <div style={{
                        fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)",
                      }}>
                        {publishDomain && publishDomain !== "your site" ? `${publishDomain}` : ""}/blog/<span style={{ color: "var(--brand)" }}>{draft.slug || "your-slug"}</span>
                      </div>
                      <div style={{
                        marginTop: 4, fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)",
                      }}>
                        Publishing writes a row into your Supabase <span style={{ fontFamily: "var(--font-mono)" }}>blog_posts</span> table — the public <span style={{ fontFamily: "var(--font-mono)" }}>/blog</span> route renders it instantly.
                      </div>
                    </div>
                    {publishedSlug ? (
                      <Link href={`/blog/${publishedSlug}`} target="_blank" rel="noopener noreferrer" style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500,
                        color: "#fff", background: "var(--brand)", border: "none",
                        borderRadius: 7, padding: "8px 14px", textDecoration: "none",
                        boxShadow: "0 0 16px var(--brand-glow)",
                      }}>
                        View live post ↗
                      </Link>
                    ) : (
                      <button
                        onClick={handlePublish}
                        disabled={publishing}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500,
                          color: "#fff", background: "var(--brand)", border: "none",
                          borderRadius: 7, padding: "8px 14px", cursor: publishing ? "default" : "pointer",
                          opacity: publishing ? 0.7 : 1,
                          boxShadow: "0 0 16px var(--brand-glow)",
                        }}>
                        <Send size={12}/>
                        {publishing ? "Publishing…" : savedId ? "Publish now" : "Save & publish"}
                      </button>
                    )}
                  </div>
                )}
                {!publishable && (
                  <div style={{ marginTop: 14, fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-tertiary)" }}>
                    This content type lives as a saved draft — copy the markdown wherever you plan to use it (landing page, social scheduler, email tool).
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
      `}</style>
    </div>
  );
}

// ─── UI subcomponents ─────────────────────────────────────────────────────────
function Panel({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 12, padding: "14px 16px 16px",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 10, gap: 6,
      }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
          textTransform: "uppercase", color: "var(--text-tertiary)",
        }}>{label}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Banner({ kind, children }: { kind: "error" | "info"; children: React.ReactNode }) {
  const colors = kind === "error"
    ? { bg: "rgba(255,23,68,0.06)", bd: "rgba(255,23,68,0.25)", fg: "var(--signal-red)" }
    : { bg: "rgba(0,230,118,0.06)", bd: "rgba(0,230,118,0.25)", fg: "var(--signal-green)" };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "11px 16px", marginBottom: 18,
      background: colors.bg, border: `1px solid ${colors.bd}`,
      borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 13,
      color: colors.fg,
    }}>{children}</div>
  );
}

function TypeButton({
  value, selected, onClick, label, Icon,
}: {
  value: string; selected: boolean; onClick: () => void; label: string;
  Icon: React.ComponentType<{size?:number;color?:string}>;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      data-value={value}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        padding: "10px 6px",
        background: selected ? "rgba(var(--brand-rgb),0.12)" : "var(--card)",
        border: `1px solid ${selected ? "rgba(var(--brand-rgb),0.45)" : "var(--border)"}`,
        borderRadius: 8,
        fontFamily: "var(--font-body)", fontSize: 12, fontWeight: selected ? 500 : 400,
        color: selected ? "var(--brand)" : "var(--text-secondary)",
        cursor: "pointer",
      }}
    >
      <Icon size={14} color={selected ? "var(--brand)" : "var(--text-tertiary)"}/>
      {label}
    </button>
  );
}

function Segmented({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick} aria-pressed={selected}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
        padding: "8px 6px",
        background: selected ? "rgba(var(--brand-rgb),0.10)" : "var(--card)",
        border: `1px solid ${selected ? "rgba(var(--brand-rgb),0.40)" : "var(--border)"}`,
        borderRadius: 7,
        fontFamily: "var(--font-body)", fontSize: 12,
        color: selected ? "var(--brand)" : "var(--text-secondary)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em",
      textTransform: "uppercase", color: "var(--text-tertiary)",
    }}>{children}</div>
  );
}

function EditableField({
  label, value, onChange, rows, mono = false, large = false,
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  rows?: number; mono?: boolean; large?: boolean;
}) {
  const isTextarea = rows && rows > 1;
  const common: React.CSSProperties = {
    width: "100%",
    padding: isTextarea ? "10px 12px" : "10px 12px",
    fontFamily: mono ? "var(--font-mono)" : "var(--font-body)",
    fontSize: large ? 18 : 13,
    fontWeight: large ? 600 : 400,
    color: "var(--text-primary)",
    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
    resize: "vertical",
    lineHeight: 1.5,
  };
  return (
    <div>
      <MiniLabel>{label}</MiniLabel>
      {isTextarea
        ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} style={{ ...common, marginTop: 5 }}/>
        : <input    value={value} onChange={(e) => onChange(e.target.value)}         style={{ ...common, marginTop: 5 }}/>}
    </div>
  );
}

function Meta({ label, icon, tone }: { label: string; icon?: React.ReactNode; tone?: "green" }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 8px",
      background: tone === "green" ? "rgba(0,230,118,0.10)" : "var(--card)",
      border: `1px solid ${tone === "green" ? "rgba(0,230,118,0.30)" : "var(--border)"}`,
      borderRadius: 100,
      fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em",
      color: tone === "green" ? "var(--signal-green)" : "var(--text-tertiary)",
      textTransform: "uppercase",
    }}>{icon}{label}</span>
  );
}

function ToolbarButton({ onClick, children, primary, accent, busy }: {
  onClick: () => void; children: React.ReactNode;
  primary?: boolean; accent?: boolean; busy?: boolean;
}) {
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6,
    fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500,
    borderRadius: 7, padding: "7px 12px", cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.7 : 1,
  };
  const styles: React.CSSProperties = primary
    ? { ...base, background: "var(--muted)", border: "1px solid var(--border)", color: "var(--text-primary)" }
    : accent
    ? { ...base, background: "var(--brand)", border: "none", color: "#fff", boxShadow: "0 0 16px var(--brand-glow)" }
    : { ...base, background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)" };
  return <button onClick={onClick} disabled={busy} style={styles}>{children}</button>;
}

function SkeletonLine({ height, width = "100%" }: { height: number; width?: string }) {
  return (
    <div style={{
      height, width, borderRadius: 8,
      background: "linear-gradient(90deg, var(--card) 25%, var(--muted) 50%, var(--card) 75%)",
      backgroundSize: "200% 100%", animation: "shimmer 1.4s ease-in-out infinite",
    }}/>
  );
}
