// app/api/geo/crawler-view/route.ts
// =============================================================================
// AI Marketing Lab — "show me what ChatGPT actually receives"
//
// Fetches one page twice, as an answer-engine crawler and as a browser, and
// reports the difference. See lib/ai-crawler-view.ts for why that comparison is
// the whole trick.
//
// SECURITY: THIS ENDPOINT MAKES OUTBOUND REQUESTS ON BEHALF OF A CALLER
//
// Left open, that is a server-side request forgery hole and an abuse vector —
// anyone with an account could use our servers to fetch arbitrary URLs,
// including cloud metadata endpoints and hosts behind our network boundary.
//
// Two independent controls, because either alone has a gap:
//
//   1. The target must be on the origin the caller has already verified in
//      Search Console (or its www/apex sibling). Google verified that
//      ownership, not us, which is what makes it trustworthy.
//   2. The hostname must resolve to something publicly routable by name —
//      localhost, private ranges and the link-local metadata address are
//      refused outright. This is belt-and-braces against a stored site URL
//      that is somehow hostile, and it costs one regex.
//
// Control 1 alone would be enough today, but it depends on an assumption about
// upstream data. Control 2 does not depend on anything.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import { originCandidates } from "@/lib/site-fetch";
import {
  inspectAsCrawler, normaliseUrl, CRAWLER_AGENTS, DEFAULT_AGENT,
} from "@/lib/ai-crawler-view";

export const dynamic = "force-dynamic";
// Two sequential fetches at 10s each, plus overhead. Well inside the limit, but
// declared so a slow origin fails as a timeout rather than a killed process —
// the failure mode that previously made the site audit look like it silently
// did nothing.
export const maxDuration = 30;

/** Hostnames we will never fetch, whatever the database says. */
const BLOCKED_HOST = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0$|\[?::1\]?$|.*\.local$|.*\.internal$)/i;
/** 172.16.0.0/12 — the range that needs arithmetic rather than a prefix. */
function isPrivate172(hostname: string): boolean {
  const m = hostname.match(/^172\.(\d+)\./);
  return !!m && Number(m[1]) >= 16 && Number(m[1]) <= 31;
}

function hostIsPublic(hostname: string): boolean {
  return !BLOCKED_HOST.test(hostname) && !isPrivate172(hostname);
}

export async function GET(request: NextRequest) {
  try {
    const caller = await getCallerOrNull();
    if (!caller) {
      return NextResponse.json({ success: false, reason: "unauthenticated" }, { status: 401 });
    }

    const { data } = await caller.supabase
      .from("users").select("gsc_site_url").eq("id", caller.user.id).single();
    const siteUrl = (data as { gsc_site_url: string | null } | null)?.gsc_site_url?.trim();

    if (!siteUrl) {
      return NextResponse.json({
        success: false,
        reason:  "not_configured",
        message: "Connect Search Console and pick your site under Settings first.",
      });
    }

    const candidates = originCandidates(siteUrl);
    if (candidates.length === 0) {
      return NextResponse.json({
        success: false,
        reason:  "invalid_site",
        message: `Could not derive a URL from "${siteUrl}".`,
      });
    }

    const params = new URL(request.url).searchParams;

    // Default to the homepage of the primary candidate; allow any path on an
    // origin the caller owns.
    const requested = params.get("url")?.trim();
    let target = candidates[0];

    if (requested) {
      const normalised = normaliseUrl(requested);
      if (!normalised) {
        return NextResponse.json({
          success: false,
          reason:  "invalid_url",
          message: `"${requested}" is not a URL we can fetch.`,
        });
      }
      const parsed = new URL(normalised);
      const ownsOrigin = candidates.some(c => new URL(c).hostname === parsed.hostname);
      if (!ownsOrigin) {
        return NextResponse.json({
          success: false,
          reason:  "foreign_origin",
          message: `This checks pages on your own site (${new URL(candidates[0]).hostname}). To audit ${parsed.hostname}, add it in Search Console first.`,
        });
      }
      target = normalised;
    }

    if (!hostIsPublic(new URL(target).hostname)) {
      return NextResponse.json({
        success: false,
        reason:  "non_public_host",
        message: "That hostname isn't publicly reachable, so no crawler could fetch it either.",
      });
    }

    const agentParam = params.get("agent") ?? DEFAULT_AGENT;
    const agent = agentParam in CRAWLER_AGENTS ? agentParam : DEFAULT_AGENT;

    const result = await inspectAsCrawler(target, agent);

    return NextResponse.json({
      success: true,
      // The full HTML is deliberately NOT returned — it can be megabytes, and
      // the extracted text is what the question is actually about.
      url:        result.url,
      agent:      result.agent,
      agentLabel: result.agentLabel,
      agentNote:  CRAWLER_AGENTS[result.agent]?.note ?? null,
      verdict:    result.verdict,
      parity:     result.parity,
      findings:   result.findings,
      crawler: {
        ok: result.crawler.ok, status: result.crawler.status, error: result.crawler.error,
        wordCount: result.crawler.wordCount, title: result.crawler.title, h1: result.crawler.h1,
        // Capped: enough to see what the engine has to work with, without
        // shipping an entire page through the JSON response.
        text: result.crawler.text.slice(0, 4000),
        truncated: result.crawler.text.length > 4000,
      },
      browser: {
        ok: result.browser.ok, status: result.browser.status, error: result.browser.error,
        wordCount: result.browser.wordCount, title: result.browser.title, h1: result.browser.h1,
        text: result.browser.text.slice(0, 4000),
        truncated: result.browser.text.length > 4000,
      },
      agents: Object.entries(CRAWLER_AGENTS).map(([key, v]) => ({
        key, label: v.label, note: v.note,
      })),
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[geo/crawler-view]", message);
    return NextResponse.json({ success: false, reason: "api_error", message });
  }
}
