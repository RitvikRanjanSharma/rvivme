// lib/claude-client.ts
// =============================================================================
// AI Marketing Lab — the one way a server route talks to /api/claude
//
// WHY THIS EXISTS
//
// Pressing "Find competitors" produced:
//
//     The suggestion came back in a format we couldn't read. Try again.
//
// Nothing had come back in a bad format. /api/claude had refused the request,
// and the caller never looked. It checked three of the eight ways the proxy
// can fail — not_configured, quota_exceeded, unauthenticated — then did:
//
//     const raw = String(j?.text ?? "").replace(...)
//     JSON.parse(raw)                    // JSON.parse("") throws
//
// So bad_request, unknown_task, prompt_too_large, upstream_error and api_error
// all arrived as "unreadable format", which is not merely unhelpful: it names
// the wrong culprit. It tells the user the model misbehaved and invites them
// to retry something that will fail identically every time, while the actual
// reason sits unread in the response they already have.
//
// The same open-coded pattern was in site-audit/suggest and site-audit/plan.
// Three copies of "handle the failures I happen to remember" is why this is a
// function now: a caller cannot reach the text without passing through the
// failure branch first, because the text does not exist on the failure type.
//
// This is the discriminated-union trick doing real work. `ok: false` has no
// `text` field, so TypeScript refuses to compile the bug that caused this.
// =============================================================================

import type { AiTask } from "@/lib/ai-tasks";
import { resolveBaseUrl } from "@/lib/site";

export type ClaudeResult =
  | { ok: true;  text: string; model: string; inputTokens: number | null; outputTokens: number | null }
  | { ok: false; reason: string; message: string };

/**
 * Ask Claude via our metered proxy.
 *
 * `cookie` is the caller's own cookie header, forwarded so the session and the
 * daily quota belong to the real user rather than to the server making the
 * hop. Omitting it produces `unauthenticated`, which is now reported as such
 * instead of masquerading as a parse failure.
 */
export async function askClaude(
  task: AiTask,
  prompt: string,
  cookie: string | null,
  opts: { maxTokens?: number; system?: string } = {},
): Promise<ClaudeResult> {
  let res: Response;
  try {
    res = await fetch(`${resolveBaseUrl()}/api/claude`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", cookie: cookie ?? "" },
      body:    JSON.stringify({
        task, prompt,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.system    ? { system: opts.system }        : {}),
      }),
    });
  } catch (e) {
    return {
      ok: false, reason: "unreachable",
      message: e instanceof Error ? e.message : "Could not reach the AI service.",
    };
  }

  const j = await res.json().catch(() => null) as
    | { success?: boolean; text?: string; reason?: string; message?: string;
        usage?: { model?: string; input_tokens?: number | null; output_tokens?: number | null } }
    | null;

  if (!j) {
    return { ok: false, reason: "unreadable_response", message: `The AI service returned a non-JSON response (HTTP ${res.status}).` };
  }

  // Any declared failure is returned as itself. This single branch is what the
  // three open-coded call sites kept getting incomplete.
  if (j.success !== true) {
    return {
      ok: false,
      reason:  j.reason ?? "api_error",
      message: j.message ?? `The AI service refused the request (HTTP ${res.status}).`,
    };
  }

  const text = typeof j.text === "string" ? j.text : "";
  if (!text.trim()) {
    // A successful call that produced nothing is its own outcome, not a
    // parse error. Saying "unreadable format" about an empty string sends the
    // reader looking for a formatting problem that does not exist.
    return { ok: false, reason: "empty_response", message: "The AI service returned an empty answer. Try again." };
  }

  return {
    ok: true,
    text,
    model:        j.usage?.model ?? "unknown",
    inputTokens:  j.usage?.input_tokens  ?? null,
    outputTokens: j.usage?.output_tokens ?? null,
  };
}

/**
 * Parse a JSON array out of a model response.
 *
 * Models wrap JSON in code fences roughly as often as not, so the fence is
 * stripped before parsing. On failure the first 200 characters come back with
 * the error — without them "we couldn't read it" is a dead end for whoever has
 * to work out why, which by now has cost more than one debugging session.
 */
export function parseJsonArray<T>(raw: string): { ok: true; value: T[] } | { ok: false; snippet: string } {
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return { ok: true, value: parsed as T[] };
    return { ok: false, snippet: `expected an array, got ${typeof parsed}: ${cleaned.slice(0, 200)}` };
  } catch {
    return { ok: false, snippet: cleaned.slice(0, 200) || "(empty)" };
  }
}
