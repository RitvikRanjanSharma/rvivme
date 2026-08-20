// app/api/competitors/content-gap/route.ts
// =============================================================================
// AI Marketing Lab — what they publish that you have no presence for
//
// Replaces the competitor-keywords call, which needed a SERP corpus we do not
// have and had been returning "unavailable" while the page carried on calling
// it. See lib/content-gap.ts for what this asks instead and why it is a
// narrower but true claim.
//
// TWO REAL SOURCES, NO ESTIMATES
//   their side — sitemap, then each page's <title> and <h1>
//   your side  — the queries Search Console says you got impressions for
//
// COST CONTROL
//
// A competitor with 4,000 sitemap entries would be 4,000 fetches. We sample:
// the first N after de-duplication, fetched with bounded concurrency, and the
// response says exactly how many of how many were looked at. A sample reported
// as a total is a lie with a plausible shape, which is the kind that survives
// review.
//
// SECURITY: outbound requests to a caller-supplied URL. Control is
// hostIsPublic() from lib/site-fetch, as everywhere else.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import { hostIsPublic, describeFetchError } from "@/lib/site-fetch";
import { extractSitemapPaths } from "@/lib/ai-crawlers";
import { toOrigin, domainOf, sitemapsFromRobots } from "@/lib/competitor-compare";
import {
  assessPages, buildGapReport, brandWordsFor,
  type CompetitorPage, type YourQuery,
} from "@/lib/content-gap";
import { resolveGoogleToken } from "@/lib/google-oauth";
import { callerGscSite } from "@/lib/caller-site";

export const dynamic     = "force-dynamic";
export const maxDuration = 120;

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";
const GSC_SCOPE    = "https://www.googleapis.com/auth/webmasters.readonly";

/** Pages we will fetch from one competitor. Beyond this the value flattens. */
const SAMPLE_SIZE  = 40;
/** Simultaneous fetches. Enough to be quick, few enough not to look like a flood. */
const CONCURRENCY  = 6;
const UA = "AIMarketingLabBot/1.0 (+https://www.aimarketinglab.co.uk/bot)";

async function get(url: string, timeoutMs = 8000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" },
      signal: controller.signal, redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  if (!m?.[1]) return null;
  return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
}

/** Run tasks with a fixed ceiling on how many are in flight. */
async function pooled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** The caller's own queries, straight from Search Console. */
async function yourQueries(siteUrl: string, token: string, limit = 250): Promise<YourQuery[]> {
  const end   = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const start = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const res = await fetch(
    `${GSC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: start, endDate: end, searchType: "web",
        dimensions: ["query"], rowLimit: limit,
        orderBy: [{ fieldName: "impressions", sortOrder: "DESCENDING" }],
      }),
    },
  );
  if (!res.ok) throw new Error(`Search Console returned ${res.status}`);
  const json = await res.json();
  return ((json.rows ?? []) as Array<{ keys: [string]; impressions: number }>)
    .map(r => ({ term: r.keys[0], impressions: Math.round(r.impressions) }));
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
        message: `"${String(body?.domain ?? "")}" isn't a domain we can fetch.`,
      });
    }
    if (!hostIsPublic(new URL(origin).hostname)) {
      return NextResponse.json({
        success: false, reason: "non_public_host",
        message: "That hostname isn't publicly reachable.",
      });
    }

    // ── Your side: Search Console ──────────────────────────────────────────
    const site = await callerGscSite(caller.supabase, caller.user.id);
    if (!site.ok) {
      return NextResponse.json({
        success: false, reason: site.reason,
        message: site.reason === "not_configured"
          ? "This compares what they publish against the queries you actually appear for, so it needs Search Console connected under Settings → Integrations."
          : site.message,
      });
    }
    const siteUrl = site.siteUrl;

    // Caller's own OAuth connection first, shared service account second.
    const tokenResult = await resolveGoogleToken(caller.user.id, GSC_SCOPE);
    if (!tokenResult.ok) {
      return NextResponse.json({
        success: false,
        reason:  tokenResult.reason === "reauth_required" ? "reauth_required" : "not_connected",
        message: tokenResult.message,
      });
    }

    let queries: YourQuery[];
    try {
      queries = await yourQueries(siteUrl, tokenResult.accessToken);
    } catch (e) {
      return NextResponse.json({
        success: false, reason: "gsc_error",
        message: e instanceof Error ? e.message : "Couldn't read your Search Console queries.",
      });
    }

    if (queries.length === 0) {
      // Everything would come back as a gap, which is technically true and
      // completely useless — and it would read as a competitor finding rather
      // than as "we have no data about you yet".
      return NextResponse.json({
        success: false, reason: "no_queries",
        message: "Search Console has no queries for your site in the last 28 days, so there is nothing to compare against yet. This usually means the property is new or the wrong one is selected.",
      });
    }

    // ── Their side: sitemap, then titles ───────────────────────────────────
    const robots   = await get(`${origin}/robots.txt`, 6000);
    const declared = robots ? sitemapsFromRobots(robots) : [];
    let paths: string[] = [];
    let sitemapUrl: string | null = null;

    for (const candidate of [...declared, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`].slice(0, 3)) {
      const xml = await get(candidate);
      if (!xml) continue;

      if (/<sitemapindex/i.test(xml)) {
        const children = [...xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
          .map(m => m[1]).slice(0, 3);
        for (const child of children) {
          const c = await get(child);
          if (c) paths.push(...extractSitemapPaths(c, origin));
        }
      } else {
        paths = extractSitemapPaths(xml, origin);
      }
      if (paths.length > 0) { sitemapUrl = candidate; break; }
    }

    if (paths.length === 0) {
      return NextResponse.json({
        success: false, reason: "no_sitemap",
        message: `We couldn't read a sitemap for ${domainOf(origin)}, so there is no list of their pages to compare. Nothing is wrong with your site — theirs just doesn't publish one we can find.`,
      });
    }

    const unique  = [...new Set(paths)];
    const sampled = unique.slice(0, SAMPLE_SIZE);

    const fetched = await pooled(sampled, CONCURRENCY, async (path): Promise<CompetitorPage | null> => {
      const html = await get(`${origin}${path}`);
      if (!html) return null;
      return {
        url:   `${origin}${path}`,
        title: firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
        h1:    firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
      };
    });

    const pages = fetched.filter((p): p is CompetitorPage => p !== null);
    if (pages.length === 0) {
      return NextResponse.json({
        success: false, reason: "unreachable",
        message: `Their sitemap lists ${unique.length} pages but none of them responded to us.`,
      });
    }

    const brand  = brandWordsFor(domainOf(origin), site.websiteUrl, siteUrl.replace("sc-domain:", ""));
    const report = buildGapReport(assessPages(pages, queries, brand));

    return NextResponse.json({
      success: true,
      competitor: domainOf(origin),
      sitemapUrl,
      // Stated plainly. The number of pages we looked at is not the number
      // they have, and the difference has to be visible in the UI.
      sample: {
        fetched:      pages.length,
        attempted:    sampled.length,
        totalInSitemap: unique.length,
        truncated:    unique.length > sampled.length,
      },
      basis: {
        queries:  queries.length,
        period:   "last 28 days",
        siteUrl,
      },
      ...report,
    });

  } catch (err) {
    const message = err instanceof Error ? describeFetchError(err) || err.message : "unknown error";
    console.error("[competitors/content-gap]", message);
    return NextResponse.json({ success: false, reason: "api_error", message });
  }
}
