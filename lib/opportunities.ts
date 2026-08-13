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
  const minPos = opts.minPosition    ?? 11;
  const maxPos = opts.maxPosition    ?? 20;
  const minImp = opts.minImpressions ?? 50;

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
  const minPrevImp  = opts.minPreviousImpressions ?? 100;
  const minDrop     = opts.minDropRatio           ?? 0.25; // 25% down

  const prevByQuery = new Map(previous.map(r => [r.query, r]));
  const out: Opportunity[] = [];

  for (const now of current) {
    const before = prevByQuery.get(now.query);
    if (!before || before.impressions < minPrevImp) continue;

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
export function diagnose(rows: QueryRow[], opportunities: Opportunity[]): Diagnosis {
  if (rows.length === 0) {
    return {
      headline: "Not enough Search Console data yet",
      detail:   "Once your site has search impressions we can identify where the biggest gains are. This usually takes a few weeks after launch.",
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
}): OpportunityReport {
  const { queries, queryPages = [], previous = [], limit = 25 } = input;

  const curve = buildCtrCurve(queries);

  const all: Opportunity[] = [
    ...findStrikingDistance(queries, curve),
    ...findCtrGaps(queries, curve),
    ...findCannibalisation(queryPages),
    ...(previous.length ? findDecay(queries, previous) : []),
  ];

  const counts = all.reduce((acc, o) => {
    acc[o.kind] = (acc[o.kind] ?? 0) + 1;
    return acc;
  }, {} as Record<OpportunityKind, number>);

  const ranked = all.sort((a, b) => b.score - a.score).slice(0, limit);

  return {
    diagnosis: diagnose(queries, all),
    opportunities: ranked,
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
