// lib/ai-tasks.ts
// =============================================================================
// AI Marketing Lab — which model does which job, decided here and nowhere else
//
// WHY CALLERS NO LONGER PICK THE MODEL
//
// /api/claude used to accept `model` and `max_tokens` straight from the request
// body. Combined with the fact that it had no authentication, that meant anyone
// who found the endpoint could post:
//
//     { "prompt": "...", "model": "claude-opus-5", "max_tokens": 64000 }
//
// and bill it to us. The model name is not the caller's decision to make, so
// they now send a `task` instead and this module maps it to a model and a
// ceiling. An unknown task is refused rather than defaulted — a typo should
// fail loudly, not silently spend on the most expensive model in the list.
//
// PICKING THE MODEL
//
// The split is by what the output is FOR, not by how hard the prompt looks.
//
//   Sonnet — anything the customer will paste onto their own website, or read
//            as our recommendation. Titles, meta descriptions, the audit
//            narrative, strategies. Getting these subtly wrong costs their
//            ranking and our credibility, and the price difference on a few
//            hundred output tokens is a rounding error against that.
//
//   Haiku  — classification, extraction and mechanical summarising, where the
//            answer is checkable and the shape is fixed. Matching keywords to
//            strategies is picking from a supplied list; summarising a blog
//            post is compressing text we hand it. Haiku is a fifth of the
//            output price and the difference is not visible in the result.
//
// Sonnet 5 replaces Sonnet 4.6 throughout: $2/$10 per MTok against $3/$15, for
// a newer model. There was no reason to stay on 4.6 beyond it being the string
// that happened to be in the file.
// =============================================================================

export const SONNET = "claude-sonnet-5";
export const HAIKU  = "claude-haiku-4-5-20251001";

export type AiTask =
  | "audit_fix"        // titles, meta descriptions, alt text — pasted onto their site
  | "audit_plan"       // the ordered narrative for a set of findings
  | "competitor_names" // who an AI assistant would name as an alternative
  | "strategy"         // a full strategy document
  | "insight"          // dashboard commentary on their own numbers
  | "classify"         // keyword → strategy matching; fixed shape, supplied options
  | "summarise"        // compress text we already hand it
  | "citation";        // does this answer mention the domain

type Spec = {
  model: string;
  /** Hard ceiling. A caller may ask for less, never more. */
  maxTokens: number;
  /** What this is for, so the next person can judge whether the model still fits. */
  note: string;
};

export const TASKS: Record<AiTask, Spec> = {
  audit_fix: {
    model: SONNET, maxTokens: 1200,
    note: "Goes onto the customer's live site. Quality is the whole point.",
  },
  audit_plan: {
    model: SONNET, maxTokens: 900,
    note: "Read as our recommendation on what to do first.",
  },
  competitor_names: {
    model: SONNET, maxTokens: 1200,
    note: "Recall of real companies in a market. Weaker models invent plausible ones, and although we verify every domain resolves, a wrong-but-live domain still passes that check.",
  },
  strategy: {
    model: SONNET, maxTokens: 1400,
    note: "Long-form reasoning the customer acts on for months.",
  },
  insight: {
    model: SONNET, maxTokens: 1000,
    note: "Commentary on their own numbers; being wrong here is visible immediately.",
  },
  classify: {
    model: HAIKU, maxTokens: 1600,
    note: "Picking from a supplied list of strategies. Checkable, fixed output shape.",
  },
  summarise: {
    model: HAIKU, maxTokens: 400,
    note: "Compressing text we supply. No outside knowledge needed.",
  },
  citation: {
    model: HAIKU, maxTokens: 400,
    note: "Does this answer mention the domain — close to a lookup.",
  },
};

export function isAiTask(v: unknown): v is AiTask {
  return typeof v === "string" && v in TASKS;
}

/**
 * Resolve a task to the model and token budget it may use.
 *
 * `requested` lets a caller ask for FEWER tokens than the ceiling — useful when
 * it knows the answer is one line — but never more.
 */
export function resolveTask(task: AiTask, requested?: number): { model: string; maxTokens: number } {
  const spec = TASKS[task];
  const asked = Number.isFinite(requested) && (requested as number) > 0
    ? Math.floor(requested as number)
    : spec.maxTokens;
  return { model: spec.model, maxTokens: Math.min(asked, spec.maxTokens) };
}

/**
 * Rough token count for a string.
 *
 * Four characters per token is the standard approximation for English and is
 * accurate enough for a pre-flight size check. It is deliberately NOT used for
 * billing — that comes from the API response — only to refuse an input so large
 * that it would be expensive to discover the problem by sending it.
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Largest prompt we will forward, in characters.
 *
 * ~25k tokens. Every legitimate caller in this codebase sends well under 4k;
 * the cap exists so a bug or an abusive client cannot turn one request into a
 * six-figure token bill.
 */
export const MAX_PROMPT_CHARS = 100_000;
