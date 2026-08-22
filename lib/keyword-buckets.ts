// lib/keyword-buckets.ts
// =============================================================================
// AI Marketing Lab — sorting keywords into the piles a person actually works in
//
// WHAT THIS IS FOR
//
// /opportunities answers "what should I do next" and returns a ranked list of
// actions. That is the right shape for a Monday morning. It is the wrong shape
// for planning, where the question is "what do I own, what is nearly mine, and
// what am I nowhere near" — the same data, organised by keyword rather than by
// task.
//
// THIS DOES NOT REIMPLEMENT THE ANALYSIS
//
// lib/opportunities.ts already does the hard part: a CTR curve built from the
// site's own data rather than an industry table, thresholds that scale to how
// small the site is, branded/non-branded splitting, and a confidence score per
// finding. Re-deriving "position 4-20 means striking distance" here would
// produce a second set of thresholds that quietly disagrees with the first, and
// the two pages would then contradict each other about the same keyword.
//
// So where an Opportunity exists for a query, IT decides the bucket and lends
// its evidence. Positional rules only fill in for queries the opportunity
// engine had nothing to say about.
//
// WHAT WE WILL AND WON'T CLAIM
//
// Every bucket here is derived from measurements: Search Console impressions,
// clicks, CTR and average position, plus the watchlist the user built. None of
// it needs search volume, keyword difficulty, or a competitor's ranking — none
// of which we can observe.
//
// That constrains what "opportunity" can honestly mean. NO_PRESENCE says "a
// competitor publishes on this and you have no impressions for it", which is
// two measured facts. It does NOT say "this has 2,400 searches a month and low
// competition" — that is a different claim needing a different data source, and
// the difference between them is the difference between this being defensible
// and it being the zeroes on the old competitors page in a new coat.
// =============================================================================

import type { Opportunity, QueryRow, OpportunityKind } from "./opportunities";
import { isBrandedQuery } from "./opportunities";

// ─── Buckets ─────────────────────────────────────────────────────────────────

export type Bucket =
  | "winning"      // top 3 and earning clicks — defend it
  | "striking"     // page 2-ish; the closest available wins
  | "ctr_gap"      // ranks well, nobody clicks — a title problem
  | "slipping"     // position getting worse
  | "competing"    // two of your own pages fighting over it
  | "no_presence"  // a rival covers it and you have no impressions at all
  | "mismatch"     // you appear, but probably not for your buyer
  | "brand"        // your own name — already yours, not an opportunity
  | "watching";    // tracked, too little data to say anything yet

export type BucketMeta = {
  label:  string;
  /** What being in this bucket means, in the user's terms. */
  meaning: string;
  /** What to do about it. */
  action: string;
  /** Ordering on the page. Lower comes first. */
  order:  number;
};

export const BUCKETS: Record<Bucket, BucketMeta> = {
  striking: {
    label: "Nearly there", order: 1,
    meaning: "You already rank on page two or the bottom of page one. Google has decided you are relevant; it has not yet decided you are the best answer.",
    action: "Strengthen the page that ranks. This is the cheapest traffic available to you — the distance from position 12 to position 6 is far shorter than from nothing to position 12.",
  },
  ctr_gap: {
    label: "Seen, not clicked", order: 2,
    meaning: "You rank well enough to be shown, and people are choosing someone else from the results page.",
    action: "This is a title and description problem, not a ranking problem. Rewrite what the searcher sees before they click.",
  },
  slipping: {
    label: "Losing ground", order: 3,
    meaning: "Your average position for this has got worse since the previous period.",
    action: "Worth looking at before it becomes a rebuild. Something else overtook you, or the page went stale.",
  },
  no_presence: {
    label: "No presence", order: 4,
    meaning: "A competitor publishes on this subject and Search Console shows you no impressions for it at all — you are not in the running.",
    action: "This needs a page, not an edit. Note that we know they cover it and that you don't; we do not know how many people search for it.",
  },
  competing: {
    label: "Competing with yourself", order: 5,
    meaning: "More than one of your own pages ranks for this, so they split the signal and neither wins.",
    action: "Pick the page that should own it and point the others at it.",
  },
  winning: {
    label: "Winning", order: 6,
    meaning: "Top three positions, and people are actually clicking through. This is the outcome everything else in this list is trying to become.",
    action: "Nothing to do except avoid breaking it. Worth watching, because these are what a competitor's new page takes from you first.",
  },
  mismatch: {
    label: "Not your buyer", order: 7,
    meaning: "You get impressions for this, but the query suggests it is not someone looking to buy from you.",
    action: "Usually harmless. Worth knowing, because it drags your overall click-through rate down and muddies what Google thinks you are about.",
  },
  brand: {
    label: "Your own name", order: 8,
    meaning: "People searching for you by name — they already knew who you were before they opened Google, so this traffic measures your reputation rather than your search performance.",
    action: "Already yours. Kept separate because 'rank higher for your own company name' is not a strategy, and mixing it in makes everything else look better than it is.",
  },
  watching: {
    label: "Watching", order: 9,
    meaning: "On your list, but without enough Search Console data yet to say anything useful.",
    action: "Leave it. It will move into a real bucket once it has impressions behind it.",
  },
};

