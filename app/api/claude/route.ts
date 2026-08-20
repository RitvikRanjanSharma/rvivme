// app/api/claude/route.ts
// =============================================================================
// AI Marketing Lab — the one metered path to Anthropic
//
// Keeps ANTHROPIC_API_KEY on the server. Callers POST { task, prompt, system?,
// max_tokens? } and receive { text }. Nothing client-side may call
// api.anthropic.com directly.
//
// WHAT WAS WRONG WITH THIS ROUTE
//
// It had no authentication and no quota check, and it took `model` and
// `max_tokens` straight from the request body. So this, from anyone, anywhere:
//
//     curl -X POST https://www.aimarketinglab.co.uk/api/claude \
//       -d '{"prompt":"...","model":"claude-opus-5","max_tokens":64000}'
//
// ran on our key. The middleware did not cover it either — PROTECTED_PREFIXES
// lists page routes, not /api — so there was nothing between a stranger and
// the bill. And the `anthropic: { count: 50 }` entry in DAILY_CAPS, which
// looked like the protection, was never consulted: /api/geo was the only
// caller of checkAndIncrement with that provider, so the cap covered one
// feature and no others.
//
// THREE CONTROLS, EACH DOING A DIFFERENT JOB
//
//   1. AUTHENTICATION — a session is required. This is what makes the caller a
//      person we can meter rather than an anonymous request.
//
//   2. QUOTA — the per-user daily cap that already existed in lib/quota.ts and
//      was never wired up here. Counted BEFORE the call, because Anthropic
//      bills whether or not we like the answer.
//
//   3. TASK, NOT MODEL — the caller says what it is doing and lib/ai-tasks
//      chooses the model and the ceiling. A caller can ask for fewer tokens
//      than its task allows; it cannot ask for a different model, a larger
//      budget, or a task that does not exist.
//
// Server-side callers (site-audit/suggest, site-audit/plan,
// competitors/discover) reach this over HTTP and forward the caller's cookie,
// so the session and the quota belong to the real user rather than to the
// server.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import { checkAndIncrement } from "@/lib/quota";
import { outboundFetch } from "@/lib/outbound-fetch";
import { isAiTask, resolveTask, approxTokens, MAX_PROMPT_CHARS, TASKS } from "@/lib/ai-tasks";

// Declared so a slow upstream fails as a timeout rather than as a killed
// process. A killed function returns nothing at all, which the UI cannot
// distinguish from an empty result.
export const maxDuration = 60;
export const dynamic     = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // ── 1. Who is asking ───────────────────────────────────────────────────
    const caller = await getCallerOrNull();
    if (!caller) {
      return NextResponse.json(
        { success: false, reason: "unauthenticated", message: "Sign in to use AI features." },
        { status: 401 },
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Not a 500 — this is a missing-config signal the UI can render calmly.
      // Callers branch on `reason === "not_configured"`.
      return NextResponse.json(
        {
          success: false,
          reason:  "not_configured",
          message: "AI features are not set up on this workspace yet.",
        },
        { status: 200 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { task, prompt, system, max_tokens } = (body ?? {}) as {
      task?: unknown; prompt?: unknown; system?: unknown; max_tokens?: unknown;
    };

    if (typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ success: false, reason: "bad_request", message: "prompt (string) is required" }, { status: 400 });
    }

    // ── 2. What job is it ──────────────────────────────────────────────────
    // Unknown tasks are refused rather than defaulted. A typo should fail
    // loudly here, not quietly bill the most expensive model in the map.
    if (!isAiTask(task)) {
      return NextResponse.json({
        success: false, reason: "unknown_task",
        message: `"${String(task)}" is not a known AI task. Expected one of: ${Object.keys(TASKS).join(", ")}.`,
      }, { status: 400 });
    }

    if (prompt.length > MAX_PROMPT_CHARS) {
      // Refused before the call, so an oversized input costs nothing to
      // discover. Every legitimate caller here sends well under 4k tokens.
      return NextResponse.json({
        success: false, reason: "prompt_too_large",
        message: `That prompt is roughly ${approxTokens(prompt).toLocaleString()} tokens, above the ${approxTokens("x".repeat(MAX_PROMPT_CHARS)).toLocaleString()} we accept in one call.`,
      }, { status: 413 });
    }

    const { model, maxTokens } = resolveTask(task, typeof max_tokens === "number" ? max_tokens : undefined);

    // ── 3. Can they afford it ──────────────────────────────────────────────
    // Counted before the call: Anthropic bills regardless of what comes back.
    const q = await checkAndIncrement(caller.supabase, caller.user.id, "anthropic", {
      endpoint: `/api/claude:${task}`,
    });
    if (!q.allowed) {
      return NextResponse.json({
        success: false,
        reason:  "quota_exceeded",
        message: `You've used today's ${q.cap} AI requests. The count resets at midnight UTC.`,
        cap:     q.cap,
      }, { status: 200 });
    }

    const res = await outboundFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key":         apiKey,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(typeof system === "string" && system ? { system } : {}),
        messages: [{ role: "user", content: prompt }],
      }),
    }, 55_000, "Claude");

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[claude] ${task} ${model} ${res.status}: ${errText.slice(0, 300)}`);
      return NextResponse.json(
        { success: false, reason: "upstream_error", message: `Anthropic API error (${res.status})` },
        { status: 502 },
      );
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text ?? "";

    return NextResponse.json({
      success: true,
      text,
      // Returned so the admin health page can see what each feature actually
      // costs, rather than us estimating it from max_tokens — which is a
      // ceiling, and typically three to five times the real output.
      usage: {
        model,
        task,
        input_tokens:  data?.usage?.input_tokens  ?? null,
        output_tokens: data?.usage?.output_tokens ?? null,
      },
      remaining: q.remaining,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[claude]", message);
    return NextResponse.json({ success: false, reason: "api_error", message }, { status: 500 });
  }
}
