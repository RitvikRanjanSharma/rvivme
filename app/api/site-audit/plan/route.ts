// app/api/site-audit/plan/route.ts
// =============================================================================
// AI Marketing Lab — turn audit findings into an action plan
//
// The audit says what is wrong. This says what to do about it, in what order,
// and roughly what it costs to fix — which is the difference between a report
// and advice, and the whole positioning of this product.
//
// WHY THIS EXISTS SEPARATELY FROM THE STRATEGY ENGINE
//
// The existing strategy generator needs Search Console data: it reasons about
// impressions, positions and query gaps. That is the right input when it is
// available, and useless when it is not — a site with no Google connection, or
// one that has never ranked, gets nothing from it.
//
// A technical audit needs none of that. The crawler and PageSpeed both work
// from a public URL, so this path produces a real plan for a site we have
// never seen before and have no credentials for. For anyone evaluating the
// tool, that is the difference between a demo and a blank screen.
//
// ORDERING IS OURS, NOT THE MODEL'S
//
// The sequence comes from the impact scores in lib/audit-guide.ts, which are
// deliberate editorial judgements about what actually moves outcomes. The
// model writes the reasoning and the effort estimate; it does not get to
// decide that a missing alt tag matters more than a noindex. Letting an LLM
// rank the work is how you get confident-sounding nonsense in a priority
// order nobody can defend.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import { RULE_GUIDE, byImpact } from "@/lib/audit-guide";
import { resolveBaseUrl } from "@/lib/site";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