/** Which Opportunity kind maps to which bucket. */
const FROM_OPPORTUNITY: Record<OpportunityKind, Bucket | null> = {
  striking_distance: "striking",
  ctr_gap:           "ctr_gap",
  decay:             "slipping",
  cannibalisation:   "competing",
  // Foundational advice is about the site, not about one keyword, so it does
  // not place a keyword in a bucket.
  foundation:        null,
};

// ─── Mismatch detection ──────────────────────────────────────────────────────

/**
 * Query shapes that are almost never a buyer.
 *
 * Deliberately short. A long list starts eating real commercial intent — "free
 * quote" and "salary" look similar to a regex and could not be more different
 * to a business. Everything here is someone looking for a job, a definition, or
 * someone else's login.
 */
const NOT_A_BUYER = [
  "job", "jobs", "career", "careers", "vacancy", "vacancies", "salary",
  "internship", "apprenticeship", "cv template", "wikipedia", "meaning",
  "definition", "how to become",
];

/**
 * Is this query probably not our customer?
 *
 * Two signals, both concrete. Guessing intent from a phrase is exactly the kind
 * of confident inference this codebase keeps having to remove, so the bucket
 * only fires on evidence: an explicit non-buyer marker, or a competitor's own
 * brand name that the user themselves added to the tracked list.
 */
export function looksLikeMismatch(query: string, competitorTokens: string[]): string | null {
  const q = ` ${query.toLowerCase()} `;

  for (const marker of NOT_A_BUYER) {
    if (q.includes(` ${marker} `)) {
      return `Contains "${marker}" — that is usually someone looking for a job or a definition, not a customer.`;
    }
  }
  for (const token of competitorTokens) {
    if (token.length >= 4 && q.includes(` ${token} `)) {
      return `Mentions ${token}, a competitor you track. You are appearing in someone else's brand search, which converts poorly.`;
    }
  }
  return null;
}

// ─── Classification ──────────────────────────────────────────────────────────

export type WatchRow = {
  keyword: string;
  source:  string | null;
  notes:   string | null;
};

export type BucketedKeyword = {
  term:    string;
  bucket:  Bucket;
  /** Why this term is in this bucket, in one sentence, from real numbers. */
  why:     string;
  /** True when the user has this on their watchlist. */
  watched: boolean;
  /** Where it came from, when it isn't a Search Console query. */
  source:  string | null;
  /** Search Console figures. Null throughout for terms with no impressions. */
  clicks:      number | null;
  impressions: number | null;
  ctr:         number | null;
  position:    number | null;
  /** The opportunity that decided this bucket, when one did. */
  opportunityScore: number | null;
  confidence: "high" | "medium" | "low" | null;
};

