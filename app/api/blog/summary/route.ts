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
// Summaries are cached in-process per slug. A post's text rarely changes, and
// re-summarising on every click would burn tokens for an identical answer.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { textFromContent } from "@/lib/speech";
import { outboundFetch } from "@/lib/outbound-fetch";

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
      .select("title, excerpt, content")
      .eq("slug", slug)
      .eq("status", "published")
      .single();

    const post = data as { title: string; excerpt: string | null; content: string } | null;
    if (!post) {
      return NextResponse.json({ success: false, error: "Post not found" }, { status: 404 });
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
    const body = textFromContent(post.content).slice(0, 12000);

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
        model:      "claude-sonnet-4-6",
        max_tokens: 400,
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
    return NextResponse.json({ success: true, summary });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[blog/summary]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
