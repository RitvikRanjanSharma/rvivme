// app/api/competitors/discover/route.ts
// =============================================================================
// AI Marketing Lab — who AI names when someone asks for alternatives to you
//
// WHY THIS IS NOT THE FEATURE IT REPLACES
//
// The old discovery called DataForSEO Labs `competitors_domain`: who else ranks
// for the keywords you rank for, computed from a crawled SERP corpus. That is a
// measurement, we don't have the corpus, and there is no free equivalent —
// so this does not pretend to be the same thing.
//
// This asks a different question, and it happens to be the more useful one for
// this product: when a buyer asks ChatGPT or Claude "who else does this?", who
// gets named? That IS the shortlist now. A competitor who is invisible in
// search but named in every AI answer is taking meetings you never see.
//
// The answer comes from a model, so it carries a model's failure mode: it will
// confidently name companies that don't exist, or died in 2019, or operate on
// another continent. Two guards, in order of importance:
//
//   1. EVERY SUGGESTION IS FETCHED BEFORE IT IS RETURNED. A domain that does
//      not resolve, or does not serve a page, is dropped silently. This is the
//      whole difference between a suggestion and a hallucination, and it costs
//      one HEAD-ish request each.
//
//   2. THE SOURCE IS LABELLED IN THE RESPONSE, not just in our heads. The UI
//      says "named by AI" on every row, because a reader who assumes these came
//      from ranking data will draw conclusions the data cannot support.
//
// The model is also given the site's own homepage text. Asked cold from a
// domain name it guesses from the TLD; given the actual page it works from what
// the business says it does.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import { hostIsPublic, originCandidates } from "@/lib/site-fetch";
import { toOrigin, domainOf } from "@/lib/competitor-compare";
import { askClaude, parseJsonArray } from "@/lib/claude-client";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

const MAX_SUGGESTIONS = 8;

/**
 * Read enough of the homepage for the model to know what the business does.
 *
 * Tries the apex and the www sibling. The caller strips "www." before we ever
 * see the domain, so a site served from www was always asked for at its apex —
 * and a parked or mis-certificated apex produced "we couldn't read enough from
 * your homepage" about a site that is plainly up.
 */
async function homepageText(origin: string): Promise<string> {
  for (const candidate of originCandidates(origin)) {
    const text = await fetchOne(candidate);
    if (text.length >= 80) return text;
  }
  return "";
}

async function fetchOne(origin: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9_000);
  try {
    const res = await fetch(origin, {
      headers: { "User-Agent": "AIMarketingLabBot/1.0 (+https://www.aimarketinglab.co.uk/bot)" },
      signal: controller.signal, redirect: "follow",
    });
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2500);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Does this domain serve a real page?
 *
 * The only thing standing between "suggestion" and "invention". Deliberately
 * lenient about status codes — a 403 from bot mitigation still proves a server
 * is there answering for that hostname, which is the claim being checked.
 */
async function domainExists(domain: string): Promise<boolean> {
  const origin = toOrigin(domain);
  if (!origin || !hostIsPublic(new URL(origin).hostname)) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    const res = await fetch(origin, {
      method: "GET",
      headers: { "User-Agent": "AIMarketingLabBot/1.0 (+https://www.aimarketinglab.co.uk/bot)" },
      signal: controller.signal, redirect: "follow",
    });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  try {
    const caller = await getCallerOrNull();
    if (!caller) {
      return NextResponse.json({ success: false, reason: "unauthenticated" }, { status: 401 });
    }

    const body   = await request.json().catch(() => ({}));
    const origin = toOrigin(String(body?.domain ?? ""));
    if (!origin) {
      return NextResponse.json({
        success: false, reason: "invalid_url",
        message: "Set your website in Settings first — we work out competitors from what your site says you do.",
      });
    }
    if (!hostIsPublic(new URL(origin).hostname)) {
      return NextResponse.json({
        success: false, reason: "non_public_host",
        message: "That hostname isn't publicly reachable.",
      });
    }

    const exclude = Array.isArray(body?.exclude)
      ? (body.exclude as unknown[]).map(d => domainOf(String(d)).toLowerCase())
      : [];
    const you = domainOf(origin).toLowerCase();

    const text = await homepageText(origin);
    if (!text || text.length < 80) {
      return NextResponse.json({
        success: false, reason: "no_content",
        message: "We couldn't read enough from your homepage to work out who you compete with. Add competitors manually, or check the site is reachable.",
      });
    }

    const prompt = [
      `A buyer has just asked an AI assistant for alternatives to the business below. Name the companies that would come up.`,
      ``,
      `Domain: ${you}`,
      `What their homepage says:`,
      text,
      ``,
      `Return between 4 and ${MAX_SUGGESTIONS} real, currently-trading companies that a buyer would realistically be told to consider instead.`,
      `Weight towards businesses serving the same country and the same size of customer — a global enterprise vendor is not an alternative to a local agency.`,
      `Do not include ${you} itself.`,
      ``,
      `Return ONLY a JSON array. Each element: {"domain": "example.co.uk", "reason": "one short sentence on why a buyer would compare them"}.`,
      `Use the company's real primary domain, no scheme, no www, no path. If you are not confident a domain is correct, leave that company out entirely — a wrong domain is worse than a shorter list.`,
      `No code fences, no commentary.`,
    ].join("\n");

    const answer = await askClaude("competitor_names", prompt, request.headers.get("cookie"));
    if (!answer.ok) {
      // Every refusal is reported as itself. This used to check three of the
      // eight ways the proxy can fail and let the rest fall through to
      // JSON.parse(""), which surfaced as "the suggestion came back in a
      // format we couldn't read" — the wrong culprit, and an invitation to
      // retry something that would fail identically.
      return NextResponse.json({
        success: false,
        reason:  answer.reason,
        message: answer.reason === "not_configured"
          ? "Competitor discovery needs an Anthropic API key on the server. You can still add competitors manually."
          : answer.message,
      });
    }

    const parsed = parseJsonArray<{ domain?: string; reason?: string }>(answer.text);
    if (!parsed.ok) {
      // Genuinely unreadable now — and it says what it actually received.
      console.error("[competitors/discover] unparseable:", parsed.snippet);
      return NextResponse.json({
        success: false, reason: "unreadable",
        message: `The model answered in a format we couldn't read. Try again — if it keeps happening, it returned: ${parsed.snippet.slice(0, 120)}`,
      });
    }

    // Normalise, drop ourselves and anything already tracked.
    const seen = new Set<string>([you, ...exclude]);
    const candidates = parsed.value
      .map(c => ({ domain: domainOf(String(c?.domain ?? "")).toLowerCase(), reason: String(c?.reason ?? "").trim() }))
      .filter(c => c.domain && c.domain.includes(".") && !seen.has(c.domain))
      .filter(c => { if (seen.has(c.domain)) return false; seen.add(c.domain); return true; })
      .slice(0, MAX_SUGGESTIONS);

    // The guard that makes this a suggestion rather than an invention.
    const checks = await Promise.all(candidates.map(c => domainExists(c.domain)));
    const verified = candidates.filter((_, i) => checks[i]);
    const dropped  = candidates.length - verified.length;

    return NextResponse.json({
      success:     true,
      // Named in the payload so a future caller cannot mistake these for
      // ranking data by reading the field name alone.
      source:      "ai_named",
      sourceLabel: "Named by AI — verified reachable, not measured from ranking data",
      competitors: verified,
      /** How many the model named that turned out not to exist. Shown, not hidden. */
      dropped,
      checked:     candidates.length,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[competitors/discover]", message);
    return NextResponse.json({ success: false, reason: "api_error", message });
  }
}