export type BucketReport = {
  keywords: BucketedKeyword[];
  counts:   Record<Bucket, number>;
  /** How the classification was produced, so the page can say so. */
  basis: {
    queries:        number;
    watched:        number;
    fromOpportunity: number;
    period:         string;
  };
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Sort every query and watchlist term into a bucket.
 *
 * Precedence is deliberate and runs most-specific first: an Opportunity beats a
 * positional rule, because the opportunity engine knows about the site's own
 * CTR curve and this function does not.
 */
export function classifyKeywords(input: {
  queries:          QueryRow[];
  opportunities:    Opportunity[];
  watchlist:        WatchRow[];
  brandTokens:      string[];
  competitorTokens: string[];
  period?:          string;
}): BucketReport {
  const {
    queries, opportunities, watchlist,
    brandTokens, competitorTokens, period = "last 28 days",
  } = input;

  const watched = new Map(watchlist.map(w => [w.keyword.toLowerCase().trim(), w]));

  // The strongest opportunity per query. A term can appear in more than one
  // analysis; the highest-scoring one is the one worth acting on.
  const bestOpp = new Map<string, Opportunity>();
  for (const o of opportunities) {
    const key = o.query.toLowerCase().trim();
    const cur = bestOpp.get(key);
    if (!cur || o.score > cur.score) bestOpp.set(key, o);
  }

  const out: BucketedKeyword[] = [];
  const seen = new Set<string>();
  let fromOpportunity = 0;

  for (const row of queries) {
    const key = row.query.toLowerCase().trim();
    seen.add(key);

    const watch = watched.get(key);
    const base = {
      term: row.query,
      watched: !!watch,
      source: watch?.source ?? null,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: round1(row.ctr),
      position: round1(row.position),
    };

    // 1. Brand first. Otherwise a company's own name lands in "winning" and
    //    flatters the whole picture — you were always going to rank for it.
    if (brandTokens.length && isBrandedQuery(row.query, brandTokens)) {
      out.push({
        ...base, bucket: "brand",
        why: `Someone searching for you by name. Position ${round1(row.position)}, ${row.clicks} clicks.`,
        opportunityScore: null, confidence: null,
      });
      continue;
    }

    // 2. An Opportunity, if the engine found one. It has the CTR curve and the
    //    scaled thresholds; this function has neither.
    const opp = bestOpp.get(key);
    const mapped = opp ? FROM_OPPORTUNITY[opp.kind] : null;
    if (opp && mapped) {
      fromOpportunity++;
      out.push({
        ...base, bucket: mapped,
        why: opp.title,
        opportunityScore: opp.score,
        confidence: opp.confidence,
      });
      continue;
    }

    // 3. Not our buyer — checked before the positional rules, because a job
    //    search sitting at position 2 is not a win worth defending.
    const mismatch = looksLikeMismatch(row.query, competitorTokens);
    if (mismatch) {
      out.push({
        ...base, bucket: "mismatch", why: mismatch,
        opportunityScore: null, confidence: null,
      });
      continue;
    }

    // 4. Positional fallback, for queries the engine passed over — usually
    //    because they sit below its impression thresholds.
    if (row.position <= 3 && row.clicks > 0) {
      out.push({
        ...base, bucket: "winning",
        why: `Position ${round1(row.position)} with ${row.clicks} click${row.clicks === 1 ? "" : "s"} from ${row.impressions.toLocaleString()} impressions.`,
        opportunityScore: null, confidence: null,
      });
    } else if (row.position > 3 && row.position <= 20) {
      out.push({
        ...base, bucket: "striking",
        why: `Position ${round1(row.position)} from ${row.impressions.toLocaleString()} impressions — close enough to move, too few impressions for us to rank it against the others.`,
        opportunityScore: null, confidence: "low",
      });
    } else {
      out.push({
        ...base, bucket: "watching",
        why: row.impressions < 10
          ? `Only ${row.impressions} impression${row.impressions === 1 ? "" : "s"} — not enough to say anything yet.`
          : `Position ${round1(row.position)}, outside the range where a small change would show.`,
        opportunityScore: null, confidence: null,
      });
    }
  }

  // 5. Watchlist terms Search Console has never shown. This is the bucket the
  //    rest of the product could not produce: it needs both halves, and each
  //    half is a measurement rather than an estimate.
  for (const w of watchlist) {
    const key = w.keyword.toLowerCase().trim();
    if (seen.has(key)) continue;

    const fromGap = w.source === "gap";
    out.push({
      term: w.keyword,
      bucket: fromGap ? "no_presence" : "watching",
      why: fromGap
        ? (w.notes ?? "A competitor publishes on this and you have no impressions for it.")
        : "On your list, with no Search Console impressions in this period.",
      watched: true,
      source: w.source,
      // Null, not zero. "No impressions recorded" and "zero people saw you" are
      // the same number and different claims, and only one of them is ours to
      // make from an absent row.
      clicks: null, impressions: null, ctr: null, position: null,
      opportunityScore: null, confidence: null,
    });
  }

  const counts = Object.keys(BUCKETS).reduce((acc, b) => {
    acc[b as Bucket] = 0;
    return acc;
  }, {} as Record<Bucket, number>);
  for (const k of out) counts[k.bucket]++;

  // Bucket order first, then by whatever signal that bucket is sorted on:
  // opportunity score where we have one, impressions otherwise.
  out.sort((a, b) => {
    const byBucket = BUCKETS[a.bucket].order - BUCKETS[b.bucket].order;
    if (byBucket !== 0) return byBucket;
    const sa = a.opportunityScore ?? -1;
    const sb = b.opportunityScore ?? -1;
    if (sa !== sb) return sb - sa;
    return (b.impressions ?? 0) - (a.impressions ?? 0);
  });

  return {
    keywords: out,
    counts,
    basis: {
      queries: queries.length,
      watched: watchlist.length,
      fromOpportunity,
      period,
    },
  };
}

/**
 * Brand-ish tokens for the competitor domains the user tracks.
 *
 * Used only for mismatch detection, so it is deliberately conservative: TLDs
 * and short fragments are dropped, because matching "ai" or "co" against every
 * query would classify half a site's traffic as somebody else's brand.
 */
export function competitorTokensFrom(domains: string[]): string[] {
  const out = new Set<string>();
  for (const d of domains) {
    for (const part of d.toLowerCase().replace(/^www\./, "").split(/[.\-_]/)) {
      if (part.length >= 4 && !["com", "org", "net", "info", "co.uk"].includes(part)) {
        out.add(part);
      }
    }
  }
  return [...out];
}
