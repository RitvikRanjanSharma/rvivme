// app/api/perplexity/route.ts
// =============================================================================
// AI Marketing Lab — Server-side Perplexity proxy
// Keeps PERPLEXITY_API_KEY on the server. Mirrors the request/response contract
// of /api/claude exactly — callers POST { prompt, system?, model?, max_tokens? }
// and receive { success, text } — so switching a feature between providers is a
// one-line URL change at the call site.
//
// Used by: lib/content-gen.ts (blog / landing-page draft generation).
// Everything else (strategy generation, keyword→strategy matching, dashboard
// analysis) still goes through /api/claude — those are structured-reasoning
// tasks where Claude performs better.
//
// Perplexity's API is OpenAI-chat-compatible, so the shape differs from
// Anthropic's: messages carry the system prompt as a role rather than a
// top-level field, and the completion comes back at
// choices[0].message.content instead of content[0].text.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";

// "sonar" is Perplexity's general-purpose model with live web grounding —
// a good fit for marketing copy that should reflect current context. Swap to
// "sonar-pro" for longer/more nuanced drafts, or pass { model } per call.
const DEFAULT_MODEL      = "sonar";
const DEFAULT_MAX_TOKENS = 4000;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      // Same calm not_configured signal the Claude route uses, so existing
      // callers' error branches keep working unchanged.
      return NextResponse.json(
        {
          success: false,
          reason:  "not_configured",
          message: "Perplexity is not set up on this workspace yet.",
        },
        { status: 200 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      prompt,
      system,
      model      = DEFAULT_MODEL,
      max_tokens = DEFAULT_MAX_TOKENS,
    }: {
      prompt?:     string;
      system?:     string;
      model?:      string;
      max_tokens?: number;
    } = body ?? {};

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "prompt (string) is required" },
        { status: 400 },
      );
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[perplexity] ${res.status}: ${errText.slice(0, 300)}`);
      return NextResponse.json(
        { error: `Perplexity API error (${res.status})` },
        { status: 502 },
      );
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "";

    return NextResponse.json({ success: true, text });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[perplexity]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
