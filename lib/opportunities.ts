// lib/opportunities.ts
// =============================================================================
// AI Marketing Lab — the opportunity engine
//
// Turns raw Search Console rows into ranked, explainable actions. This is the
// core of the "strategist" positioning: every opportunity carries the evidence
// that produced it, so the UI can show its working rather than asserting.
//
// Everything here runs on Search Console data alone — no paid provider, no
// SERP scraping. That's deliberate: these analyses are more actionable than
// rank tracking and cost nothing to run.
//
// Pure functions only. No fetching, no React, no side effects — so the maths
// can be tested directly.
// =============================================================================

// ─── input shapes ────────────────────────────────────────────────────────────

/** One GSC row keyed by query alone. */
export type QueryRow = {
  query:       string;
  clicks:      number;
  impressions: number;
  ctr:         number;   // 0-100 (percentage), matching /api/gsc's output
  position:    number;
};

/** One GSC row keyed by query + page. */
export type QueryPageRow = QueryRow & { page: string };

// ─── output shapes ───────────────────────────────────────────────────────────

export type OpportunityKind =
  | "striking_distance"
  | "ctr_gap"
  | "cannibalisation"
  | "decay";

/**
 * A single recommended action.
 *
 * `evidence` is the point of this whole module — an array of plain-language
 * facts, each traceable to a number the user can verify in Search Console.
 * The UI renders these under a "why" disclosure.
 */
export type Opportunity = {
  kind:        OpportunityKind;
  title:       string;
  query:       string;
  page?:       string;
  /** 0-100. Relative priority within the whole result set, not a percentage. */
  score:       number;
  /** Estimated additional monthly clicks if the action succeeds. Null when we
   *  genuinely can't estimate — never a fabricated number. */
  clickUpside: number | null;
  effort:      "low" | "medium" | "high";
  /** How much weight this finding deserves, given the volume behind it. */
  confidence:  "high" | "medium" | "low";
  evidence:    string[];
  /** Raw numbers so the UI can render a table without re-deriving anything. */
  metrics: {
    clicks:      number;
    impressions: number;
    ctr:         number;
    position:    number;
    expectedCtr?: number;
    pages?:       string[];
    previousClicks?:      number;
    previousImpressions?: number;
  };
};

// ─── expected CTR by position ────────────────────────────────────────────────

/**
 * Fallback CTR curve, used only when the site doesn't yet have enough of its
 * own data. These are approximate industry figures for organic desktop+mobile
 * blended, and they vary enormously by SERP layout and intent — which is
 * exactly why we prefer the site's own curve when we can build one.
 *
 * Values are percentages.
 */
const FALLBACK_CTR_CURVE: Record<number, number> = {
  1: 27.6, 2: 15.8, 3: 11.0, 4: 8.4, 5: 6.3,
  6: 4.9,  7: 3.9,  8: 3.3,  9: 2.8, 10: 2.4,
  11: 2.0, 12: 1.7, 13: 1.5, 14: 1.3, 15: 1.2,
  16: 1.1, 17: 1.0, 18: 0.9, 19: 0.8, 20: 0.7,
};

function fallbackCtr(position: number): number {
  const p = Math.max(1, Math.round(position));
  if (p <= 20) return FALLBACK_CTR_CURVE[p] ?? 0.7;
  // Beyond position 20 the curve is flat and very low.
  return 0.5;
}

export type CtrCurve = {
  /** Percentage CTR expected at a given (rounded) position. */
  at: (position: number) => number;
  /** True when built from the site's own data rather than the fallback. */
  fromSiteData: boolean;
  /** How many positions had enough data to be measured directly. */
  measuredPositions: number;
};

/**
 * Build a CTR curve from the site's own rows where possible.
 *
 * Why bother instead of using industry figures: a B2B site with a niche
 * audience and a consumer site with a crowded SERP have completely different
 * real curves. Judging "underperforming" against someone else's average
 * produces confident nonsense. We use the site's own median CTR per position
 * where there's enough evidence, and fall back per-position otherwise.
 *
 * Median rather than mean — a single viral query would otherwise drag the
 * expectation for its whole position band.
 */
