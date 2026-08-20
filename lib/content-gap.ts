// lib/content-gap.ts
// =============================================================================
// AI Marketing Lab — what a competitor covers that you don't
//
// WHY NOT "COMPETITOR KEYWORDS"
//
// The tab this replaces asked DataForSEO which keywords a competitor ranks
// for. That needs a crawled search-results corpus. We don't have one, there is
// no free equivalent, and the endpoint has been returning "unavailable" for
// some time while the page carried on calling it.
//
// So this answers a question we can actually answer from public data, and
// which turns out to be the more useful one anyway: WHAT ARE THEY PUBLISHING
// THAT YOU AREN'T? Every page a competitor puts in their sitemap is a subject
// they decided was worth writing about. If none of your Search Console queries
// come anywhere near that subject, you are absent from that conversation —
// and unlike an estimated keyword volume, both halves of that statement are
// things we measured.
//
// THE TWO INPUTS ARE DIFFERENT IN KIND, DELIBERATELY
//
//   • their side  — page titles and H1s, read from their live sitemap
//   • your side   — queries you actually received impressions for, from GSC
//
// So a "gap" means: they have written a page about this, and your site has not
// surfaced in search for anything resembling it in the last 28 days. That is a
// narrower claim than "they rank and you don't", and it is a true one.
//
// WHAT THIS IS NOT
//
// Not search volume. Not difficulty. Not their ranking position. A gap here
// says nothing about how many people search for the topic — only that they are
// present and you are not. The UI must say so; a gap list that implies traffic
// would be the same mistake as the zeroes on the competitors page.
// =============================================================================

/**
 * Words carrying no topical signal. Kept deliberately small: an aggressive
 * list starts eating domain vocabulary ("service", "repair", "price") which is
 * exactly the vocabulary that distinguishes one page from another.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "than", "that", "this",
  "these", "those", "of", "in", "on", "at", "to", "for", "from", "by", "with",
  "without", "about", "into", "over", "under", "is", "are", "was", "were",
  "be", "been", "being", "do", "does", "did", "have", "has", "had", "can",
  "could", "will", "would", "should", "may", "might", "must", "your", "you",
  "our", "we", "us", "my", "me", "it", "its", "their", "they", "them", "he",
  "she", "his", "her", "as", "so", "not", "no", "yes", "all", "any", "each",
  "more", "most", "other", "some", "such", "only", "own", "same", "too",
  "very", "just", "now", "how", "what", "when", "where", "which", "who",
  "why", "home", "page", "welcome", "best", "top", "new", "get", "guide",
]);

/** Very light singularisation. "services" and "service" are the same topic. */
function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 3 && word.endsWith("ses")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/**
 * Break text into the words that carry topic meaning.
 *
 * `extra` removes brand vocabulary — the competitor's own name appears in
 * almost every title they write, so leaving it in makes every page look
 * similar to every other page and similar to nothing of yours.
 */
export function topicTerms(text: string, extra: Iterable<string> = []): string[] {
  const drop = new Set([...STOPWORDS, ...[...extra].map(w => singular(w.toLowerCase()))]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue;             // "uk", "ai" lost; acceptable, they rarely disambiguate
    const w = singular(raw);
    if (drop.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

export type CompetitorPage = {
  url:   string;
  title: string | null;
  h1:    string | null;
};

export type YourQuery = {
  term:        string;
  impressions: number;
};

export type GapVerdict = "covered" | "gap" | "unclear";

export type PageAssessment = {
  url:      string;
  title:    string;
  /** The words we matched on, so the reader can see our working. */
  terms:    string[];
  verdict:  GapVerdict;
  /** For a covered page: the query of yours that covers it. */
  matchedQuery?: string;
  /** 0-1. How much of this page's topic your closest query covers. */
  overlap:  number;
};

/**
 * How much of `pageTerms` a query covers, 0-1.
 *
 * Measured against the PAGE, not the query, and that direction matters. A
 * one-word query like "roofing" shares 100% of itself with a page about
 * "emergency flat roofing repairs in Leeds", but covers only a quarter of what
 * that page is about — and it is the page's subject we are asking about.
 */
export function coverage(pageTerms: string[], queryTerms: string[]): number {
  if (pageTerms.length === 0) return 0;
  const q = new Set(queryTerms);
  const hits = pageTerms.filter(t => q.has(t)).length;
  return hits / pageTerms.length;
}

/** At or above this, we treat the page's subject as one you already appear for. */
export const COVERED_AT = 0.5;

export function assessPages(
  pages: CompetitorPage[],
  queries: YourQuery[],
  brandWords: Iterable<string> = [],
): PageAssessment[] {
  // Queries are tokenised once. With 100 pages x 200 queries this is the
  // difference between instant and noticeable.
  const queryIndex = queries.map(q => ({
    term:  q.term,
    terms: new Set(topicTerms(q.term)),
    impressions: q.impressions,
  }));

  const out: PageAssessment[] = [];

  for (const page of pages) {
    const heading = [page.title, page.h1].filter(Boolean).join(" ");
    const terms   = topicTerms(heading, brandWords);

    if (terms.length === 0) {
      // A page whose title is only brand and stopwords ("Home | Acme Ltd").
      // We cannot say anything about it, so we say that rather than calling
      // it a gap and sending someone off to write a duplicate homepage.
      out.push({ url: page.url, title: heading.trim(), terms, verdict: "unclear", overlap: 0 });
      continue;
    }

    let best = 0;
    let bestQuery: string | undefined;
    for (const q of queryIndex) {
      const score = coverage(terms, [...q.terms]);
      if (score > best) { best = score; bestQuery = q.term; }
      if (best === 1) break;
    }

    out.push({
      url:     page.url,
      title:   heading.trim(),
      terms,
      verdict: best >= COVERED_AT ? "covered" : "gap",
      matchedQuery: best >= COVERED_AT ? bestQuery : undefined,
      overlap: Math.round(best * 100) / 100,
    });
  }

  return out;
}

export type GapReport = {
  assessed:  number;
  gaps:      PageAssessment[];
  covered:   PageAssessment[];
  unclear:   PageAssessment[];
  /** Terms appearing across several gap pages — the themes, not the one-offs. */
  themes:    Array<{ term: string; pages: number }>;
};

export function buildGapReport(assessments: PageAssessment[]): GapReport {
  const gaps    = assessments.filter(a => a.verdict === "gap");
  const covered = assessments.filter(a => a.verdict === "covered");
  const unclear = assessments.filter(a => a.verdict === "unclear");

  // A term on one page is that page's subject. The same term across four pages
  // is a topic they have committed to, and that is what's worth answering.
  const counts = new Map<string, number>();
  for (const g of gaps) {
    for (const t of g.terms) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const themes = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([term, pages]) => ({ term, pages }));

  // Most distinctive first: a gap page whose subject you touch on slightly is
  // a smaller gap than one you are nowhere near.
  gaps.sort((a, b) => a.overlap - b.overlap || b.terms.length - a.terms.length);

  return { assessed: assessments.length, gaps, covered, unclear, themes };
}

/** Brand vocabulary to ignore: both domains, split on dots and hyphens. */
export function brandWordsFor(...domains: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const d of domains) {
    if (!d) continue;
    for (const part of d.toLowerCase().replace(/^www\./, "").split(/[.\-_]/)) {
      // Drop TLDs and other noise; keep the actual name.
      if (part.length >= 3 && !["com", "org", "net", "co", "uk", "www", "ltd"].includes(part)) {
        out.push(part);
      }
    }
  }
  return out;
}
