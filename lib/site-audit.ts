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
  const baseUrl  = normaliseDomain(domain);
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
    return assemble(domain, findings, meta, null, 0);
  }

  // Run on-page checks on the homepage.
  findings.push(...checkOnPage(baseUrl, homepageHtml.html));

  // Pick up to 8 same-origin links from the homepage and audit them too.
  const sameOriginLinks = extractInternalLinks(baseUrl, homepageHtml.html).slice(0, 8);
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
    findings.push(...checkOnPage(link, sub.html));
  }
  const pagesCrawled = 1 + sameOriginLinks.length;

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

  return assemble(domain, findings, meta, psi.ok ? psi : null, pagesCrawled);
}

// ---------------------------------------------------------------------------
// On-page checks for one HTML document. Pure function — easy to unit test.
// ---------------------------------------------------------------------------
function checkOnPage(url: string, html: string): Finding[] {
  const findings: Finding[] = [];
  const head = extractHead(html);

  // Title
  const title = extractFirst(head, /<title[^>]*>([\s\S]*?)<\/title>/i)?.trim();
  if (!title) {
    findings.push(of("missing_title", "error", "on_page", "Page is missing a <title> tag.", url));
  } else if (title.length < 15) {
    findings.push(of("title_too_short", "warning", "on_page", `Title is only ${title.length} characters. Aim for 50-60.`, url, { title }));
  } else if (title.length > 65) {
    findings.push(of("title_too_long", "notice", "on_page", `Title is ${title.length} characters and may be truncated in SERPs.`, url, { title }));
  }

  // Meta description
  const desc = extractMeta(head, "description");
  if (!desc) {
    findings.push(of("missing_meta_description", "error", "on_page", "Page is missing a meta description.", url));
  } else if (desc.length < 70) {
    findings.push(of("meta_description_short", "notice", "on_page", `Meta description is ${desc.length} characters; aim for 120-160.`, url, { length: desc.length }));
  } else if (desc.length > 170) {
    findings.push(of("meta_description_long", "notice", "on_page", `Meta description is ${desc.length} characters; SERPs may truncate it.`, url, { length: desc.length }));
  }

  // H1
  const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
  if (h1Matches.length === 0) {
    findings.push(of("missing_h1", "error", "on_page", "Page has no <h1> heading.", url));
  } else if (h1Matches.length > 1) {
    findings.push(of("multiple_h1", "warning", "on_page", `Page has ${h1Matches.length} <h1> tags; use one canonical heading.`, url));
  }

  // Canonical
  const canonical = extractFirstAttr(head, /<link[^>]*rel=["']canonical["'][^>]*>/i, "href");
  if (!canonical) {
    findings.push(of("missing_canonical", "warning", "on_page", "No <link rel=\"canonical\"> on the page.", url));
  }

  // viewport
  const viewport = extractMetaName(head, "viewport");
  if (!viewport) {
    findings.push(of("missing_viewport", "error", "best_practice", "Missing <meta name=\"viewport\"> — required for mobile.", url));
  }

  // OpenGraph minimum
  const ogTitle  = extractMeta(head, "og:title");
  const ogDesc   = extractMeta(head, "og:description");
  const ogImage  = extractMeta(head, "og:image");
  if (!ogTitle || !ogDesc || !ogImage) {
    findings.push(of("incomplete_open_graph", "notice", "content",
      "Open Graph tags are incomplete (og:title, og:description, og:image).", url,
      { has: { title: !!ogTitle, description: !!ogDesc, image: !!ogImage } }));
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
      "No JSON-LD structured data found. Schema markup helps AI search and rich results.", url));
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
      { word_count: wordCount }));
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function of(rule: string, severity: Severity, category: Category, message: string, page_url?: string, detail?: Record<string, unknown>): Finding {
  return { rule, severity, category, message, page_url, detail };
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
  out.delete(baseUrl);
  return [...out];
}

async function safeFetchHtml(url: string): Promise<{ ok: true; html: string; status: number } | { ok: false; error: string; status?: number }> {
  try {
    const res = await fetch(url, {
      headers:  { "User-Agent": "AIMarketingLabBot/1.0 (+https://aimarketinglab.co.uk/bot)" },
      redirect: "follow",
      // @ts-expect-error — Next.js fetch supports this in route handlers
      next: { revalidate: 0 },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, status: res.status };
    const html = await res.text();
    return { ok: true, html, status: res.status };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "fetch error" };
  }
}

async function fetchRobotsTxt(baseUrl: string) {
  try {
    const res = await fetch(`${baseUrl}/robots.txt`);
    if (!res.ok) return { found: false, sitemap: null as string | null, disallowsAll: false };
    const txt = await res.text();
    const sitemap = txt.split(/\r?\n/).find(l => /^\s*Sitemap:/i.test(l))?.split(/:/i).slice(1).join(":").trim() || null;
    const disallowsAll = /^\s*User-agent:\s*\*\s*$[\s\S]*?^\s*Disallow:\s*\/\s*$/im.test(txt);
    return { found: true, sitemap, disallowsAll };
  } catch {
    return { found: false, sitemap: null as string | null, disallowsAll: false };
  }
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
    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
      { headers: { "User-Agent": "AIMarketingLabBot/1.0" } },
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
    const lcp_ms = audits["largest-contentful-paint"]?.numericValue ?? null;
    const cls    = audits["cumulative-layout-shift"]?.numericValue ?? null;
    const inp_ms = audits["interaction-to-next-paint"]?.numericValue ?? null;
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

function normaliseDomain(input: string): string {
  const cleaned = input.replace(/^sc-domain:/, "").trim();
  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned.replace(/\/+$/, "");
  }
  return `https://${cleaned.replace(/^\/+|\/+$/g, "")}`;
}