export function buildCtrCurve(rows: QueryRow[], minRowsPerPosition = 5): CtrCurve {
  const byPosition = new Map<number, number[]>();

  for (const r of rows) {
    // Ignore very low-impression rows: CTR on 3 impressions is noise, and it
    // would distort the median for that position.
    if (r.impressions < 30) continue;
    const p = Math.round(r.position);
    if (p < 1 || p > 20) continue;
    const list = byPosition.get(p) ?? [];
    list.push(r.ctr);
    byPosition.set(p, list);
  }

  const measured = new Map<number, number>();
  for (const [pos, ctrs] of byPosition) {
    if (ctrs.length < minRowsPerPosition) continue;
    const sorted = [...ctrs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    measured.set(
      pos,
      sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    );
  }

  return {
    at: (position: number) => {
      const p = Math.max(1, Math.round(position));
      return measured.get(p) ?? fallbackCtr(p);
    },
    fromSiteData:      measured.size > 0,
    measuredPositions: measured.size,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10;

/** GSC reports over 28 days; most people think in months. */
function toMonthly(value: number, periodDays = 28): number {
  return Math.round((value / periodDays) * 30);
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

// ─── adaptive thresholds ─────────────────────────────────────────────────────

/**
 * Fixed impression minimums (50 for striking distance, 100 for CTR gaps) are
 * right for an established site and useless for a new one. A site with 53 total
 * impressions across 14 queries clears none of them, so it gets an empty page
 * at exactly the moment it most needs direction.
 *
 * So the floors scale to the site's own distribution: we take a percentile of
 * its query impressions and clamp into a sane band. A large site keeps strict
 * thresholds (avoiding noise); a small site gets its proportionally-best
 * queries surfaced, clearly marked as low-confidence.
 *
 * The alternative — showing nothing until a site is "big enough" — is the
 * behaviour we're specifically trying to avoid.
 */
export type SiteScale = {
  totalImpressions: number;
  queryCount:       number;
  /** Impressions at the 60th percentile of queries — the "typical good" query. */
  typicalImpressions: number;
  /** True when the site is too small for standard thresholds. */
  isEarlyStage: boolean;
  thresholds: {
    strikingDistance: number;
    ctrGap:           number;
    cannibalisation:  number;
    decayPrevious:    number;
  };
};

export function computeScale(rows: QueryRow[]): SiteScale {
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
  const typical = percentile(rows.map(r => r.impressions), 60);

  // Under ~500 total impressions there simply isn't enough volume for the
  // standard floors to admit anything.
  const isEarlyStage = totalImpressions < 500;

  // Clamp so we never go below 3 (one impression is not a signal) and never
  // above the established-site defaults.
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.round(v)));

  return {
    totalImpressions,
    queryCount: rows.length,
    typicalImpressions: typical,
    isEarlyStage,
    thresholds: isEarlyStage
      ? {
          strikingDistance: clamp(typical * 0.5, 3, 50),
          ctrGap:           clamp(typical,       5, 100),
          cannibalisation:  clamp(typical * 0.5, 3, 50),
          decayPrevious:    clamp(typical,       5, 100),
        }
      : {
          strikingDistance: 50,
          ctrGap:           100,
          cannibalisation:  50,
          decayPrevious:    100,
        },
  };
}

/**
 * Confidence in a single opportunity, driven by the evidence behind it.
 * Surfaced in the UI so a 6-impression finding isn't presented with the same
 * authority as a 6,000-impression one.
 */
export type Confidence = "high" | "medium" | "low";

function confidenceFor(impressions: number): Confidence {
  if (impressions >= 300) return "high";
  if (impressions >= 50)  return "medium";
  return "low";
}

// ─── absolute floors ─────────────────────────────────────────────────────────
//
// Adaptive thresholds can scale down, but not indefinitely. Below these values
// a "finding" is indistinguishable from random variation, and showing it makes
// the product look credulous rather than helpful.
//
// Learned the hard way: a first version surfaced "marketing lab norfolk is
// losing visibility" on the strength of one impression at position 37.
const FLOORS = {
  /** Never report decay on fewer impressions than this, whatever the site size. */
  decayImpressions: 10,
  /** Decay past this position is irrelevant — nobody sees page 4 anyway, so
   *  "losing ground" there is not a loss worth acting on. */
  decayMaxPosition: 30,
  /** Striking distance needs at least a couple of impressions to be real. */
  strikingImpressions: 3,
};

// ─── branded queries ─────────────────────────────────────────────────────────

/**
 * Derive brand tokens from the site's domain.
 *
 * "aimarketinglab.co.uk" yields both "aimarketinglab" and "ai marketing lab",
 * because searchers type it both ways and GSC reports them as distinct queries.
 * The spaced variant is produced by splitting the domain on common word
 * boundaries — imperfect, but it catches the majority of real brand searches.
 */
export function brandTokensFromSite(siteUrl: string): string[] {
  const host = siteUrl
    .replace(/^sc-domain:/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase();

  // Strip the public suffix: co.uk, com, org.uk …
  const bare = host.replace(/\.(co\.uk|org\.uk|ac\.uk|com|net|org|io|ai|dev|app|uk)$/i, "");
  const compact = bare.replace(/[^a-z0-9]/g, "");
  if (!compact) return [];

  const tokens = new Set<string>([compact]);

  // Hyphenated or dotted domains give us the word split for free.
  const parts = bare.split(/[-.]/).filter(Boolean);
  if (parts.length > 1) tokens.add(parts.join(" "));

  return [...tokens];
}

/**
 * Is this query a search for the brand itself?
 *
 * Matching is done on a normalised, space-stripped form so "ai marketing lab",
 * "aimarketinglab" and "ai marketinglab" all collapse to the same string.
 */
export function isBrandedQuery(query: string, brandTokens: string[]): boolean {
  if (!brandTokens.length) return false;
  const compact = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  return brandTokens.some(token => {
    const t = token.replace(/[^a-z0-9]/g, "");
    return t.length >= 4 && compact.includes(t);
  });
}

export type BrandSplit = {
  branded:    QueryRow[];
  nonBranded: QueryRow[];
  brandedImpressionShare: number;
};

/**
 * Separate brand searches from everything else.
 *
 * This matters more than it looks. Brand searches are existing demand — people
 * who already know you — so counting them as SEO performance flatters the
 * numbers and, worse, produces "opportunities" for queries you already own.
 * Non-branded impressions are the only measure of genuinely new reach.
 */
export function splitBranded(rows: QueryRow[], brandTokens: string[]): BrandSplit {
  const branded: QueryRow[] = [];
  const nonBranded: QueryRow[] = [];

  for (const r of rows) {
    (isBrandedQuery(r.query, brandTokens) ? branded : nonBranded).push(r);
  }

  const total = rows.reduce((s, r) => s + r.impressions, 0);
  const brandedImpressions = branded.reduce((s, r) => s + r.impressions, 0);

  return {
    branded,
    nonBranded,
    brandedImpressionShare: total ? brandedImpressions / total : 0,
  };
}

// ─── 1. striking distance ────────────────────────────────────────────────────

/**
 * Queries ranking just off page 1 (positions 11-20 by default) with enough
 * impressions to be worth the effort.
 *
 * This is usually the single highest-ROI list a site has: the page already
 * ranks, Google already considers it relevant, and the gap to page 1 is small.
 * Compare with writing something new, where you start from nothing.
 */
export function findStrikingDistance(
  rows: QueryRow[],
  curve: CtrCurve,
  opts: { minPosition?: number; maxPosition?: number; minImpressions?: number } = {},
): Opportunity[] {
  const minPos = opts.minPosition ?? 11;
  const maxPos = opts.maxPosition ?? 20;
  const minImp = Math.max(opts.minImpressions ?? 50, FLOORS.strikingImpressions);

  return rows
    .filter(r => r.position >= minPos && r.position <= maxPos && r.impressions >= minImp)
    .map(r => {
      // Model the upside as reaching position 8 — a realistic near-term target
      // from the teens, rather than assuming position 1 and overstating.
      const targetPosition = 8;
      const targetCtr      = curve.at(targetPosition);
      const gainedClicks   = Math.max(
        0,
        Math.round((r.impressions * (targetCtr - r.ctr)) / 100),
      );

      // Impressions matter more than raw proximity: position 19 with 4,000
      // impressions beats position 11 with 60.
      const impressionWeight = Math.min(1, r.impressions / 1000);
      const proximityWeight  = (maxPos - r.position) / (maxPos - minPos); // 0-1
      const score = Math.round((impressionWeight * 0.65 + proximityWeight * 0.35) * 100);

      return {
        kind:  "striking_distance" as const,
        title: `Push "${r.query}" onto page 1`,
        query: r.query,
        score,
        clickUpside: toMonthly(gainedClicks),
        effort: (r.position <= 15 ? "low" : "medium") as "low" | "medium",
        confidence: confidenceFor(r.impressions),
        evidence: [
          `Currently position ${round1(r.position)} — just off page 1.`,
          `${r.impressions.toLocaleString()} impressions in the last 28 days, so the demand is already there.`,
          `Earning ${r.clicks} clicks at ${round1(r.ctr)}% CTR.`,
          `Reaching position ${targetPosition} would put CTR near ${round1(targetCtr)}%, roughly ${toMonthly(gainedClicks)} more clicks a month.`,
          `Google already ranks you for this — you're improving a page, not starting one.`,
        ],
        metrics: {
          clicks:      r.clicks,
          impressions: r.impressions,
          ctr:         round1(r.ctr),
          position:    round1(r.position),
          expectedCtr: round1(targetCtr),
        },
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ─── 2. CTR gaps ─────────────────────────────────────────────────────────────

/**
 * Queries ranking well but under-clicked for their position — almost always a
 * title or meta description problem, which is the cheapest fix in SEO.
 *
 * Only considers positions 1-10: below that, low CTR is explained by position
 * itself, and flagging it would be noise.
 */
export function findCtrGaps(
  rows: QueryRow[],
  curve: CtrCurve,
  opts: { minImpressions?: number; minShortfallRatio?: number } = {},
): Opportunity[] {
  const minImp   = opts.minImpressions    ?? 100;
  const minRatio = opts.minShortfallRatio ?? 0.6; // actual must be <60% of expected

  return rows
    .filter(r => r.position <= 10 && r.impressions >= minImp)
    .map((r): Opportunity | null => {
      const expected = curve.at(r.position);
      if (expected <= 0) return null;
      const ratio = r.ctr / expected;
      if (ratio >= minRatio) return null;

      const gainedClicks = Math.max(
        0,
        Math.round((r.impressions * (expected - r.ctr)) / 100),
      );
      if (gainedClicks < 1) return null;

      // Bigger shortfall and more impressions both raise priority.
      const shortfall = 1 - ratio;                       // 0-1
      const impWeight = Math.min(1, r.impressions / 2000);
      const score = Math.round((shortfall * 0.5 + impWeight * 0.5) * 100);

      return {
        kind:  "ctr_gap" as const,
        title: `Rewrite the title for "${r.query}"`,
        query: r.query,
        score,
        clickUpside: toMonthly(gainedClicks),
        effort: "low" as const,
        confidence: confidenceFor(r.impressions),
        evidence: [
          `Ranking position ${round1(r.position)} with ${r.impressions.toLocaleString()} impressions — visibility isn't the problem.`,
          `CTR is ${round1(r.ctr)}%, against ${round1(expected)}% expected at this position${curve.fromSiteData ? " based on your own pages" : ""}.`,
          `That's ${Math.round(shortfall * 100)}% below par — people are seeing you and choosing something else.`,
          `Closing the gap is worth roughly ${toMonthly(gainedClicks)} clicks a month.`,
          `Usually a title or meta description mismatch, which is a minutes-long fix.`,
        ],
        metrics: {
          clicks:      r.clicks,
          impressions: r.impressions,
          ctr:         round1(r.ctr),
          position:    round1(r.position),
          expectedCtr: round1(expected),
        },
      };
    })
    .filter((o): o is Opportunity => o !== null)
    .sort((a, b) => b.score - a.score);
}

// ─── 3. cannibalisation ──────────────────────────────────────────────────────

/**
 * One query, several of your own URLs competing for it.
 *
 * This splits authority and confuses Google about which page to rank, and it's
 * invisible in any report that groups by query alone — which is most of them.
 */
export function findCannibalisation(
  rows: QueryPageRow[],
  opts: { minImpressions?: number; minPages?: number } = {},
): Opportunity[] {
  const minImp   = opts.minImpressions ?? 50;
  const minPages = opts.minPages       ?? 2;

  const byQuery = new Map<string, QueryPageRow[]>();
  for (const r of rows) {
    const list = byQuery.get(r.query) ?? [];
    list.push(r);
    byQuery.set(r.query, list);
  }

  const out: Opportunity[] = [];

  for (const [query, group] of byQuery) {
    // Only pages with meaningful impressions count as genuine competition —
    // a page with 2 impressions isn't cannibalising anything.
    const competing = group.filter(r => r.impressions >= 10);
    if (competing.length < minPages) continue;

    const totalImpressions = competing.reduce((s, r) => s + r.impressions, 0);
    if (totalImpressions < minImp) continue;

    const sorted = [...competing].sort((a, b) => b.impressions - a.impressions);
    const best   = sorted[0];
    const rest   = sorted.slice(1);
    const totalClicks = competing.reduce((s, r) => s + r.clicks, 0);

    // Weight by how evenly split it is — a 50/50 split is a worse problem than
    // 95/5, where Google has effectively already decided.
    const splitRatio = rest.reduce((s, r) => s + r.impressions, 0) / totalImpressions;
    const impWeight  = Math.min(1, totalImpressions / 1000);
    const score = Math.round((splitRatio * 0.6 + impWeight * 0.4) * 100);

    out.push({
      kind:  "cannibalisation",
      title: `${competing.length} of your pages compete for "${query}"`,
      query,
      page:  best.page,
      score,
      // Deliberately null: consolidation gains are real but not reliably
      // predictable, and inventing a number here would undermine the rest.
      clickUpside: null,
      effort: "medium",
      confidence: confidenceFor(totalImpressions),
      evidence: [
        `${competing.length} URLs rank for this query, splitting ${totalImpressions.toLocaleString()} impressions between them.`,
        `Strongest is ${best.page} at position ${round1(best.position)} with ${best.impressions.toLocaleString()} impressions.`,
        ...rest.slice(0, 3).map(r => `Also competing: ${r.page} at position ${round1(r.position)} (${r.impressions.toLocaleString()} impressions).`),
        `Between them they earn ${totalClicks} clicks — split authority usually means none of them ranks as well as one consolidated page would.`,
        `Either merge them, or differentiate the intent so each targets a distinct query.`,
      ],
      metrics: {
        clicks:      totalClicks,
        impressions: totalImpressions,
        ctr:         round1(totalImpressions ? (totalClicks / totalImpressions) * 100 : 0),
        position:    round1(best.position),
        pages:       sorted.map(r => r.page),
      },
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

// ─── 4. decay ────────────────────────────────────────────────────────────────

/**
 * Queries losing ground compared with the previous period.
 *
 * Catching decline early is far cheaper than rebuilding lost rankings, and
 * declining pages are invisible on any dashboard that only shows current
 * state — which is most of them.
 */
export function findDecay(
  current: QueryRow[],
  previous: QueryRow[],
  opts: { minPreviousImpressions?: number; minDropRatio?: number } = {},
): Opportunity[] {
  // Absolute floor wins over any adaptive threshold — see FLOORS.
  const minPrevImp = Math.max(opts.minPreviousImpressions ?? 100, FLOORS.decayImpressions);
  const minDrop    = opts.minDropRatio ?? 0.25; // 25% down

  const prevByQuery = new Map(previous.map(r => [r.query, r]));
  const out: Opportunity[] = [];

  for (const now of current) {
    const before = prevByQuery.get(now.query);
    if (!before || before.impressions < minPrevImp) continue;

    // Losing ground on page 4 isn't a loss worth acting on — you had no
    // meaningful visibility to lose.
    if (before.position > FLOORS.decayMaxPosition) continue;

    const impressionDrop = (before.impressions - now.impressions) / before.impressions;
    if (impressionDrop < minDrop) continue;

    const clicksLost   = Math.max(0, before.clicks - now.clicks);
    const positionMove = now.position - before.position; // positive = worse

    const dropWeight = Math.min(1, impressionDrop);
    const sizeWeight = Math.min(1, before.impressions / 1000);
    const score = Math.round((dropWeight * 0.55 + sizeWeight * 0.45) * 100);

    const evidence = [
      `Impressions fell ${Math.round(impressionDrop * 100)}% — from ${before.impressions.toLocaleString()} to ${now.impressions.toLocaleString()}.`,
      clicksLost > 0
        ? `That's ${clicksLost} fewer clicks than the previous period.`
        : `Clicks have held up so far, but the impression drop usually precedes a click drop.`,
    ];

    // Separate the two very different causes: falling rankings versus falling
    // demand. The fix is completely different and it's the first thing a
    // strategist should establish.
    if (positionMove > 0.5) {
      evidence.push(
        `Average position worsened from ${round1(before.position)} to ${round1(now.position)} — this looks like lost ranking, not lost demand.`,
        `Check whether a competitor has published something stronger, or whether the page has gone stale.`,
      );
    } else {
      evidence.push(
        `Average position is stable (${round1(before.position)} → ${round1(now.position)}), so this is falling demand rather than lost ranking.`,
        `Seasonal or interest-driven. Worth confirming before spending effort "fixing" a page that isn't broken.`,
      );
    }

    out.push({
      kind:  "decay",
      title: `"${now.query}" is losing visibility`,
      query: now.query,
      score,
      clickUpside: clicksLost > 0 ? toMonthly(clicksLost) : null,
      effort: positionMove > 0.5 ? "medium" : "low",
      confidence: confidenceFor(before.impressions),
      evidence,
      metrics: {
        clicks:              now.clicks,
        impressions:         now.impressions,
        ctr:                 round1(now.ctr),
        position:            round1(now.position),
        previousClicks:      before.clicks,
        previousImpressions: before.impressions,
      },
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

// ─── headline diagnosis ──────────────────────────────────────────────────────

export type Diagnosis = {
  headline: string;
  detail:   string;
};

/**
 * One paragraph naming the site's dominant problem.
 *
 * A strategist opens with a finding, not a metric. This deliberately picks a
 * single dominant pattern rather than listing everything — the whole point is
 * to direct attention.
 */
export function diagnose(
  rows: QueryRow[],
  opportunities: Opportunity[],
  scale?: SiteScale,
  split?: BrandSplit,
): Diagnosis {
  // `rows` here is already the non-branded set. A site whose entire footprint
  // is brand searches has no organic reach yet, which is a finding in itself
  // and quite different from "no data".
  if (rows.length === 0 && split && split.branded.length > 0) {
    const brandImpressions = split.branded.reduce((s, r) => s + r.impressions, 0);
    return {
      headline: "Everyone finding you already knows your name",
      detail:
        `All ${brandImpressions.toLocaleString()} of your impressions come from brand searches — people typing your company name. ` +
        `That's existing demand, not new reach. You currently have no non-branded visibility at all, which means search isn't yet bringing you anyone who didn't already know about you. ` +
        `The priority is content targeting what your customers search for *before* they've heard of you.`,
    };
  }

  if (rows.length === 0) {
    return {
      headline: "Not enough Search Console data yet",
      detail:   "Once your site has search impressions we can identify where the biggest gains are. This usually takes a few weeks after launch.",
    };
  }

  // A high branded share is worth naming even when there IS non-branded data —
  // it's the difference between growing reach and harvesting existing demand.
  const brandNote = split && split.brandedImpressionShare > 0.5 && split.branded.length > 0
    ? ` Separately, ${Math.round(split.brandedImpressionShare * 100)}% of your total impressions are brand searches — existing demand rather than new reach.`
    : "";

  // Early-stage sites deserve a real reading of what little data they have,
  // not "come back later". What you're *already* being shown for is the single
  // most useful signal at this point: it tells you what Google currently thinks
  // you're about, which is what you either lean into or correct.
  if (scale?.isEarlyStage) {
    const sorted   = [...rows].sort((a, b) => b.impressions - a.impressions);
    const top      = sorted.slice(0, 3);
    const best     = sorted.filter(r => r.position <= 20);
    const bestList = top.map(r => `"${r.query}"`).join(", ");

    if (best.length > 0) {
      const closest = [...best].sort((a, b) => a.position - b.position)[0];
      return {
        headline: "Google is starting to place you — here's where",
        detail:
          `${scale.totalImpressions.toLocaleString()} impressions across ${rows.length} queries so far. ` +
          `Your strongest showing is "${closest.query}" at position ${round1(closest.position)}. ` +
          `Most visible so far: ${bestList}. ` +
          `At this volume the numbers aren't yet reliable enough to optimise against — but they do tell you what Google currently thinks your site is about. ` +
          `If that matches your intent, publish more depth around those themes. If it doesn't, your positioning needs work before your content does.` +
          brandNote,
      };
    }

    return {
      headline: "Indexed, but not yet placed",
      detail:
        `${scale.totalImpressions.toLocaleString()} impressions across ${rows.length} queries, none ranking inside the top 20 yet. ` +
        `That's normal for a new site — Google has found you but hasn't decided where you belong. ` +
        `Most visible so far: ${bestList}. ` +
        `The priority now is depth on a narrow topic rather than breadth, and earning your first external links.` +
        brandNote,
    };
  }

  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
  const totalClicks      = rows.reduce((s, r) => s + r.clicks, 0);
  const page2 = rows.filter(r => r.position > 10 && r.position <= 20);
  const page1 = rows.filter(r => r.position <= 10);

  const page2Impressions = page2.reduce((s, r) => s + r.impressions, 0);
  const page2Share       = totalImpressions ? page2Impressions / totalImpressions : 0;

  const ctrGaps  = opportunities.filter(o => o.kind === "ctr_gap");
  const decaying = opportunities.filter(o => o.kind === "decay");
  const cannibal = opportunities.filter(o => o.kind === "cannibalisation");

  // Ordered by how much the finding should dominate attention.
  if (page2Share > 0.5 && page2.length >= 5) {
    return {
      headline: "You're close on a lot of terms, but not closing",
      detail:   `${Math.round(page2Share * 100)}% of your impressions sit in positions 11–20 across ${page2.length} queries. You have the topical coverage — what's missing is the last push: internal links, depth, and authority on pages that already rank. Publishing more new content will not fix this.`,
    };
  }

  if (ctrGaps.length >= 3) {
    const upside = ctrGaps.reduce((s, o) => s + (o.clickUpside ?? 0), 0);
    return {
      headline: "You're ranking well and being passed over",
      detail:   `${ctrGaps.length} queries rank on page 1 but earn well below the click-through rate their position warrants. That's roughly ${upside} clicks a month sitting in your titles and meta descriptions. It's the cheapest fix available to you.`,
    };
  }

  if (decaying.length >= 3) {
    return {
      headline: "Existing pages are slipping",
      detail:   `${decaying.length} queries have lost meaningful visibility versus the previous period. Recovering ground on pages that already rank is materially cheaper than earning new rankings — deal with this before starting anything new.`,
    };
  }

  if (cannibal.length >= 2) {
    return {
      headline: "You're competing with yourself",
      detail:   `${cannibal.length} queries have multiple of your own pages ranking, splitting authority between them. Consolidating usually lifts one page higher than any of them currently reach.`,
    };
  }

  if (page1.length > 0 && totalClicks > 0) {
    return {
      headline: "Foundations look healthy",
      detail:   `${page1.length} queries rank on page 1, earning ${totalClicks.toLocaleString()} clicks from ${totalImpressions.toLocaleString()} impressions. No single dominant problem stands out — growth now comes from widening coverage rather than fixing what's there.`,
    };
  }

  return {
    headline: "Early days — coverage is the constraint",
    detail:   `${totalImpressions.toLocaleString()} impressions across ${rows.length} queries, with little on page 1 yet. At this stage the priority is publishing against clear intent and earning initial authority, not optimisation.`,
  };
}

// ─── orchestration ───────────────────────────────────────────────────────────

export type OpportunityReport = {
  diagnosis:     Diagnosis;
  opportunities: Opportunity[];
  curve: {
    fromSiteData:      boolean;
    measuredPositions: number;
  };
  counts: Record<OpportunityKind, number>;
  /** Surfaced so the UI can caveat findings on a small sample honestly. */
  scale: {
    isEarlyStage:     boolean;
    totalImpressions: number;
    queryCount:       number;
  };
  brand: {
    detected:       boolean;
    brandedQueries: number;
    /** Percentage of impressions that are brand searches. */
    brandedShare:   number;
  };
};

/**
 * Run every analysis and return a single ranked list.
 *
 * Interleaves by score rather than grouping by kind, because the user wants
 * "what should I do next", not "here are four categories of thing".
 */
export function buildReport(input: {
  queries:      QueryRow[];
  queryPages?:  QueryPageRow[];
  previous?:    QueryRow[];
  limit?:       number;
  /** Site URL, used to derive brand tokens. Optional — without it we simply
   *  can't separate branded traffic and treat everything as non-branded. */
  siteUrl?:     string;
}): OpportunityReport {
  const { queries, queryPages = [], previous = [], limit = 25, siteUrl } = input;

  const brandTokens = siteUrl ? brandTokensFromSite(siteUrl) : [];
  const split       = splitBranded(queries, brandTokens);

  // Opportunities are computed on NON-BRANDED queries only. You already own
  // your brand — "push your own company name onto page 1" is not a strategy,
  // and including branded terms crowds out the queries that represent genuinely
  // new reach. Branded performance is reported separately in the diagnosis.
  const working      = brandTokens.length ? split.nonBranded : queries;
  const workingPages = brandTokens.length
    ? queryPages.filter(r => !isBrandedQuery(r.query, brandTokens))
    : queryPages;
  const workingPrev  = brandTokens.length
    ? previous.filter(r => !isBrandedQuery(r.query, brandTokens))
    : previous;

  const curve = buildCtrCurve(working);
  // Thresholds scale to the site so a new property still gets direction rather
  // than an empty page. See computeScale().
  const scale = computeScale(working);
  const th    = scale.thresholds;

  const all: Opportunity[] = [
    ...findStrikingDistance(working, curve, { minImpressions: th.strikingDistance }),
    ...findCtrGaps(working, curve,          { minImpressions: th.ctrGap }),
    ...findCannibalisation(workingPages,    { minImpressions: th.cannibalisation }),
    ...(workingPrev.length
      ? findDecay(working, workingPrev, { minPreviousImpressions: th.decayPrevious })
      : []),
  ];

  const counts = all.reduce((acc, o) => {
    acc[o.kind] = (acc[o.kind] ?? 0) + 1;
    return acc;
  }, {} as Record<OpportunityKind, number>);

  const ranked = all.sort((a, b) => b.score - a.score).slice(0, limit);

  return {
    diagnosis: diagnose(working, all, scale, split),
    opportunities: ranked,
    brand: {
      detected:        brandTokens.length > 0,
      brandedQueries:  split.branded.length,
      brandedShare:    Math.round(split.brandedImpressionShare * 100),
    },
    scale: {
      isEarlyStage:     scale.isEarlyStage,
      totalImpressions: scale.totalImpressions,
      queryCount:       scale.queryCount,
    },
    curve: {
      fromSiteData:      curve.fromSiteData,
      measuredPositions: curve.measuredPositions,
    },
    counts: {
      striking_distance: counts.striking_distance ?? 0,
      ctr_gap:           counts.ctr_gap           ?? 0,
      cannibalisation:   counts.cannibalisation   ?? 0,
      decay:             counts.decay             ?? 0,
    },
  };
}
