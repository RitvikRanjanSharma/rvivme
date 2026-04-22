// lib/content-gen.ts
// =============================================================================
// AI Marketing Lab — Content generator (browser-side)
// Drives the /content page. Generates a full draft via /api/claude, persists
// to ai_content for iteration, and on publish clones into blog_posts so the
// public site renders it. This stays deliberately simple: one function per
// verb, minimal state held here, all UI lives in the page.
// =============================================================================

import { supabase } from "./supabase";
import type { Database } from "./supabase";

type AiContentRow = Database["public"]["Tables"]["ai_content"]["Row"];
type BlogPostRow  = Database["public"]["Tables"]["blog_posts"]["Row"];

export type AiContent = AiContentRow;

export type ContentType = "blog" | "article" | "landing" | "social" | "email";

export type GenerateParams = {
  contentType?:    ContentType;  // omit to let AI auto-detect based on keywords
  keywords:        string[];
  strategyTitle?:  string;
  strategyRationale?: string;
  domain?:         string;
  tone?:           "editorial" | "technical" | "conversational" | "authoritative";
  companyName?:    string;
  // How long the user wants the piece. Leave undefined for AI's call.
  lengthHint?:     "short" | "medium" | "long";
};

export type GeneratedDraft = {
  contentType:     ContentType;
  title:           string;
  slug:            string;
  excerpt:         string;
  metaDescription: string;
  bodyMarkdown:    string;
  wordCount:       number;
  readTimeMinutes: number;
  targetKeywords:  string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 80);
}
function wordCountOf(markdown: string): number {
  return markdown.replace(/[`#*_>\-]/g," ").split(/\s+/).filter(Boolean).length;
}
function readTimeFor(words: number): number {
  return Math.max(1, Math.round(words / 220));
}

// ─── Auto-detect content type ────────────────────────────────────────────────
// Quick heuristic used when the user hasn't picked a type. Short commercial-
// intent keywords lean "landing"; question-style/long-tail lean "blog".
export function autoDetectContentType(keywords: string[]): ContentType {
  const all = keywords.join(" ").toLowerCase();
  if (/\b(buy|price|pricing|vs|alternatives?|review|best|top|software|tool)\b/.test(all)) return "landing";
  if (/\b(how|what|why|guide|tutorial|when|where|is|are|do|can)\b/.test(all)) return "blog";
  if (keywords.some(k => k.split(/\s+/).length >= 4)) return "blog";
  return "article";
}

// ─── Generate a draft ─────────────────────────────────────────────────────────
export async function generateDraft(params: GenerateParams): Promise<GeneratedDraft> {
  const contentType = params.contentType ?? autoDetectContentType(params.keywords);

  const lengthTarget = params.lengthHint === "short"  ? "700-900 words" :
                       params.lengthHint === "long"   ? "1700-2200 words" :
                       "1200-1500 words";

  const formatBrief =
    contentType === "blog"     ? "an editorial SEO blog post with H2/H3 structure, intro hook, clear sections, and a short CTA at the end" :
    contentType === "article"  ? "a feature article with a strong lede, subsections, and quotable takeaway lines" :
    contentType === "landing"  ? "a conversion-focused landing page: hero H1, subhead, three value-prop sections, social proof placeholder, feature list, FAQ, and CTA" :
    contentType === "social"   ? "a thread of 6-10 short, punchy posts (number them) plus a hook line" :
    /* email */                  "a newsletter-style email with subject line, preheader, opening, 2-3 sections, CTA";

  const prompt = `You are a senior marketing writer for ${params.companyName ?? "a specialist SEO & GEO intelligence platform"}${params.domain ? ` (${params.domain})` : ""}.

Write ${formatBrief}. Target length: ${lengthTarget}.

${params.strategyTitle ? `STRATEGY IT SUPPORTS: ${params.strategyTitle}\n${params.strategyRationale ? `Rationale: ${params.strategyRationale}\n` : ""}` : ""}TARGET KEYWORDS (use naturally, don't stuff):
${params.keywords.map(k => `- ${k}`).join("\n")}

Tone: ${params.tone ?? "editorial"}. Write in British English.

Return ONLY valid JSON, no markdown fence, no preamble:
{
  "title": "...",
  "slug": "kebab-case-slug-max-80",
  "excerpt": "1-2 sentence hook under 180 chars",
  "metaDescription": "155-160 char meta",
  "bodyMarkdown": "# Full markdown with H1/H2/H3, lists, emphasis"
}

Rules:
- Body MUST be valid markdown, no JSON, no code fences inside it.
- Do NOT hallucinate stats, reviews, or customer names.
- Weave keywords into headings and first paragraph where it reads natural.
- End body with a short CTA paragraph (sign up, get started, or contextual).`;

  const res = await fetch("/api/claude", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ prompt, max_tokens: 4000 }),
  });
  const data = await res.json();
  if (data?.reason === "not_configured") throw new Error("AI is not configured on this workspace.");
  if (!res.ok || data.error)             throw new Error(data.error ?? "Draft generation failed");

  const raw  = (data.text ?? "{}").replace(/```json|```/g,"").trim();
  const json = JSON.parse(raw) as {
    title:           string;
    slug?:           string;
    excerpt:         string;
    metaDescription: string;
    bodyMarkdown:    string;
  };

  const words = wordCountOf(json.bodyMarkdown ?? "");

  return {
    contentType,
    title:           json.title?.trim() || "Untitled draft",
    slug:            json.slug?.trim() || slugify(json.title ?? "untitled"),
    excerpt:         json.excerpt?.trim() || "",
    metaDescription: json.metaDescription?.trim() || "",
    bodyMarkdown:    json.bodyMarkdown ?? "",
    wordCount:       words,
    readTimeMinutes: readTimeFor(words),
    targetKeywords:  params.keywords,
  };
}

// ─── Persist ──────────────────────────────────────────────────────────────────
export async function saveDraft(opts: {
  draft:      GeneratedDraft;
  strategyId?: string | null;
  id?:        string;  // update existing
}): Promise<AiContentRow> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in");

  const row = {
    user_id:          userId,
    strategy_id:      opts.strategyId ?? null,
    content_type:     opts.draft.contentType,
    title:            opts.draft.title,
    slug:             opts.draft.slug,
    excerpt:          opts.draft.excerpt,
    body_markdown:    opts.draft.bodyMarkdown,
    meta_description: opts.draft.metaDescription,
    target_keywords:  opts.draft.targetKeywords,
    word_count:       opts.draft.wordCount,
    read_time_minutes: opts.draft.readTimeMinutes,
    status:           "draft" as const,
  };

  if (opts.id) {
    const { data, error } = await supabase
      .from("ai_content").update(row as never).eq("id", opts.id).select("*").single();
    if (error) throw error;
    return data as unknown as AiContentRow;
  } else {
    const { data, error } = await supabase
      .from("ai_content").insert(row as never).select("*").single();
    if (error) throw error;
    return data as unknown as AiContentRow;
  }
}

export async function listDrafts(strategyId?: string): Promise<AiContentRow[]> {
  let q = supabase.from("ai_content").select("*").order("updated_at", { ascending: false });
  if (strategyId) q = q.eq("strategy_id", strategyId);
  const { data, error } = await q;
  if (error) throw error;
  return data as unknown as AiContentRow[];
}

export async function getDraft(id: string): Promise<AiContentRow> {
  const { data, error } = await supabase.from("ai_content").select("*").eq("id", id).single();
  if (error) throw error;
  return data as unknown as AiContentRow;
}

export async function deleteDraft(id: string): Promise<void> {
  const { error } = await supabase.from("ai_content").delete().eq("id", id);
  if (error) throw error;
}

// Publish to the existing blog system. Only blog/article types publish —
// landing/social/email live on in ai_content for manual use elsewhere.
export async function publishDraftToBlog(id: string): Promise<BlogPostRow> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in");

  const draft = await getDraft(id);
  if (draft.content_type !== "blog" && draft.content_type !== "article") {
    throw new Error("Only blog/article drafts can be published to the blog feed.");
  }

  // Fetch company name for author_name default.
  const { data: profile } = await supabase
    .from("users").select("company_name").eq("id", userId).maybeSingle();
  const authorName = (profile as { company_name?: string } | null)?.company_name ?? "AI Marketing Lab";

  const post = {
    author_id:          userId,
    title:              draft.title,
    slug:               draft.slug ?? slugify(draft.title),
    excerpt:            draft.excerpt ?? "",
    content:            draft.body_markdown,
    read_time_minutes:  draft.read_time_minutes,
    category:           "content_marketing" as const,
    meta_title:         draft.title,
    meta_description:   draft.meta_description,
    focus_keyword:      draft.target_keywords[0] ?? null,
    secondary_keywords: draft.target_keywords.slice(1),
    author_name:        authorName,
    status:             "published" as const,
    published_at:       new Date().toISOString(),
    view_count:         0,
    featured:           false,
  };

  const { data: inserted, error } = await supabase
    .from("blog_posts").insert(post as never).select("*").single();
  if (error) throw error;
  const publishedRow = inserted as unknown as BlogPostRow;

  // Mark draft published + link.
  await supabase
    .from("ai_content")
    .update({ status: "published", published_to: publishedRow.id } as never)
    .eq("id", draft.id);

  return publishedRow;
}
