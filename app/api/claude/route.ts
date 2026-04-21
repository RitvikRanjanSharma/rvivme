// app/api/claude/route.ts
// =============================================================================
// AI Marketing Lab — Server-side Anthropic proxy
// Keeps ANTHROPIC_API_KEY on the server. Callers POST { prompt, system?, model?,
// max_tokens? } and receive { text } back. This is the single path any
// client-side feature should use to talk to Claude — never call
// api.anthropic.com from the browser.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";

// Keeping the same model the browser code used previously so behaviour
// is unchanged. Override per-call by passing { model } in the request body.
const DEFAULT_MODEL      = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 1024;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured on the server" },
        { status: 500 },
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

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key":         apiKey,
      },
      body: JSON.stringify({
        model,
        max_tokens,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[claude] Anthropic ${res.status}: ${errText.slice(0, 300)}`);
      return NextResponse.json(
        { error: `Anthropic API error (${res.status})` },
        { status: 502 },
      );
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text ?? "";

    return NextResponse.json({ success: true, text });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[claude]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
