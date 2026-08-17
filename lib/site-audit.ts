// lib/site-audit.ts
// =============================================================================
// AI Marketing Lab — Technical SEO Crawler
// =============================================================================
// A small, dependency-free crawler. We deliberately avoid adding cheerio /
// jsdom for the soft launch — for the rules we care about (title, meta
// description, H1, image alt, internal/external links, JSON-LD presence,
// canonical, hreflang, robots, sitemap, basic CWV via PSI), regex against
// the raw HTML is enough and keeps deploys simple.
//
// What this module produces:
//   * One overall score (0-100) plus per-category sub-scores.
//   * A list of findings with severity (error / warning / notice), category,
//     rule code, page URL, message, and structured detail. Findings get
//     persisted to public.audit_findings by the API route.
//
// What it does NOT do (deferred to September):
//   * JS rendering — we only see server-rendered HTML
//   * Deep crawl — we crawl the homepage + up to ~10 same-origin links
//   * Sitemap parsing of large sitemaps with index files
//   * Per-page LCP/CLS/INP via real CrUX data — only PSI lab metrics
// =============================================================================

import { originCandidates, fetchText } from "@/lib/site-fetch";
import { parseRobots, scoreAnswerReadiness } from "@/lib/ai-crawlers";
import { enrich, byImpact } from "@/lib/audit-guide";

export type Severity  = "error" | "warning" | "notice";
export type Category  =
  | "on_page" | "technical" | "performance"
  | "accessibility" | "best_practice" | "content" | "schema";

export type Finding = {
  rule:     string;
  severity: Severity;
  category: Category;
  page_url?: string;
  message:  string;
  detail?:  Record<string, unknown>;
  /**
   * Why this matters and what to do — filled from RULE_GUIDE, not per finding.
   *
   * Every other analysis surface in this product explains itself: Opportunities
   * carries evidence chains, Answer engines and Local carry a `why` on each
   * check. Site audit was the exception, and it is the one a customer would
   * call "the audit" — so the flagship surface was the only one behaving like
   * every other SEO tool. "Page has only ~57 words" states a fact; it doesn't
   * tell anyone whether to care.
   */
  why?:     string;
  fix?:     string;
  /** 0-100. Drives ordering — see IMPACT in RULE_GUIDE. */
  impact?:  number;
};

