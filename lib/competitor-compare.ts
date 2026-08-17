// lib/competitor-compare.ts
// =============================================================================
// AI Marketing Lab — comparing yourself to a competitor using things we can
// actually see
//
// WHY THIS MODULE EXISTS
//
// The competitors page used to promise Domain Authority, monthly traffic and
// keyword counts. Those all came from DataForSEO, which is switched off — so
// every row rendered 0, 0, 0, 0%, "LOW threat", trend arrow down. Not one of
// those was a measurement. They were the shape a measurement leaves behind
// after the measurement is removed, and they read as findings: a competitor
// with zero traffic and zero keywords, which is a claim, and a false one.
//
// A tool that shows a confident 0 where it means "we don't know" is worse than
// one that shows nothing, because the reader has no way to tell the two apart.
//
// WHAT WE MEASURE INSTEAD
//
// Everything here comes from fetching the competitor's own site — the same
// three requests the site audit already makes, against a public URL:
//
//   • their homepage    → title, description, H1, word count, schema markup
//   • their robots.txt  → which answer engines they let in
//   • their sitemap.xml → how many pages they actually publish
//
// None of it is estimated. Every number can be checked by the reader in about
// thirty seconds, which is the property the estimated numbers never had.
//
// It is also the comparison this product is for. "They publish 340 pages and
// you publish 12" and "they let ChatGPT in and you block it" are competitive
// facts a marketing director can act on this week. An estimated authority
// score of 43 is not.
//
// WHAT WE DELIBERATELY DO NOT CLAIM
//
// Traffic, keyword rankings and backlink profiles are not observable from
// outside a site. They need a crawled SERP corpus. We don't have one, so those
// columns are gone rather than zeroed — see UNMEASURABLE below, which exists so
// the UI can explain the absence instead of leaving a hole.
//
// NULL IS NOT ZERO
//
// Every optional field here is `T | null`. `null` means we failed to find out;
// `0` means we looked and the answer was none. `pagesInSitemap: null` (no
// sitemap we could read) and `pagesInSitemap: 0` (a sitemap listing nothing)
// are different facts about a business and must render differently.
// =============================================================================

import {
  parseRobots, extractSitemapPaths, crawlerAccess,
  scoreAnswerReadiness, AI_CRAWLERS,
} from "./ai-crawlers";
import { describeFetchError, type Fetcher } from "./site-fetch";

const TIMEOUT_MS = 9_000;

/**
 * Things people expect on a competitor screen that cannot be observed by
 * fetching a website. Exported so the page can name them and say why, rather
 * than silently omitting columns a user was looking for.
 */
export const UNMEASURABLE = [
  {
    label: "Monthly traffic",
    why: "Only the site owner's own analytics knows this. Every tool that shows it for someone else's domain is modelling an estimate from a crawled ranking dataset.",
  },
  {
    label: "Keyword rankings",
    why: "Requires a search-results dataset crawled at scale across many locations. There is no free source for it.",
  },
  {
    label: "Domain authority",
    why: "A third-party score computed from a proprietary link graph. It is a vendor's opinion, not a measurement, and Google does not use it.",
  },
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export type SiteMeasure = {
  domain:      string;
  url:         string;
  /** False when we never got a page back at all. */
  reachable:   boolean;
  status:      number | null;
  error:       string | null;

  title:       string | null;
  description: string | null;
  h1:          string | null;

  /** Visible words on the homepage. null when unreachable. */
  wordCount:   number | null;
  /** schema.org @type values found in JSON-LD. Empty array = looked, found none. */
  schemaTypes: string[];
  /** 0-100 answer-engine readiness for the homepage. null when unreachable. */
  answerScore: number | null;

  /** URLs listed in their sitemap. null = no sitemap we could read. */
  pagesInSitemap: number | null;
  /** Where that count came from, so the number is checkable. */
  sitemapUrl:     string | null;

  /** Answer-engine crawlers (not training crawlers) that may fetch the site. */
  answerBotsAllowed: number | null;
  answerBotsTotal:   number;
  /** Which ones are blocked — the actionable part. */
  answerBotsBlocked: string[];
  /** null = no robots.txt we could read, which is NOT the same as none blocked. */
  robotsKnown:       boolean;

  https:      boolean;
  measuredAt: string;
};

export type MetricKey =
  | "answerScore" | "pagesInSitemap" | "wordCount" | "answerBotsAllowed" | "schemaTypes";

export type Verdict = "ahead" | "behind" | "level" | "unknown";

export type MetricRow = {
  key:    MetricKey;
  label:  string;
  /** What this difference means commercially. Shown, not implied. */
  why:    string;
  you:    number | null;
  them:   number | null;
  /** Rendered strings — "—" when null, so the UI never formats a null as 0. */
  youText:  string;
  themText: string;
  verdict:  Verdict;
  /** One sentence the reader can act on, or null when we can't compare. */
  note:     string | null;
};

export type Comparison = {
  you:     SiteMeasure;
  them:    SiteMeasure;
  metrics: MetricRow[];
  /** Metrics where they beat us — the reason to look at this competitor. */
  behindOn: number;
  aheadOn:  number;
  unknownOn: number;
};

// ─── Small extractors ────────────────────────────────────────────────────────

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  if (!m?.[1]) return null;
  return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
}

