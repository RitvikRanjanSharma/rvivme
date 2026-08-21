// app/api/site-audit/suggest/route.ts
// =============================================================================
// AI Marketing Lab — write the fix, don't describe it
//
// "Trim to roughly 60 characters and move the distinguishing words to the
// front" is the same advice every SEO tool gives. It is homework. This returns
// the finished titles to choose from.
//
// ON DEMAND, PER FINDING
//
// Called when someone presses "Suggest fixes" on a single finding, not during
// the audit. A 50-finding site would otherwise mean 50 model calls per run,
// most of them for pages nobody intends to touch — slow, and billed whether or
// not anyone reads the output.
//
// GROUNDED, NOT GENERIC
//
// Every prompt carries that page's real h1, opening text and current values.
// A title generated from the rule alone ("write a 60-character title") is
// generic advice wearing a different font; generated from the page's actual
// subject it is specific enough to paste without editing. This is also why the
// crawler now stores page context on each finding.
//
// CONSTRAINTS ARE ENFORCED HERE, NOT REQUESTED
//
// Length limits are checked in code after generation and over-long options are
// dropped. Asking a model for "50-60 characters" and trusting the answer is
// how you ship a tool that recommends a 74-character title as the fix for a
// 68-character one — which would be worse than saying nothing.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import { canSuggest } from "@/lib/audit-fixes";
import { RULE_GUIDE } from "@/lib/audit-guide";
import { askClaude, parseJsonArray } from "@/lib/claude-client";

export const dynamic     = "force-dynamic";
export const maxDuration = 45;

type Detail = Record<string, unknown>;

/** What a good answer looks like for each rule, and how it is validated. */
type Spec = {
  /** What to ask for. */
  ask:      string;
  /** Hard limits applied after generation. */
  min?:     number;
  max?:     number;
  /** How the options are shown — a line, or a block of prose/markup. */
  kind:     "line" | "block";
  /** Label above the options. */
  heading:  string;
};

const SPECS: Record<string, Spec> = {
  missing_title: {
    ask: "3 page title options, each 50-60 characters, leading with the term someone would search for.",
    min: 30, max: 62, kind: "line", heading: "Suggested titles",
  },
  title_too_short: {
    ask: "3 page title options, each 50-60 characters, that expand on the current one by adding the qualifier a searcher would actually type — a place, a product, or an outcome.",
    min: 40, max: 62, kind: "line", heading: "Suggested titles",
  },
  title_too_long: {
    ask: "3 page title options, each 50-60 characters, that keep the meaning of the current title but move the distinguishing words to the front so nothing important is cut off.",
    min: 35, max: 62, kind: "line", heading: "Suggested titles",
  },
  duplicate_title: {
    ask: "3 page title options, each 50-60 characters, that make THIS page distinguishable from the other pages sharing its title.",
    min: 35, max: 62, kind: "line", heading: "Suggested titles",
  },
  missing_meta_description: {
    ask: "3 meta description options, each 140-160 characters, describing what the reader gets from this page and ending with a reason to click.",
    min: 120, max: 165, kind: "line", heading: "Suggested descriptions",
  },
  meta_description_short: {
    ask: "3 meta description options, each 140-160 characters, expanding the current one without repeating the title.",
    min: 120, max: 165, kind: "line", heading: "Suggested descriptions",
  },
  meta_description_long: {
    ask: "3 meta description options, each 140-160 characters, keeping the meaning of the current one but fitting the limit, front-loading the reason to click.",
    min: 120, max: 165, kind: "line", heading: "Suggested descriptions",
  },
  duplicate_meta_description: {
    ask: "3 meta description options, each 140-160 characters, that distinguish this page from the others sharing its description.",
    min: 120, max: 165, kind: "line", heading: "Suggested descriptions",
  },
  missing_h1: {
    ask: "3 options for a single H1 heading stating this page's subject in the words a searcher would use. Under 70 characters each.",
    max: 75, kind: "line", heading: "Suggested headings",
  },
  multiple_h1: {
    ask: "1 option for the single H1 this page should keep, then a short note on what the other headings should become (h2 or h3).",
    kind: "block", heading: "Recommended heading structure",
  },
  heading_skip: {
    ask: "A corrected heading outline for this page, showing the level and text of each heading in order, with no skipped levels.",
    kind: "block", heading: "Corrected heading outline",
  },
  thin_content: {
    ask: "An outline of 4-6 sections this page should add to genuinely answer what someone arriving on it wants, each with a one-line note on what to cover. Specific to this page's subject.",
    kind: "block", heading: "What to add",
  },
  images_missing_alt: {
    ask: "Guidance on writing alt text for this page's images, with 3 worked examples appropriate to this page's subject, plus a note that purely decorative images take an empty alt attribute.",
    kind: "block", heading: "Alt text guidance",
  },
  low_accessibility_score: {
    ask: "The 4 accessibility fixes most likely to be responsible on a page like this, in the order to tackle them, each with a concrete instruction.",
    kind: "block", heading: "Accessibility fixes",
  },
  aeo_answer_first: {
    ask: "A rewritten opening paragraph for this page, under 60 words, that answers the page's core question directly in the first sentence so an answer engine can quote it.",
    kind: "block", heading: "Suggested opening",
  },
  aeo_heading_structure: {
    ask: "A heading outline for this page that an answer engine could use to locate the answer to a question, with levels and text.",
    kind: "block", heading: "Suggested structure",
  },
  aeo_depth: {
    ask: "4-6 specific sub-topics this page should cover to be worth quoting on its subject.",
    kind: "block", heading: "Suggested coverage",
  },
  aeo_meta_description: {
    ask: "3 meta description options, each 140-160 characters, written so an answer engine can use them as a summary.",
    min: 120, max: 165, kind: "line", heading: "Suggested descriptions",
  },
};