export type AuditResult = {
  domain:      string;
  pages_crawled: number;
  findings:    Finding[];
  // Lighthouse-style scores from PSI
  performance:    number | null;
  accessibility:  number | null;
  best_practices: number | null;
  seo:            number | null;
  lcp_ms:         number | null;
  cls:            number | null;
  inp_ms:         number | null;
  // Computed weighted score across all categories
  overall_score:  number;
  meta:           Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// runAudit: orchestrator. Pulls homepage + a few same-origin pages, runs
// each through the on-page checks, fetches PSI for the homepage, and combines
// everything into an AuditResult.
// ---------------------------------------------------------------------------
export async function runAudit(domain: string): Promise<AuditResult> {
  // Resolve which host actually serves the site before crawling anything.
  //
  // normaliseDomain just prepends https:// to whatever it is given. For a
  // Search Console domain property that yields the apex — and an apex with a
  // parking certificate fails at TLS, so every check below would report a
  // missing robots.txt, a missing sitemap and an unreachable homepage. The
  // audit would look like a catastrophic result for a perfectly healthy site.
  //
  // Same fallback the answer-engine and local modules use: try the given host,
  // then its www/apex sibling, and crawl whichever one answers.
  const baseUrl  = await resolveReachableBase(normaliseDomain(domain));
  const findings: Finding[] = [];
  const meta:     Record<string, unknown> = { ran_at: new Date().toISOString(), base_url: baseUrl };

  // 1. Robots.txt
  const robots = await fetchRobotsTxt(baseUrl);
  meta.robots = robots;
  if (!robots.found) {
    findings.push({
      rule:     "robots_missing",
      severity: "warning",
      category: "technical",
      message:  "robots.txt was not found at /robots.txt.",
      page_url: `${baseUrl}/robots.txt`,
    });
  } else if (robots.disallowsAll) {
    findings.push({
      rule:     "robots_disallow_all",
      severity: "error",
      category: "technical",
      message:  "robots.txt blocks all crawlers (User-agent: * / Disallow: /).",
      page_url: `${baseUrl}/robots.txt`,
    });
  }

  // 2. Sitemap discovery
  const sitemapUrl = robots.sitemap ?? `${baseUrl}/sitemap.xml`;
  const sitemap = await fetchSitemap(sitemapUrl);
  meta.sitemap = { url: sitemapUrl, found: sitemap.found, urls: sitemap.urls.length };
  if (!sitemap.found) {
    findings.push({
      rule:     "sitemap_missing",
      severity: "warning",
      category: "technical",
      message:  "Sitemap.xml was not found.",
      page_url: sitemapUrl,
    });
  }

  // 3. Crawl homepage + a handful of additional same-origin pages.
  const homepageHtml = await safeFetchHtml(baseUrl);
  if (!homepageHtml.ok) {
    findings.push({
      rule:     "homepage_unreachable",
      severity: "error",
      category: "technical",
      message:  `Could not fetch homepage (${homepageHtml.status ?? "network error"}).`,
      page_url: baseUrl,
      detail:   { error: homepageHtml.error },
    });
    return assemble(baseUrl, findings, meta, null, 0);
  }

  // Run on-page checks on the homepage.
  const pageFacts: PageFacts[] = [];
  findings.push(...checkOnPage(baseUrl, homepageHtml.html, pageFacts));

  // Pick up to 8 same-origin links from the homepage and audit them too —
  // excluding anything robots.txt tells crawlers to leave alone. See
  // isAuditable for why that matters more than it sounds.
  const allLinks   = extractInternalLinks(baseUrl, homepageHtml.html);
  const auditable  = allLinks.filter(l => isAuditable(l, baseUrl, robots.disallow));
  const skipped    = allLinks.length - auditable.length;
  const sameOriginLinks = auditable.slice(0, 8);
  meta.crawl = { discovered: allLinks.length, audited: sameOriginLinks.length, skipped_disallowed: skipped };
  for (const link of sameOriginLinks) {
    const sub = await safeFetchHtml(link);
    if (!sub.ok) {
      findings.push({
        rule:     "broken_internal_link",
        severity: "warning",
        category: "technical",
        message:  `Internal link returned ${sub.status ?? "network error"}.`,
        page_url: link,
      });
      continue;
    }
    findings.push(...checkOnPage(link, sub.html, pageFacts));
  }
  const pagesCrawled = 1 + sameOriginLinks.length;

  // ── Answer-engine readiness ───────────────────────────────────────────────
  // This scoring already existed and ran only on the Answer engines page, so
  // the surface everyone calls "the audit" contained no AEO/GEO content at all.
  // Same nine weighted checks, folded in here as findings, so one report
  // covers search engines and answer engines rather than splitting them across
  // two pages a user has to know to visit.
  const readiness = scoreAnswerReadiness(homepageHtml.html, baseUrl);
  meta.answer_readiness = { score: readiness.score };
  for (const check of readiness.checks) {
    if (check.passed) continue;
    findings.push({
      rule:     `aeo_${check.id}`,
      severity: check.weight >= 3 ? "warning" : "notice",
      category: "content",
      message:  `Answer engines: ${check.label.toLowerCase()}.`,
      page_url: baseUrl,
      detail:   { detail: check.detail, weight: check.weight },
      // The readiness checks already carry their own reasoning, so they bring
      // it with them instead of needing an entry in RULE_GUIDE.
      why:      check.why,
      fix:      check.detail ?? undefined,
      impact:   Math.min(100, 30 + check.weight * 12),
    });
  }

  // Cross-page checks need every page collected first.
  findings.push(...checkAcrossPages(pageFacts));
  meta.pages = pageFacts.map(f => f.url);

  // 4. PageSpeed Insights — homepage only for v1.
  const psi = await fetchPSI(baseUrl);
  if (psi.ok) {
    meta.psi = { strategy: "mobile" };
    if (psi.scores.performance != null && psi.scores.performance < 50) {
      findings.push({
        rule:     "low_performance_score",
        severity: "warning",
        category: "performance",
        message:  `Mobile performance score is ${psi.scores.performance}. Aim for 90+.`,
        page_url: baseUrl,
      });
    }
    if (psi.scores.accessibility != null && psi.scores.accessibility < 80) {
      findings.push({
        rule:     "low_accessibility_score",
        severity: "warning",
        category: "accessibility",
        message:  `Accessibility score is ${psi.scores.accessibility}. Several quick wins likely available.`,
        page_url: baseUrl,
      });
    }
  }

  // baseUrl, not domain: the summary must show the host we actually crawled.
  // They differ whenever the apex/www fallback fires, and reporting the
  // requested host next to findings on a different one is quietly confusing.
  return assemble(baseUrl, findings, meta, psi.ok ? psi : null, pagesCrawled);
}

// ---------------------------------------------------------------------------
// On-page checks for one HTML document. Pure function — easy to unit test.
// ---------------------------------------------------------------------------
/** What one page told us, kept so cross-page checks can compare them. */
export type PageFacts = {
  url:         string;
  title:       string | null;
  description: string | null;
  canonical:   string | null;
  noindex:     boolean;
  headings:    number[];   // heading levels in document order
};

function checkOnPage(url: string, html: string, collect?: PageFacts[]): Finding[] {
  const findings: Finding[] = [];
  const head = extractHead(html);

  // ── Indexability ─────────────────────────────────────────────────────────
  // A page can be excluded three different ways — a robots meta tag, a
  // canonical pointing elsewhere, or absence from the sitemap — and they are
  // routinely set by different people at different times. The failure mode
  // that matters is a page you are actively trying to rank quietly carrying a
  // noindex from a staging config.
  const robotsMeta = extractFirst(head, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i)
                  ?? extractFirst(head, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["']/i);
  const noindex = /noindex/i.test(robotsMeta ?? "");
  if (noindex) {
    findings.push(of("noindex_page", "error", "technical",
      "Page asks search engines not to index it (robots meta: noindex).", url,
      { robots_meta: robotsMeta }));
  }

  // ── Heading hierarchy ────────────────────────────────────────────────────
  const headings = [...html.matchAll(/<h([1-6])[\s>]/gi)].map(m => Number(m[1]));
  for (let i = 1; i < headings.length; i++) {
    if (headings[i] - headings[i - 1] > 1) {
      findings.push(of("heading_skip", "notice", "on_page",
        `Heading level jumps from h${headings[i - 1]} to h${headings[i]}.`, url,
        { from: headings[i - 1], to: headings[i] }));
      break;   // one report per page; the pattern matters, not every instance
    }
  }

  // ── Page context ─────────────────────────────────────────────────────────
  // Captured once and attached to the findings that can be fixed by writing
  // something. A suggested title generated from the rule alone would be
  // generic advice with a different font; generated from the page's own
  // heading and opening sentences it is specific enough to paste.
  const firstH1  = decodeEntities(
    (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
  const bodyText = decodeEntities(
    html.replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
        .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
        .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
  const context = {
    h1:      firstH1 || undefined,
    // Enough for a model to know the subject; short enough not to bloat the row.
    excerpt: bodyText.slice(0, 600) || undefined,
  };

  // Title
  const title = decodeEntities(extractFirst(head, /<title[^>]*>([\s\S]*?)<\/title>/i)?.trim() ?? "") || undefined;
  if (!title) {
    findings.push(of("missing_title", "error", "on_page", "Page is missing a <title> tag.", url, { ...context }));
  } else if (title.length < 15) {
    findings.push(of("title_too_short", "warning", "on_page", `Title is only ${title.length} characters. Aim for 50-60.`, url, { title, length: title.length, ...context }));
  } else if (title.length > 65) {
    findings.push(of("title_too_long", "notice", "on_page", `Title is ${title.length} characters and may be truncated in SERPs.`, url, { title, length: title.length, ...context }));
  }

  // Meta description
  const desc = extractMeta(head, "description");
  if (!desc) {
    findings.push(of("missing_meta_description", "error", "on_page", "Page is missing a meta description.", url, { title, ...context }));
  } else if (desc.length < 70) {
    findings.push(of("meta_description_short", "notice", "on_page", `Meta description is ${desc.length} characters; aim for 120-160.`, url, { description: desc, length: desc.length, title, ...context }));
  } else if (desc.length > 170) {
    findings.push(of("meta_description_long", "notice", "on_page", `Meta description is ${desc.length} characters; SERPs may truncate it.`, url, { description: desc, length: desc.length, title, ...context }));
  }

  // H1
  const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
  if (h1Matches.length === 0) {
    findings.push(of("missing_h1", "error", "on_page", "Page has no <h1> heading.", url, { title, ...context }));
  } else if (h1Matches.length > 1) {
    findings.push(of("multiple_h1", "warning", "on_page", `Page has ${h1Matches.length} <h1> tags; use one canonical heading.`, url,
      { headings: h1Matches.map(m => decodeEntities(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()).slice(0, 6), ...context }));
  }

  // Canonical
  const canonical = extractFirstAttr(head, /<link[^>]*rel=["']canonical["'][^>]*>/i, "href");
  if (!canonical) {
    findings.push(of("missing_canonical", "warning", "on_page", "No <link rel=\"canonical\"> on the page.", url, { url }));
  }

  // viewport
  const viewport = extractMetaName(head, "viewport");
  if (!viewport) {
    findings.push(of("missing_viewport", "error", "best_practice", "Missing <meta name=\"viewport\"> — required for mobile.", url, {}));
  }

  // OpenGraph minimum
  const ogTitle  = extractMeta(head, "og:title");
  const ogDesc   = extractMeta(head, "og:description");
  const ogImage  = extractMeta(head, "og:image");
  if (!ogTitle || !ogDesc || !ogImage) {
    findings.push(of("incomplete_open_graph", "notice", "content",
      "Open Graph tags are incomplete (og:title, og:description, og:image).", url,
      { has: { title: !!ogTitle, description: !!ogDesc, image: !!ogImage }, title, description: desc, url, ...context }));
  }

  // Image alt
  const imgs       = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
  const missingAlt = imgs.filter(tag => !/\salt\s*=/.test(tag)).length;
  if (missingAlt > 0) {
    findings.push(of("images_missing_alt", "warning", "accessibility",
      `${missingAlt} of ${imgs.length} images are missing alt text.`, url,
      { total: imgs.length, missing: missingAlt }));
  }

  // Schema.org JSON-LD presence
  const hasJsonLd = /<script[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(html);
  if (!hasJsonLd) {
    findings.push(of("no_structured_data", "notice", "schema",
      "No JSON-LD structured data found. Schema markup helps AI search and rich results.", url,
      { title, description: desc, url, ...context }));
  }

  // Hreflang sanity check (only flag if multiple hreflang tags but no x-default)
  const hreflangTags = [...head.matchAll(/<link[^>]*hreflang=["']([^"']+)["'][^>]*>/gi)].map(m => m[1]);
  if (hreflangTags.length > 1 && !hreflangTags.some(h => h === "x-default")) {
    findings.push(of("hreflang_no_xdefault", "notice", "technical",
      "Multiple hreflang variants but no x-default fallback declared.", url,
      { tags: hreflangTags }));
  }

  // Word count (very rough — strip tags)
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
                   .replace(/<style[\s\S]*?<\/style>/gi, " ")
                   .replace(/<[^>]+>/g, " ")
                   .replace(/\s+/g, " ").trim();
  const wordCount = text ? text.split(" ").length : 0;
  if (wordCount > 0 && wordCount < 200) {
    findings.push(of("thin_content", "warning", "content",
      `Page has only ~${wordCount} words. Thin content can hurt rankings.`, url,
      { word_count: wordCount, title, ...context }));
  }

  // Record what this page claimed, so cross-page checks can compare. Duplicate
  // titles and descriptions cannot be seen one page at a time — the whole
  // point is that two pages say the same thing.
  if (collect) {
    collect.push({
      url,
      title:       decodeEntities(extractFirst(head, /<title[^>]*>([\s\S]*?)<\/title>/i)?.trim() ?? "") || null,
      description: decodeEntities(extractFirst(head, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.trim() ?? "") || null,
      canonical:   extractFirst(head, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ?? null,
      noindex,
      headings,
    });
  }

  return findings;
}

/**
 * Checks that only make sense across the whole crawl.
 *
 * Two pages with the same title are competing with each other for the same
 * query — Google picks one and the other's signals are wasted. It is invisible
 * to any per-page check, which is why most lightweight audits miss it.
 */
function checkAcrossPages(facts: PageFacts[]): Finding[] {
  const findings: Finding[] = [];
  const group = (pick: (f: PageFacts) => string | null) => {
    const by = new Map<string, string[]>();
    for (const f of facts) {
      const v = pick(f)?.toLowerCase().trim();
      if (!v) continue;
      by.set(v, [...(by.get(v) ?? []), f.url]);
    }
    return [...by.entries()].filter(([, urls]) => urls.length > 1);
  };

  for (const [title, urls] of group(f => f.title)) {
    findings.push(of("duplicate_title", "warning", "on_page",
      `${urls.length} pages share the title "${title}".`, urls[0],
      { title, pages: urls }));
  }
  for (const [desc, urls] of group(f => f.description)) {
    findings.push(of("duplicate_meta_description", "notice", "on_page",
      `${urls.length} pages share the same meta description.`, urls[0],
      { description: desc.slice(0, 120), pages: urls }));
  }

  // A canonical pointing at a page that is itself noindexed sends contradictory
  // instructions: "this is the version to index" and "don't index it".
  const noindexed = new Set(facts.filter(f => f.noindex).map(f => f.url.replace(/\/+$/, "")));
  for (const f of facts) {
    if (!f.canonical || f.noindex) continue;
    if (noindexed.has(f.canonical.replace(/\/+$/, ""))) {
      findings.push(of("canonical_to_noindex", "error", "technical",
        "Canonical URL points at a page marked noindex.", f.url,
        { canonical: f.canonical }));
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function of(rule: string, severity: Severity, category: Category, message: string, page_url?: string, detail?: Record<string, unknown>): Finding {
  return { rule, severity, category, message, page_url, detail };
}

/**
 * Decode the handful of HTML entities that show up in titles and descriptions.
 *
 * Without this a finding reads: 3 pages share the title "… seo &amp; geo …",
 * which makes the tool look like it can't read HTML. Worse, two titles that a
 * user considers identical could compare as different if one is encoded and
 * the other isn't — so this affects the duplicate detection, not just display.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function extractHead(html: string): string {
  return extractFirst(html, /<head[^>]*>([\s\S]*?)<\/head>/i) ?? html.slice(0, 8000);
}

function extractFirst(text: string, re: RegExp): string | undefined {
  const m = text.match(re);
  return m ? m[1] : undefined;
}

function extractFirstAttr(text: string, re: RegExp, attr: string): string | undefined {
  const m = text.match(re);
  if (!m) return undefined;
  const tag = m[0];
  const attrRe = new RegExp(`\\b${attr}=["']([^"']+)["']`, "i");
  return tag.match(attrRe)?.[1];
}

function extractMeta(head: string, prop: string): string | undefined {
  // Match either <meta name=".."> or <meta property="..">
  const re = new RegExp(`<meta[^>]*(?:name|property)=["']${escapeRegex(prop)}["'][^>]*>`, "i");
  return extractFirstAttr(head, re, "content");
}

function extractMetaName(head: string, name: string): string | undefined {
  const re = new RegExp(`<meta[^>]*name=["']${escapeRegex(name)}["'][^>]*>`, "i");
  return extractFirstAttr(head, re, "content");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractInternalLinks(baseUrl: string, html: string): string[] {
  const u = new URL(baseUrl);
  const out = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    const href = m[1];
    try {
      const abs = new URL(href, baseUrl);
      if (abs.origin !== u.origin) continue;
      // Skip non-html-y endpoints
      if (/\.(png|jpe?g|gif|webp|svg|pdf|zip|css|js|ico|xml)(\?|$)/i.test(abs.pathname)) continue;
      out.add(abs.toString().split("#")[0]);
    } catch { /* malformed href */ }
  }
  // The homepage must not be audited twice. `out.delete(baseUrl)` used to miss
  // it: baseUrl has no trailing slash ("https://x.co.uk") while new URL("/")
  // produces one ("https://x.co.uk/"), so the strings never matched. The logo
  // links to "/" on every page, so the homepage was crawled a second time —
  // which is where the duplicate Open Graph notices came from, and it burned
  // one of the eight crawl slots.
  const norm = (v: string) => v.replace(/\/+$/, "");
  const home = norm(baseUrl);
  return [...out].filter(l => norm(l) !== home);
}

/** Per-page fetch budget. A slow page should cost one check, not the run. */
const PAGE_TIMEOUT_MS = 8_000;
/** PageSpeed budget. Generous, because a real Lighthouse run takes ~20s. */
const PSI_TIMEOUT_MS  = 35_000;

async function safeFetchHtml(url: string): Promise<{ ok: true; html: string; status: number } | { ok: false; error: string; status?: number }> {
  // Without a timeout a single request that hangs rather than fails stalls the
  // whole function until the platform kills the process — and a killed process
  // runs no catch block, so the audit row is left saying "running" forever with
  // no error recorded. That is exactly how a run died at 02:46.
  try {
    const res = await fetch(url, {
      signal:   AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers:  { "User-Agent": "AIMarketingLabBot/1.0 (+https://aimarketinglab.co.uk/bot)" },
      redirect: "follow",
      // Next.js's fetch types now include `next.revalidate` on RequestInit
      // directly — the old @ts-expect-error suppressor is stale and TS now
      // flags it as an unused directive, which fails `next build`'s type
      // check (this is what broke the last two deployments).
      next: { revalidate: 0 },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, status: res.status };
    const html = await res.text();
    return { ok: true, html, status: res.status };
  } catch (e: any) {
    const msg = e?.name === "TimeoutError"
      ? `no response within ${PAGE_TIMEOUT_MS / 1000}s`
      : e?.message ?? "fetch error";
    return { ok: false, error: msg };
  }
}

async function fetchRobotsTxt(baseUrl: string) {
  const empty = { found: false, sitemap: null as string | null, disallowsAll: false, disallow: [] as string[] };
  try {
    const res = await fetch(`${baseUrl}/robots.txt`);
    if (!res.ok) return empty;
    const txt = await res.text();
    const sitemap = txt.split(/\r?\n/).find(l => /^\s*Sitemap:/i.test(l))?.split(/:/i).slice(1).join(":").trim() || null;

    // Reuse the parser written for the answer-engine audit rather than a
    // second regex. It already implements the group semantics correctly,
    // including that consecutive User-agent lines share the rules below them.
    const wildcard = parseRobots(txt).find(g => g.agents.includes("*"));
    const disallow = (wildcard?.disallow ?? []).filter(d => d !== "");

    return { found: true, sitemap, disallowsAll: disallow.includes("/"), disallow };
  } catch {
    return empty;
  }
}

/**
 * Should this URL be audited?
 *
 * The crawler used to take the first eight same-origin links off the homepage
 * and check them all — including /dashboard, /auth/login and /auth/signup,
 * every one of them Disallow'd in the site's own robots.txt and sitting behind
 * authentication.
 *
 * That produced the worst possible output: two red ERRORs for a missing <h1>
 * on pages that can never be indexed, plus thin-content and Open Graph
 * complaints about a signed-out app shell. All true statements, all
 * meaningless, and they crowded out the four findings that mattered. A report
 * that is half noise is worse than a shorter one, because the reader stops
 * trusting the half that isn't.
 *
 * If the site tells crawlers not to look at a page, we don't audit it either.
 */
function isAuditable(url: string, baseUrl: string, disallow: string[]): boolean {
  if (disallow.length === 0) return true;
  let path: string;
  try { path = new URL(url, baseUrl).pathname; } catch { return false; }
  return !disallow.some(rule => path.startsWith(rule));
}

async function fetchSitemap(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return { found: false, urls: [] as string[] };
    const xml = await res.text();
    const urls = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map(m => m[1].trim());
    return { found: true, urls };
  } catch {
    return { found: false, urls: [] as string[] };
  }
}

async function fetchPSI(url: string) {
  const apiKey = process.env.GOOGLE_PSI_API_KEY;
  // PSI works without a key (with stricter rate limits) but having one is
  // strongly recommended for production.
  const params = new URLSearchParams({ url, strategy: "mobile" });
  if (apiKey) params.set("key", apiKey);
  for (const cat of ["performance", "accessibility", "best-practices", "seo"]) {
    params.append("category", cat);
  }

  try {
    // PSI runs a real Lighthouse pass, so it is slow by nature — and keyless it
    // is rate-limited, at which point it stalls instead of erroring. It is the
    // single most likely thing to hang in this whole module, and it produces
    // the least essential part of the report, so it gets a hard ceiling.
    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
      {
        signal:  AbortSignal.timeout(PSI_TIMEOUT_MS),
        headers: { "User-Agent": "AIMarketingLabBot/1.0" },
      },
    );
    if (!res.ok) return { ok: false as const };
    const data = await res.json();
    const cats = data?.lighthouseResult?.categories ?? {};
    const audits = data?.lighthouseResult?.audits ?? {};
    const scores = {
      performance:    cats.performance      ? Math.round((cats.performance.score      ?? 0) * 100) : null,
      accessibility:  cats.accessibility    ? Math.round((cats.accessibility.score    ?? 0) * 100) : null,
      best_practices: cats["best-practices"] ? Math.round((cats["best-practices"].score ?? 0) * 100) : null,
      seo:            cats.seo              ? Math.round((cats.seo.score              ?? 0) * 100) : null,
    };
    // numericValue is a float; lcp_ms and inp_ms are INTEGER columns. Writing
    // 2345.67 into one makes Postgres reject the whole UPDATE — and since that
    // update's error was being discarded, the audit row silently kept its
    // insert-time defaults while the findings insert that followed succeeded.
    // That is how a completed run could display as "0 pages crawled".
    const round = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
    const lcp_ms = round(audits["largest-contentful-paint"]?.numericValue);
    const inp_ms = round(audits["interaction-to-next-paint"]?.numericValue);
    // cls is NUMERIC(6,3) so it keeps decimals, but must fit three of them.
    const rawCls = audits["cumulative-layout-shift"]?.numericValue;
    const cls    = typeof rawCls === "number" && Number.isFinite(rawCls)
      ? Number(rawCls.toFixed(3))
      : null;
    return { ok: true as const, scores, lcp_ms, cls, inp_ms };
  } catch {
    return { ok: false as const };
  }
}

function assemble(
  domain: string,
  findings: Finding[],
  meta: Record<string, unknown>,
  psi: { scores: { performance: number | null; accessibility: number | null; best_practices: number | null; seo: number | null }; lcp_ms: number | null; cls: number | null; inp_ms: number | null } | null,
  pagesCrawled: number,
): AuditResult {
  // Collapse duplicates before scoring.
  //
  // The same rule firing twice on one page is one problem, not two, and the
  // score penalises per finding — so a page reached by two URL spellings
  // (trailing slash, index path) would drag the score down twice for a single
  // fault. Keyed on rule + normalised URL so "…/blog" and "…/blog/" count once.
  const seen = new Set<string>();
  findings = findings.filter(f => {
    const key = `${f.rule}::${(f.page_url ?? "").replace(/\/+$/, "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Attach the reasoning, then order by likely return rather than by severity.
  // A missing <h1> is an error, but on a page nobody searches for it matters
  // less than a weak title on the page already collecting impressions.
  findings = findings.map(enrich).sort(byImpact);

  // Score: weight on-page + technical heavily, performance medium, accessibility & schema light.
  const errors   = findings.filter(f => f.severity === "error").length;
  const warnings = findings.filter(f => f.severity === "warning").length;
  // Penalise more for errors than warnings
  const penalty  = errors * 8 + warnings * 3;
  const psiAvg   = psi
    ? avg([psi.scores.performance, psi.scores.accessibility, psi.scores.best_practices, psi.scores.seo].filter((n): n is number => n != null))
    : 70;
  const overall  = Math.max(0, Math.min(100, Math.round(psiAvg - penalty / 2)));

  return {
    domain,
    pages_crawled:  pagesCrawled,
    findings,
    performance:    psi?.scores.performance    ?? null,
    accessibility:  psi?.scores.accessibility  ?? null,
    best_practices: psi?.scores.best_practices ?? null,
    seo:            psi?.scores.seo            ?? null,
    lcp_ms:         psi?.lcp_ms                ?? null,
    cls:            psi?.cls                   ?? null,
    inp_ms:         psi?.inp_ms                ?? null,
    overall_score:  overall,
    meta,
  };
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Pick the host that responds, preferring the one supplied.
 *
 * Falls through only when the first host is genuinely unreachable — a 404 or
 * a 500 means a server answered, and that is the site we were asked to audit.
 * Throws when neither responds, so the caller reports "couldn't reach your
 * site" rather than emitting a report full of false failures.
 */
async function resolveReachableBase(base: string): Promise<string> {
  const candidates = originCandidates(base);
  let lastDetail = "the request failed";

  for (const origin of candidates) {
    const r = await fetchText(`${origin}/`, 8000);
    if (r.kind !== "unreachable") return origin;
    lastDetail = r.detail;
  }
  throw new Error(
    `${candidates[0]} could not be reached — ${lastDetail}` +
    (candidates.length > 1 ? ` (also tried ${candidates[1]})` : "")
  );
}

function normaliseDomain(input: string): string {
  const cleaned = input.replace(/^sc-domain:/, "").trim();
  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned.replace(/\/+$/, "");
  }
  return `https://${cleaned.replace(/^\/+|\/+$/g, "")}`;
}
