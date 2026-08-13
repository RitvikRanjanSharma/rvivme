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
  auditCrawlerAccess, scoreAnswerReadiness, AI_CRAWLERS,
  type CrawlerAccess, type ReadinessReport,
} from "@/lib/ai-crawlers";

export const dynamic = "force-dynamic";

/** GSC stores "sc-domain:example.com" or "https://example.com/" — normalise. */
function toOrigin(siteUrl: string): string | null {
  const raw = siteUrl.trim();
  if (raw.startsWith("sc-domain:")) {
    const host = raw.slice("sc-domain:".length).trim();
    return host ? `https://${host}` : null;
  }
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

const UA = "AIMarketingLabBot/1.0 (+https://www.aimarketinglab.co.uk/bot)";

async function fetchText(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal:  controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

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

    const origin = toOrigin(siteUrl);
    if (!origin) {
      return NextResponse.json({
        success: false,
        reason:  "invalid_site",
        message: `Could not derive a URL from "${siteUrl}".`,
      });
    }

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

    const [robotsText, pageHtml] = await Promise.all([
      fetchText(`${origin}/robots.txt`),
      fetchText(target),
    ]);

    // No robots.txt is not an error — it means everything is permitted.
    const access: CrawlerAccess[] = auditCrawlerAccess(robotsText ?? "", "/");

    const readiness: ReadinessReport | null = pageHtml
      ? scoreAnswerReadiness(pageHtml, target)
      : null;

    // Summarise the access picture, separating the two cases that mean very
    // different things.
    const answerBots   = access.filter(a => a.crawler.purpose === "answers");
    const trainingBots = access.filter(a => a.crawler.purpose === "training");
    const answerBlocked   = answerBots.filter(a => a.status === "blocked");
    const trainingBlocked = trainingBots.filter(a => a.status === "blocked");

    return NextResponse.json({
      success: true,
      site: { origin, auditedUrl: target, robotsFound: robotsText !== null },
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
      pageFetched: pageHtml !== null,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[geo/crawlers]", message);
    return NextResponse.json({ success: false, reason: "api_error", message });
  }
}