export async function POST(req: NextRequest) {
  try {
    const caller = await getCallerOrNull();
    if (!caller) {
      return NextResponse.json({ success: false, reason: "unauthenticated" }, { status: 401 });
    }

    const body   = await req.json().catch(() => ({}));
    const rule   = String(body?.rule ?? "");
    const detail = (body?.detail ?? {}) as Detail;
    const page   = typeof body?.page_url === "string" ? body.page_url : undefined;

    if (!canSuggest(rule) || !SPECS[rule]) {
      return NextResponse.json({
        success: false, reason: "not_suggestible",
        message: "This one needs checking rather than writing — there is no text to generate.",
      });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        success: false, reason: "not_configured",
        message: "Suggestions need an Anthropic API key on the server.",
      });
    }

    const spec  = SPECS[rule];
    const guide = RULE_GUIDE[rule];

    // Everything the model is allowed to know about this page. Values are
    // labelled so it cannot confuse the title with the heading.
    const facts = [
      page                        ? `Page URL: ${page}` : null,
      detail.title                ? `Current title: "${detail.title}" (${String(detail.title).length} characters)` : null,
      detail.description          ? `Current meta description: "${detail.description}" (${String(detail.description).length} characters)` : null,
      detail.h1                   ? `Page H1: "${detail.h1}"` : null,
      Array.isArray(detail.headings) ? `Existing H1s: ${(detail.headings as string[]).map(h => `"${h}"`).join(", ")}` : null,
      detail.word_count           ? `Word count: ${detail.word_count}` : null,
      Array.isArray(detail.pages) ? `Other pages sharing this: ${(detail.pages as string[]).slice(0, 5).join(", ")}` : null,
      detail.excerpt              ? `Opening content: ${detail.excerpt}` : null,
    ].filter(Boolean).join("\n");

    const prompt = [
      `You are advising the owner of this web page. British spelling.`,
      ``,
      `What the audit found: ${guide?.why ?? "An SEO issue on this page."}`,
      ``,
      `What you know about the page:`,
      facts || "(no details captured)",
      ``,
      `Produce: ${spec.ask}`,
      ``,
      spec.kind === "line"
        ? `Return ONLY a JSON array of strings — the options themselves, nothing else. No numbering, no explanation, no code fences.`
        : `Return ONLY a JSON array containing ONE string — the guidance, in plain sentences or a short markdown list. No code fences.`,
      `Base everything on the page's actual subject above. Do not invent facts about the business, and do not use placeholders like "Your Company".`,
    ].join("\n");

    const answer = await askClaude("audit_fix", prompt, req.headers.get("cookie"));
    if (!answer.ok) {
      // Every refusal reported as itself, rather than the three the previous
      // version happened to remember with the rest falling through.
      return NextResponse.json({ success: false, reason: answer.reason, message: answer.message });
    }

    const parsed = parseJsonArray<unknown>(answer.text);
    // A model that ignored the format instruction still produced something
    // useful, so lines are salvaged rather than the whole response discarded.
    // This is a legitimate fallback for THIS route because the output is a
    // list of short strings; it would be wrong for structured JSON.
    const options: string[] = parsed.ok
      ? parsed.value.map(String)
      : answer.text
          .replace(/^```(?:json)?\s*|\s*```$/g, "")
          .split("\n").map(l => l.replace(/^\s*[-*\d.]+\s*/, "").trim()).filter(Boolean);

    // Enforce the limits rather than trusting them. Recommending a 74-character
    // title as the fix for a 68-character one would be worse than silence.
    const withinLimits = options.filter(o => {
      if (spec.min && o.length < spec.min) return false;
      if (spec.max && o.length > spec.max) return false;
      return true;
    });

    const finalOptions = (spec.kind === "line" ? withinLimits : options).slice(0, 4);

    if (finalOptions.length === 0) {
      return NextResponse.json({
        success: false, reason: "no_usable_options",
        message: "Nothing came back that met the length limits. Try again — the model occasionally overruns.",
      });
    }

    return NextResponse.json({
      success:  true,
      rule,
      heading:  spec.heading,
      kind:     spec.kind,
      options:  finalOptions,
      // Shown next to each option so the reader can verify the constraint was
      // actually met rather than taking our word for it.
      lengths:  spec.kind === "line" ? finalOptions.map(o => o.length) : null,
      dropped:  spec.kind === "line" ? options.length - withinLimits.length : 0,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[site-audit/suggest]", message);
    return NextResponse.json({ success: false, reason: "api_error", message });
  }
}
