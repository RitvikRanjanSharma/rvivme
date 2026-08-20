// app/api/blog/summary/route.ts
// =============================================================================
// AI Marketing Lab — short spoken-style summary of a blog post
//
// Powers the "AI summary" button on post pages: a ~120-word précis the reader
// can skim or have read aloud before committing to the full article.
//
// Uses Claude rather than Perplexity. Summarising supplied text is a
// comprehension task on content we already have — Perplexity's strength is
// live web grounding, which is irrelevant here and would risk it pulling in
// outside material that isn't in the post.
//
// CACHING, AND WHY THE OLD CACHE WASN'T ONE
//
// This endpoint is public by design — a blog reader has no account. It used to
// call Anthropic on every cache miss, guarded only by a Map in module scope
// with a one-hour TTL.
//
// On Vercel that Map lives inside a single serverless instance. Traffic spread
// across instances misses it, a cold start empties it, and an hour later it
// expires regardless — so the same published post, whose text has not changed,
// was summarised over and over on an unmetered key with no session to count
// against.
//
// The summary of a published post is a pure function of its text, so it is now
// stored on the row with a hash of the text it came from. Same hash, serve the
// stored copy and call nobody. Different hash, generate once and store it.
// That turns one call per reader per hour per instance into one call per edit.
// See supabase/migrations/016_cache_blog_summaries.sql.
//
// The in-process Map is kept in front of the database as a cheap first hop for
// repeat clicks in one session. It is now an optimisation rather than the only
// thing standing between a reader and our API key.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { textFromContent } from "@/lib/speech";
import { outboundFetch } from "@/lib/outbound-fetch";
import { HAIKU, TASKS } from "@/lib/ai-tasks";

// Declared so a slow upstream fails as a timeout rather than as a killed
// process. A killed function returns nothing at all, which the UI cannot
// distinguish from an empty result.
export const maxDuration = 30;

export const revalidate = 3600;

// Module-scope cache. Lives for the lifetime of the serverless instance —
// good enough to absorb repeat clicks within a session without adding a
// database table for something this disposable.
const cache = new Map<string, { text: string; at: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function publicSupabase() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    const { slug } = (await request.json().catch(() => ({}))) as { slug?: string };
    if (!slug) {
      return NextResponse.json({ success: false, error: "slug is required" }, { status: 400 });
    }

    const hit = cache.get(slug);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, summary: hit.text, cached: true });
    }

    const sb = publicSupabase();
    if (!sb) {
      return NextResponse.json({ success: false, reason: "not_configured", message: "Database is not configured." });
    }

    const { data } = await sb
      .from("blog_posts")
      .select("title, excerpt, content, ai_summary, ai_summary_hash")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();

    const post = data as {
      title: string; excerpt: string | null; content: string;
      ai_summary: string | null; ai_summary_hash: string | null;
    } | null;
    if (!post) {
      return NextResponse.json({ success: false, error: "Post not found" }, { status: 404 });
    }

    // Hash the article text, not the row. updated_at moves when a category or
    // a cover image changes, neither of which alters a word of the article —
    // and each would discard a good summary and pay for an identical one.
    const articleText = textFromContent(post.content);
    const hash = createHash("sha256").update(articleText).digest("hex").slice(0, 32);

    if (post.ai_summary && post.ai_summary_hash === hash) {
      cache.set(slug, { text: post.ai_summary, at: Date.now() });
      return NextResponse.json({ success: true, summary: post.ai_summary, cached: true, source: "stored" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Degrade gracefully rather than failing: the excerpt is a human-written
      // summary already, so the button still does something useful.
      const fallback = post.excerpt?.trim();
      if (fallback) {
        return NextResponse.json({ success: true, summary: fallback, source: "excerpt" });
      }
      return NextResponse.json({
        success: false,
        reason:  "not_configured",
        message: "AI summaries aren't set up on this workspace yet.",
      });
    }

    // Cap the input — a very long post would otherwise dominate the token
    // budget, and the opening is where the thesis lives anyway.
    const body = articleText.slice(0, 12000);

    const prompt =
      `Summarise this article for someone deciding whether to read it, and for text-to-speech playback.\n\n` +
      `Rules:\n` +
      `- 100 to 140 words, 3 to 5 sentences.\n` +
      `- Plain prose only. No headings, bullets, markdown or emoji — it will be read aloud.\n` +
      `- British English spelling.\n` +
      `- Lead with the article's actual argument, not "This article discusses…".\n` +
      `- Only use what's in the text. Do not add statistics or claims of your own.\n\n` +
      `TITLE: ${post.title}\n\nARTICLE:\n${body}`;

    const res = await outboundFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key":         apiKey,
      },
      body: JSON.stringify({
        // Compressing text we hand it, with no outside knowledge required —
        // the definition of Haiku work, at a fifth of Sonnet's output price.
        model:      HAIKU,
        max_tokens: TASKS.summarise.maxTokens,
        messages:   [{ role: "user", content: prompt }],
      }),
    }, 25_000, "Claude");

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[blog/summary] Anthropic ${res.status}: ${errText.slice(0, 200)}`);
      return NextResponse.json({ success: false, error: "Could not generate a summary right now." }, { status: 502 });
    }

    const json    = await res.json();
    const summary = (json?.content?.[0]?.text ?? "").trim();
    if (!summary) {
      return NextResponse.json({ success: false, error: "Empty summary returned." }, { status: 502 });
    }

    cache.set(slug, { text: summary, at: Date.now() });

    // Store it so the next reader — on any instance, at any time — costs
    // nothing. Best-effort: a failed write means we summarise again next time,
    // which is the old behaviour, not a broken response for this reader.
    try {
      const { data: stored } = await sb.rpc("set_post_summary", {
        p_slug: slug, p_summary: summary, p_hash: hash,
      });
      if (stored !== true) {
        console.warn(`[blog/summary] summary for "${slug}" was not persisted; it will be regenerated next time`);
      }
    } catch (e) {
      console.warn("[blog/summary] persist failed:", e instanceof Error ? e.message : e);
    }

    return NextResponse.json({ success: true, summary, source: "generated" });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[blog/summary]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
