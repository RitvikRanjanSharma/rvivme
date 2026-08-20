// lib/forecast.ts
// =============================================================================
// AI Marketing Lab — projecting traffic, and refusing to when we can't
//
// WHAT WAS WRONG
//
// The dashboard drew a six-month projection from whatever GA4 returned, even
// when that was a single month, and labelled it:
//
//     LIVE · AI FORECAST v1.0 · 90% CONFIDENCE
//
// Three separate problems, and the third is the one that matters.
//
// 1. WITH ONE DATA POINT THERE IS NO GROWTH RATE.
//    growthRates is derived from consecutive months, so a single month gives
//    an empty list, and the code fell back to `1.05` — a hardcoded 5% monthly
//    growth assumption. The chart then showed six months of compounding
//    growth that came from a constant in our source code, presented as a
//    projection of the customer's traffic.
//
// 2. THE CONFIDENCE FORMULA RAN BACKWARDS.
//        confidence = max(60, min(92, 92 - months * 2))
//    One month scored 90%. Twelve months scored 68%. More evidence produced
//    less confidence — the opposite of how evidence works. The number was
//    doing the job of looking authoritative, not of measuring anything.
//
// 3. A NUMBER LABELLED "CONFIDENCE" IS A PROMISE.
//    Everything else in this product was made honest: unknowns render as an
//    em dash, samples are labelled as samples, competitor metrics were cut
//    rather than estimated. A 90% confidence claim on a line drawn through one
//    point was the last thing left that a customer could reasonably call a
//    lie — and the one most likely to be quoted back in a meeting.
//
// WHAT IT DOES NOW
//
// Below MIN_MONTHS we do not project at all. The chart shows what was
// measured and the panel says how many more months it needs. A forecast that
// isn't ready is not an emergency; presenting one that isn't ready is.
//
// Above it, confidence is computed from two things that actually bear on
// whether a projection will hold: how much history there is, and how steady
// the growth has been. It is capped well below certainty, because a six-month
// projection from a handful of months is never a safe bet, and no arrangement
// of arithmetic makes it one.
// =============================================================================

/**
 * Consecutive months needed before we will draw a line forward.
 *
 * Three months gives two growth rates — the minimum from which "steady" and
 * "erratic" can be told apart at all. Two months gives one rate, which cannot
 * be distinguished from noise; one gives none.
 */
export const MIN_MONTHS = 3;

/** No projection is ever presented above this. See the note on honesty above. */
export const MAX_CONFIDENCE = 80;

export type MonthPoint = { month: string; actual: number | null };

export type Projection = {
  /** Whether there is enough history to project at all. */
  ready:          boolean;
  monthsUsed:     number;
  monthsNeeded:   number;
  /** Populated only when ready. */
  points:         Array<{ month: string; forecast: number; lower: number; upper: number }>;
  forecast6M:     number | null;
  growthPct:      number | null;
  /** 0-100, or null when not ready. Never a number when we aren't projecting. */
  confidence:     number | null;
  /** Monthly multiplier actually used, for display and for tests. */
  monthlyRate:    number | null;
  /** Plain-English reason, shown when ready is false. */
  reason:         string | null;
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * Coefficient of variation of the month-on-month growth rates.
 *
 * The right volatility measure here because it is scale-free: a site going
 * 100 → 110 → 121 and one going 10,000 → 11,000 → 12,100 are equally steady,
 * and a standard deviation would call the second one wildly more volatile.
 */
export function growthVolatility(rates: number[]): number {
  if (rates.length < 2) return 1;
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  if (mean === 0) return 1;
  const variance = rates.reduce((a, r) => a + (r - mean) ** 2, 0) / rates.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

/**
 * How much to trust a projection, 0-100.
 *
 * Rises with history and falls with volatility — both in the direction a
 * reader would expect, which the previous formula did not manage for either.
 */
export function confidenceFrom(months: number, volatility: number): number {
  if (months < MIN_MONTHS) return 0;

  // Evidence: 3 months is thin, 12+ is as good as this model gets.
  const evidence = Math.min(1, (months - MIN_MONTHS) / (12 - MIN_MONTHS));

  // Steadiness: a CV at or above 0.5 means the growth rate is all over the
  // place and the trend line is close to meaningless.
  const steadiness = Math.max(0, 1 - volatility / 0.5);

  // Floor of 35 rather than 0: we would not be projecting at all if there were
  // no signal, so the low end should read as "weak", not as "broken".
  const score = 35 + (MAX_CONFIDENCE - 35) * (0.45 * evidence + 0.55 * steadiness);
  return Math.round(Math.max(35, Math.min(MAX_CONFIDENCE, score)));
}

/**
 * Project six months forward, or explain why we won't.
 *
 * `history` is oldest-first and may contain nulls, which are skipped rather
 * than counted as zero months — a gap in GA4 is not a month of no traffic.
 */
export function project(history: MonthPoint[], now = new Date()): Projection {
  const values = history.map(h => h.actual).filter((v): v is number => v != null && v > 0);

  if (values.length < MIN_MONTHS) {
    const need = MIN_MONTHS - values.length;
    return {
      ready: false,
      monthsUsed: values.length,
      monthsNeeded: MIN_MONTHS,
      points: [], forecast6M: null, growthPct: null, confidence: null, monthlyRate: null,
      reason: values.length === 0
        ? "No monthly traffic recorded yet, so there is nothing to project from."
        : `A projection needs at least ${MIN_MONTHS} months of history to tell a trend from noise. ${values.length === 1 ? "There is 1 month" : `There are ${values.length} months`} so far — about ${need} more month${need === 1 ? "" : "s"} to go.`,
    };
  }

  const last  = values[values.length - 1];
  const rates = values.slice(1).map((v, i) => v / Math.max(values[i], 1));

  // Geometric mean is the correct average for a multiplicative series: it
  // recovers the constant rate that would produce the same total change.
  const geoMean = Math.pow(rates.reduce((a, b) => a * b, 1), 1 / rates.length);

  // Clamped because an unclamped rate from a small sample produces absurdity —
  // one good month becomes 400% growth compounded six times.
  const monthlyRate = Math.max(0.97, Math.min(1.30, geoMean));

  const volatility = growthVolatility(rates);
  const confidence = confidenceFrom(values.length, volatility);

  const points = Array.from({ length: 6 }, (_, i) => {
    const d  = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    const fv = Math.round(last * Math.pow(monthlyRate, i + 1));
    // The band widens with distance AND with how shaky the trend is. A flat
    // band on a volatile series is the visual version of the old 90% claim.
    const spread = (0.06 + i * 0.04) * (1 + volatility);
    return {
      month: MONTH_NAMES[d.getMonth()],
      forecast: fv,
      lower: Math.round(fv * (1 - Math.min(0.6, spread))),
      upper: Math.round(fv * (1 + Math.min(0.6, spread))),
    };
  });

  const forecast6M = points[5].forecast;

  return {
    ready: true,
    monthsUsed: values.length,
    monthsNeeded: MIN_MONTHS,
    points,
    forecast6M,
    growthPct: Math.round(((forecast6M - last) / Math.max(last, 1)) * 100),
    confidence,
    monthlyRate,
    reason: null,
  };
}

/** How to describe a confidence score without implying more than it means. */
export function confidenceLabel(confidence: number): string {
  if (confidence >= 70) return "steady trend, several months of history";
  if (confidence >= 55) return "reasonable trend, limited history";
  return "early estimate — treat as a direction, not a number";
}