function visibleWords(html: string): number {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(/\s+/).length : 0;
}

/**
 * Pull @type values out of JSON-LD blocks.
 *
 * Deliberately forgiving. Malformed JSON-LD is extremely common and a parse
 * failure here should mean "we found none we could read", never a thrown
 * error that fails the whole measurement.
 */
export function schemaTypesIn(html: string): string[] {
  const types = new Set<string>();
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1].trim());
      const walk = (node: unknown): void => {
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (!node || typeof node !== "object") return;
        const obj = node as Record<string, unknown>;
        const t = obj["@type"];
        if (typeof t === "string") types.add(t);
        else if (Array.isArray(t)) t.forEach(v => { if (typeof v === "string") types.add(v); });
        if (Array.isArray(obj["@graph"])) walk(obj["@graph"]);
      };
      walk(parsed);
    } catch {
      // Unreadable block. Skip it rather than claiming the site has no schema.
    }
  }
  return [...types];
}

/** Sitemap URLs declared in robots.txt. parseRobots drops these lines. */
export function sitemapsFromRobots(text: string): string[] {
  return [...text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map(m => m[1]);
}

// ─── Fetching ────────────────────────────────────────────────────────────────

type Raw = { ok: boolean; status: number | null; body: string; error: string | null };

async function get(url: string, fetcher: Fetcher): Promise<Raw> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetcher(url, {
      headers: {
        // Our own bot string. We are not impersonating a browser here — this is
        // a straightforward read of a public page and it should be attributable
        // in the site owner's logs.
        "User-Agent": "AIMarketingLabBot/1.0 (+https://www.aimarketinglab.co.uk/bot)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    const body = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body, error: null };
  } catch (err) {
    return { ok: false, status: null, body: "", error: describeFetchError(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Measure one site: homepage, robots.txt, sitemap.
 *
 * Never throws. A site that is down produces a `reachable: false` measure with
 * nulls throughout, because "we could not reach them" is a legitimate result
 * to display and a terrible thing to convert into zeroes.
 */
export async function measureSite(
  origin: string,
  fetcher: Fetcher = fetch,
): Promise<SiteMeasure> {
  const url    = origin.replace(/\/+$/, "");
  const domain = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } })();
  const measuredAt = new Date().toISOString();

  const base: SiteMeasure = {
    domain, url, reachable: false, status: null, error: null,
    title: null, description: null, h1: null,
    wordCount: null, schemaTypes: [], answerScore: null,
    pagesInSitemap: null, sitemapUrl: null,
    answerBotsAllowed: null, answerBotsTotal: AI_CRAWLERS.filter(c => c.purpose === "answers").length,
    answerBotsBlocked: [], robotsKnown: false,
    https: url.startsWith("https://"), measuredAt,
  };

  // Homepage and robots.txt in parallel — they're independent.
  const [home, robots] = await Promise.all([
    get(url, fetcher),
    get(`${url}/robots.txt`, fetcher),
  ]);

  if (!home.ok || !home.body) {
    return { ...base, status: home.status, error: home.error ?? `The site returned ${home.status ?? "no response"}.` };
  }

  const html = home.body;
  const readiness = scoreAnswerReadiness(html, url);

  const measure: SiteMeasure = {
    ...base,
    reachable: true,
    status: home.status,
    title: firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    description:
      firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
      firstMatch(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i),
    h1: firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
    wordCount: visibleWords(html),
    schemaTypes: schemaTypesIn(html),
    answerScore: readiness.score,
  };

  // ── robots.txt → answer-engine access ──────────────────────────────────
  // A 404 is a real answer: no rules, everything allowed. An unreachable
  // robots.txt is not, and must stay unknown — the original bug this codebase
  // already learned once, in site-fetch.ts.
  if (robots.ok || robots.status === 404 || robots.status === 410) {
    const text   = robots.ok ? robots.body : "";
    const groups = parseRobots(text);
    const answerBots = AI_CRAWLERS.filter(c => c.purpose === "answers");
    const blocked = answerBots
      .filter(c => crawlerAccess(groups, c, "/").status === "blocked")
      .map(c => c.name);
    measure.robotsKnown       = true;
    measure.answerBotsBlocked = blocked;
    measure.answerBotsAllowed = answerBots.length - blocked.length;

    // Sitemap: prefer the one robots.txt declares, since that is the one the
    // site owner is actually pointing crawlers at.
    const declared = robots.ok ? sitemapsFromRobots(text) : [];
    const candidates = [...declared, `${url}/sitemap.xml`, `${url}/sitemap_index.xml`];
    for (const candidate of candidates.slice(0, 3)) {
      const sm = await get(candidate, fetcher);
      if (!sm.ok || !sm.body) continue;

      // Check for an index BEFORE counting <loc> elements. A sitemap index
      // lists child sitemaps in <loc> tags too, so the generic extractor reads
      // "a sitemap index with four children" as "a site with four pages" — a
      // large, properly-split site reported as tiny.
      const isIndex = /<sitemapindex/i.test(sm.body);
      if (isIndex) {
        const children = [...sm.body.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
          .map(c => c[1]).slice(0, 3);
        let total = 0;
        for (const child of children) {
          const c = await get(child, fetcher);
          if (c.ok && c.body) total += extractSitemapPaths(c.body, new URL(url).origin).length;
        }
        if (total > 0) {
          measure.pagesInSitemap = total;
          measure.sitemapUrl     = candidate;
          break;
        }
        continue;
      }

      const paths = extractSitemapPaths(sm.body, new URL(url).origin);
      if (paths.length > 0) {
        measure.pagesInSitemap = paths.length;
        measure.sitemapUrl     = candidate;
        break;
      }
    }
  } else {
    // Unknown, and stays unknown.
    measure.robotsKnown = false;
  }

  return measure;
}

// ─── Comparison ──────────────────────────────────────────────────────────────

/** Higher is better for all of these, which keeps the verdict logic honest. */
const METRICS: Array<{
  key: MetricKey; label: string; why: string;
  value: (m: SiteMeasure) => number | null;
  format: (v: number | null, m: SiteMeasure) => string;
  /** Difference below this is noise, not an advantage. */
  tolerance: number;
}> = [
  {
    key: "answerScore", label: "Answer-engine readiness",
    why: "How easily ChatGPT, Claude, Perplexity and Google's AI answers can extract a usable answer from the homepage. This is the score that decides whether you get cited when someone asks about your category.",
    value: m => m.answerScore,
    format: v => v === null ? "—" : `${v}/100`,
    tolerance: 5,
  },
  {
    key: "pagesInSitemap", label: "Pages published",
    why: "Counted from their own sitemap. More indexable pages means more entry points — more questions their site can be the answer to.",
    value: m => m.pagesInSitemap,
    format: (v, m) => v === null ? "—" : m.sitemapUrl ? `${v.toLocaleString()}` : `${v.toLocaleString()}`,
    tolerance: 0,
  },
  {
    key: "wordCount", label: "Homepage depth (words)",
    why: "A homepage with almost no text gives a retrieval system nothing to quote. It is the single most common reason a good business is invisible to AI answers.",
    value: m => m.wordCount,
    format: v => v === null ? "—" : v.toLocaleString(),
    tolerance: 50,
  },
  {
    key: "answerBotsAllowed", label: "AI answer engines allowed",
    why: "Read from robots.txt. A blocked answer crawler cannot cite you, however good the page is — and this is usually blocked by accident.",
    value: m => m.answerBotsAllowed,
    format: (v, m) => v === null ? "—" : `${v}/${m.answerBotsTotal}`,
    tolerance: 0,
  },
  {
    key: "schemaTypes", label: "Structured data types",
    why: "JSON-LD tells a machine what the page is about rather than making it guess. Organisation, FAQ and Product markup are the ones that show up in answers.",
    value: m => m.reachable ? m.schemaTypes.length : null,
    format: (v, m) => v === null ? "—" : v === 0 ? "None" : m.schemaTypes.slice(0, 3).join(", ") + (m.schemaTypes.length > 3 ? ` +${m.schemaTypes.length - 3}` : ""),
    tolerance: 0,
  },
];

/**
 * One site's own figures, formatted the same way the comparison formats them.
 *
 * Exists so the UI has exactly one place that turns a measurement into text.
 * When a second formatter appears, the two drift, and the drift shows up as a
 * "—" in one column and a "0" in another for the same missing fact.
 */
export function describeMeasure(m: SiteMeasure): Array<{
  key: MetricKey; label: string; text: string; value: number | null;
}> {
  return METRICS.map(spec => {
    const value = spec.value(m);
    return { key: spec.key, label: spec.label, text: spec.format(value, m), value };
  });
}

export function compareSites(you: SiteMeasure, them: SiteMeasure): Comparison {
  const metrics: MetricRow[] = METRICS.map(spec => {
    const a = spec.value(you);
    const b = spec.value(them);

    let verdict: Verdict = "unknown";
    let note: string | null = null;

    if (a !== null && b !== null) {
      const diff = a - b;
      if (Math.abs(diff) <= spec.tolerance) {
        verdict = "level";
      } else if (diff > 0) {
        verdict = "ahead";
      } else {
        verdict = "behind";
        note = behindNote(spec.key, a, b, them);
      }
    }

    return {
      key: spec.key, label: spec.label, why: spec.why,
      you: a, them: b,
      youText:  spec.format(a, you),
      themText: spec.format(b, them),
      verdict, note,
    };
  });

  return {
    you, them, metrics,
    behindOn:  metrics.filter(m => m.verdict === "behind").length,
    aheadOn:   metrics.filter(m => m.verdict === "ahead").length,
    unknownOn: metrics.filter(m => m.verdict === "unknown").length,
  };
}

/** What to do about being behind on this specific metric. */
function behindNote(key: MetricKey, you: number, them: number, theirs: SiteMeasure): string {
  switch (key) {
    case "answerScore":
      return `Their homepage scores ${them - you} points higher. Run the audit on your homepage — the checks that failed are the gap.`;
    case "pagesInSitemap":
      return `They publish ${(them - you).toLocaleString()} more pages than you. Each one is a question they can answer and you cannot.`;
    case "wordCount":
      return `Their homepage carries ${(them - you).toLocaleString()} more words. Answer engines quote text; there has to be text to quote.`;
    case "answerBotsAllowed":
      return theirs.answerBotsBlocked.length === 0
        ? "They allow every answer engine and you block at least one. Check your robots.txt — this is almost always unintentional."
        : `They allow more answer engines than you do. Check your robots.txt.`;
    case "schemaTypes":
      return `They mark up ${them} schema type${them === 1 ? "" : "s"} and you mark up ${you}. Start with Organisation and FAQPage.`;
  }
}

// ─── Domain handling ─────────────────────────────────────────────────────────

/**
 * Normalise user input to an origin we can fetch, or null.
 *
 * Rejects rather than guesses. "not a domain" typed into the add box should
 * come back as an error, not as a row with a broken link in it.
 */
export function toOrigin(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null;
    if (/\s/.test(u.hostname)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function domainOf(input: string): string {
  const origin = toOrigin(input);
  if (!origin) return input.trim();
  return new URL(origin).hostname.replace(/^www\./, "");
}