type Finding = {
  rule:     string;
  severity: string;
  message:  string;
  page_url?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const caller = await getCallerOrNull();
    if (!caller) {
      return NextResponse.json({ success: false, reason: "unauthenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const auditId: string | undefined = body?.audit_id;

    // Load the audit and its findings.
    const auditQuery = caller.supabase
      .from("site_audits")
      .select("id, domain, score, pages_crawled, created_at")
      .eq("user_id", caller.user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const { data: auditRows } = auditId
      ? await caller.supabase.from("site_audits").select("id, domain, score, pages_crawled, created_at").eq("id", auditId).limit(1)
      : await auditQuery;

    const audit = (auditRows as { id: string; domain: string; score: number; pages_crawled: number }[] | null)?.[0];
    if (!audit) {
      return NextResponse.json({
        success: false, reason: "no_audit",
        message: "Run an audit first — the plan is built from its findings.",
      });
    }

    const { data: findingRows } = await caller.supabase
      .from("audit_findings")
      .select("rule, severity, message, page_url")
      .eq("audit_id", audit.id);

    const findings = (findingRows as Finding[] | null) ?? [];
    if (findings.length === 0) {
      return NextResponse.json({
        success: true,
        // No model call is made on this path, so nothing can have been skipped.
        narrativeSkipped: null,
        audit: { domain: audit.domain, score: audit.score },
        // A clean audit is a legitimate outcome and should read as one rather
        // than as a failure to produce advice.
        clean: true,
        actions: [],
        summary: "The audit found no issues worth acting on. That is a genuinely good result — the next gains are in content and answer-engine visibility rather than technical fixes.",
      });
    }

    // Group by rule so "17 pages missing meta descriptions" is one action
    // rather than seventeen, and attach our own impact score.
    const grouped = new Map<string, { rule: string; severity: string; count: number; example: string; pages: string[] }>();
    for (const f of findings) {
      const g = grouped.get(f.rule) ?? { rule: f.rule, severity: f.severity, count: 0, example: f.message, pages: [] };
      g.count += 1;
      if (f.page_url && g.pages.length < 5) g.pages.push(f.page_url);
      grouped.set(f.rule, g);
    }

    const ranked = [...grouped.values()]
      .map(g => ({ ...g, ...(RULE_GUIDE[g.rule] ?? { why: "", fix: "", impact: 0 }) }))
      .sort(byImpact)
      .slice(0, 8);

    // Ask Claude for the narrative only. Everything factual — rule, count,
    // impact, why, fix — is ours and is passed through untouched.
    const key = process.env.ANTHROPIC_API_KEY;
    let summary = "";
    let narrativeSkipped: "quota" | null = null;
    let effortByRule: Record<string, string> = {};

    if (key) {
      const prompt = [
        `A technical SEO audit of ${audit.domain} scored ${audit.score}/100 across ${audit.pages_crawled} pages.`,
        `The issues found, already ordered by our own impact scoring:`,
        ...ranked.map((r, i) => `${i + 1}. ${r.rule} (${r.count} occurrence${r.count === 1 ? "" : "s"}, impact ${r.impact}/100): ${r.example}`),
        ``,
        `Write a JSON object with exactly two keys:`,
        `"summary": 2-3 sentences for a business owner with no SEO background, saying what state the site is in and what to do first. Plain English, no jargon, no bullet points, British spelling.`,
        `"effort": an object mapping each rule id above to one of "quick" (under an hour), "medium" (a few hours), or "project" (a day or more).`,
        `Return ONLY the JSON object, no preamble or code fences.`,
      ].join("\n");

      try {
        const res = await fetch(`${resolveBaseUrl()}/api/claude`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") ?? "" },
          body:    JSON.stringify({ task: "audit_plan", prompt }),
        });
        const j = await res.json().catch(() => null);
        // The ordering and the fixes are ours and stay correct without the
        // model, so a cap or a failure degrades the narrative rather than the
        // plan. Recorded so the UI can say why the summary is missing instead
        // of leaving a blank someone reads as "nothing to say".
        if (j?.reason === "quota_exceeded") narrativeSkipped = "quota";
        const raw = String(j?.text ?? "").replace(/^```json\s*|\s*```$/g, "").trim();
        const parsed = JSON.parse(raw);
        summary      = String(parsed.summary ?? "");
        effortByRule = (parsed.effort ?? {}) as Record<string, string>;
      } catch {
        // The plan is still useful without the narrative — the ordering and
        // the fixes are ours. Degrade to those rather than failing outright.
        summary = "";
      }
    }

    const actions = ranked.map((r, i) => ({
      order:    i + 1,
      rule:     r.rule,
      title:    titleFor(r.rule, r.count),
      severity: r.severity,
      count:    r.count,
      impact:   r.impact,
      effort:   normaliseEffort(effortByRule[r.rule]),
      why:      r.why,
      fix:      r.fix,
      pages:    r.pages,
    }));

    return NextResponse.json({
      success: true,
      audit:   { domain: audit.domain, score: audit.score, pages: audit.pages_crawled },
      clean:   false,
      summary: summary || fallbackSummary(audit.domain, audit.score, actions.length),
      actions,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[site-audit/plan]", message);
    return NextResponse.json({ success: false, reason: "api_error", message });
  }
}

function normaliseEffort(v: string | undefined): "quick" | "medium" | "project" {
  return v === "quick" || v === "medium" || v === "project" ? v : "medium";
}

/** Human titles. The rule id is for us; a business owner should never see it. */
function titleFor(rule: string, count: number): string {
  const many = count > 1 ? ` (${count} pages)` : "";
  const NAMES: Record<string, string> = {
    robots_disallow_all:      "Let search engines see the site at all",
    homepage_unreachable:     "Make the homepage reachable",
    noindex_page:             `Remove the "do not index" instruction${many}`,
    canonical_to_noindex:     "Fix the conflicting indexing instructions",
    missing_title:            `Add a page title${many}`,
    duplicate_title:          `Give each page its own title${many}`,
    title_too_short:          `Lengthen the page title${many}`,
    title_too_long:           `Shorten the page title${many}`,
    missing_meta_description: `Write a search description${many}`,
    duplicate_meta_description: `Give each page its own description${many}`,
    meta_description_short:   `Lengthen the search description${many}`,
    meta_description_long:    `Shorten the search description${many}`,
    missing_h1:               `Add a main heading${many}`,
    multiple_h1:              `Keep one main heading per page${many}`,
    heading_skip:             `Fix the heading order${many}`,
    missing_viewport:         "Make the site work properly on phones",
    thin_content:             `Build out the thin pages${many}`,
    images_missing_alt:       `Describe the images${many}`,
    missing_canonical:        `Declare the preferred URL${many}`,
    broken_internal_link:     `Fix the broken links${many}`,
    no_structured_data:       "Add structured data so engines can quote you",
    sitemap_missing:          "Publish a sitemap",
    robots_missing:           "Add a robots.txt",
    incomplete_open_graph:    "Fix how links look when shared",
    low_performance_score:    "Speed the site up",
    low_accessibility_score:  "Fix the accessibility problems",
    hreflang_no_xdefault:     "Add a default language version",
  };
  return NAMES[rule] ?? rule.replace(/_/g, " ");
}

function fallbackSummary(domain: string, score: number, count: number): string {
  return `${domain} scored ${score} out of 100. There are ${count} things worth fixing, listed below in the order we would tackle them — the first few carry most of the benefit.`;
}
