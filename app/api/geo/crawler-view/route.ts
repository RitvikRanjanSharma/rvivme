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
// The control is the hostname check: it must be publicly routable by name.
// localhost, RFC1918 ranges, and the link-local cloud-metadata address are
// refused outright, which is what stops this being used to reach anything
// inside our network. Requests are also authenticated, time-boxed, and capped
// at two fetches.
//
// This deliberately does NOT require the target to be a Search Console
// property. It used to, and that was a mistake worth recording: the site audit
// makes the same class of outbound fetch with the same protections against any
// public domain, so the identical action was permitted on one page and refused
// on another. The requirement also filtered honest users evaluating the tool
// far more effectively than anyone else, since verifying a domain you control
// in Search Console is not a meaningful barrier to someone acting in bad
// faith. Same threat, same defence, both pages.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import { originCandidates, fetchText } from "@/lib/site-fetch";
import { parseRobots, crawlerAccess, AI_CRAWLERS } from "@/lib/ai-crawlers";
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

    // Any public URL, exactly like the site audit.
    //
    // This used to REQUIRE a Search Console-verified site and refuse anything
    // outside it, on the theory that Google's ownership check was the safest
    // proof a caller owned the target. In practice that was incoherent: the
    // site audit performs the same class of outbound fetch, with the same
    // protections, against any public domain — so the same action was allowed
    // on one page and refused on another.
    //
    // It also bought very little. Anyone can verify a domain they control in
    // Search Console, so it filtered out honest users evaluating the tool far
    // more effectively than it filtered anyone else. What actually protects
    // this endpoint is the public-hostname check below, which is the same
    // control the audit relies on.
    const params    = new URL(request.url).searchParams;
    const requested = params.get("url")?.trim();

    let target: string | null = null;

    if (requested) {
      target = normaliseUrl(requested);
      if (!target) {
        return NextResponse.json({
          success: false,
          reason:  "invalid_url",
          message: `"${requested}" is not a URL we can fetch. Include the domain, e.g. example.co.uk`,
        });
      }
    } else {
      // Nothing typed — fall back to the site on the account, if there is one.
      const { data } = await caller.supabase
        .from("users").select("website_url, gsc_site_url").eq("id", caller.user.id).maybeSingle();
      const row     = data as { website_url: string | null; gsc_site_url: string | null } | null;
      const stored  = row?.website_url?.trim() || row?.gsc_site_url?.trim() || "";
      // The signup sentinel is not a real site and must never be audited.
      const usable  = stored && stored !== "https://example.com" ? stored : "";
      const origins = usable ? originCandidates(usable) : [];
      target = origins[0] ?? null;

      if (!target) {
        return NextResponse.json({
          success: false,
          reason:  "no_target",
          message: "Type a URL above to check it — or set your website in Settings and we'll use that.",
        });
      }
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

    // Check robots.txt FIRST so a page the site already excludes is reported as
    // excluded, not as broken. Without this the tool told the owner of an
    // app screen to "server-render your content" about a URL no crawler will
    // ever request — advice for a problem that does not exist.
    let disallowed = false;
    try {
      const targetPath = new URL(target).pathname;
      const robotsRes  = await fetchText(`${new URL(target).origin}/robots.txt`);
      if (robotsRes.kind === "ok") {
        const groups  = parseRobots(robotsRes.text);
        const crawler = AI_CRAWLERS.find(c => c.token === agent);
        if (crawler) {
          const access = crawlerAccess(groups, crawler, targetPath);
          disallowed = access.status === "blocked"
            || (access.excluded ?? []).some(p => targetPath.startsWith(p));
        }
      }
    } catch {
      // Unknown is not the same as disallowed. If we cannot read robots.txt we
      // report on the content as usual rather than inventing an exclusion.
      disallowed = false;
    }

    const result = await inspectAsCrawler(target, agent, fetch, disallowed);

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
