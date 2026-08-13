// app/api/geo/crawlers/route.ts
// =============================================================================
// AI Marketing Lab — answer-engine visibility audit
//
// Two questions, both answerable without any installation on the user's site:
//   1. Are AI crawlers allowed to read it? (robots.txt)
//   2. Is the content shaped so they can extract from it? (page structure)
//
// Uses the site URL already stored for Search Console, so there's nothing new
// for the user to configure.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import {
  auditCrawlerAccess, scoreAnswerReadiness, extractSitemapPaths, AI_CRAWLERS,
  type CrawlerAccess, type ReadinessReport,
} from "@/lib/ai-crawlers";
import { originCandidates, fetchText, fetchAcrossOrigins } from "@/lib/site-fetch";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const caller = await getCallerOrNull();
    if (!caller) {
      return NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 });
    }

    const { data } = await caller.supabase
      .from("users").select("gsc_site_url").eq("id", caller.user.id).single();
    const siteUrl = (data as { gsc_site_url: string | null } | null)?.gsc_site_url?.trim();

    if (!siteUrl) {
      return NextResponse.json({
        success: false,
        reason:  "not_configured",
        message: "Add your site under Settings to run the answer-engine audit.",
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

    // Resolve robots.txt first: whichever host answers is the host we then
    // audit the page on, so both halves of the report describe the same site.
    const { result: robots, origin } = await fetchAcrossOrigins(candidates, "/robots.txt");

    // Optional override so the user can audit a specific page rather than the
    // homepage — homepages are often the least representative page on a site.
    const targetParam = new URL(request.url).searchParams.get("url");
    let target = origin;
    if (targetParam) {
      try {
        const parsed = new URL(targetParam, origin);
        // Never fetch someone else's origin on the user's behalf.
        if (parsed.origin === origin) target = parsed.toString();
      } catch { /* fall back to origin */ }
    }

    // The sitemap is how we tell a meaningful exclusion from routine
    // housekeeping: a Disallow covering a URL the site publishes is a real
    // contradiction, one covering /admin is not. Prefer the location robots.txt
    // declares, since a site may not use the conventional path.
    const declaredSitemap = robots.kind === "ok"
      ? robots.text.match(/^\s*sitemap:\s*(\S+)/im)?.[1]
      : undefined;

    let sitemapUrl = `${origin}/sitemap.xml`;
    if (declaredSitemap) {
      try {
        const u = new URL(declaredSitemap, origin);
        if (u.origin === origin) sitemapUrl = u.toString();
      } catch { /* keep the conventional path */ }
    }

    const [page, sitemap] = await Promise.all([
      fetchText(target),
      fetchText(sitemapUrl),
    ]);

    const publicPaths = sitemap.kind === "ok"
      ? extractSitemapPaths(sitemap.text, origin)
      : [];

    // Only claim a crawler is allowed when we actually read the rules. An
    // absent robots.txt genuinely does permit everything; an unreachable one
    // tells us nothing, so we return no verdicts rather than ten green ones.
    const robotsKnown = robots.kind !== "unreachable";
    const access: CrawlerAccess[] = robotsKnown
      ? auditCrawlerAccess(robots.kind === "ok" ? robots.text : "", "/", publicPaths)
      : [];

    const readiness: ReadinessReport | null =
      page.kind === "ok" ? scoreAnswerReadiness(page.text, target) : null;

    // Summarise the access picture, separating the two cases that mean very
    // different things.
    const answerBots   = access.filter(a => a.crawler.purpose === "answers");
    const trainingBots = access.filter(a => a.crawler.purpose === "training");
    const answerBlocked   = answerBots.filter(a => a.status === "blocked");
    const trainingBlocked = trainingBots.filter(a => a.status === "blocked");

    return NextResponse.json({
      success: true,
      site: {
        origin,
        auditedUrl: target,
        // True when the stored site URL named a host we couldn't reach and a
        // sibling answered instead — worth surfacing, since it usually means
        // the apex is misconfigured.
        resolvedFromFallback: origin !== candidates[0],
        requestedOrigin: candidates[0],
      },
      robots: {
        state:  robots.kind === "ok" ? "found" : robots.kind === "absent" ? "absent" : "unreachable",
        url:    robots.url,
        detail: robots.kind === "unreachable" ? robots.detail
              : robots.kind === "absent"      ? `the server returned ${robots.status}`
              : null,
      },
      page: {
        state:  page.kind === "ok" ? "ok" : page.kind === "absent" ? "absent" : "unreachable",
        url:    target,
        detail: page.kind === "unreachable" ? page.detail
              : page.kind === "absent"      ? `the server returned ${page.status}`
              : null,
      },
      sitemap: {
        state:      sitemap.kind === "ok" ? "found" : sitemap.kind,
        url:        sitemapUrl,
        pageCount:  publicPaths.length,
      },
      access,
      readiness,
      summary: {
        answerBotsTotal:   answerBots.length,
        answerBotsBlocked: answerBlocked.length,
        trainingBotsBlocked: trainingBlocked.length,
        // The headline finding: blocking answer bots costs visibility directly,
        // whereas blocking training bots is a legitimate editorial choice.
        criticalBlocks: answerBlocked.map(a => a.crawler.name),
      },
      crawlerCount: AI_CRAWLERS.length,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[geo/crawlers]", message);
    return NextResponse.json({ success: false, reason: "api_error", message });
  }
}
