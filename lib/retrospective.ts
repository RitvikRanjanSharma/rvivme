// lib/retrospective.ts
// =============================================================================
// AI Marketing Lab — "did it work?"
//
// Takes the baseline captured when a strategy was activated, compares it with
// where things stand now, and returns a verdict with its reasoning.
//
// This is the feature that makes the product compound: every dashboard shows
// current state, almost none say "here is what happened to the last thing you
// did, and whether it worked". Accumulated over months it becomes evidence
// about *this* site specifically, which is the thing a strategist actually
// trades on.
//
// Two principles run through the whole module:
//
//   1. Time honesty. SEO moves slowly. Declaring failure at two weeks is worse
//      than saying nothing, because it prompts people to abandon work that was
//      going to succeed. Below a sensible threshold the verdict is "too early"
//      and that is a complete answer.
//
//   2. Effort honesty. If the checklist was never worked, the strategy wasn't
//      tested — it was ignored. Reporting "didn't work" would blame the plan
//      for something that never happened.
//
// Pure functions. No fetching, no React.
// =============================================================================

export type BaselineGsc = {
  avgPosition: number;
  clicks:      number;
  impressions?: number;
  ctr:         number;
};

export type CurrentGscSnapshot = {
  avgPosition:  number;
  clicks:       number;
  impressions?: number;
  ctr:          number;
  /** Current position per tracked keyword, where GSC reports one. */
  keywordPos?:  Record<string, number>;
};

export type TrackedKeyword = {
  keyword:     string;
  baselinePos: number | null;
};

export type Verdict =
  | "too_early"      // not enough time has passed to judge
  | "not_started"    // the work wasn't done, so nothing was tested
  | "working"        // clear movement in the right direction
  | "mixed"          // some movement, not yet decisive
  | "stalled"        // enough time, enough work, no movement
  | "declining";     // actively worse

export type Recommendation = "hold" | "continue" | "adjust" | "stop" | "wait";

export type KeywordMovement = {
  keyword:     string;
  baselinePos: number;
  currentPos:  number | null;
  /** Negative = improved (moved up the page). */
  delta:       number | null;
  status:      "improved" | "declined" | "unchanged" | "not_ranking";
};

export type Retrospective = {
  verdict:        Verdict;
  recommendation: Recommendation;
  headline:       string;
  narrative:      string;
  /** Plain-language facts, same contract as Opportunity.evidence. */
  evidence:       string[];
  daysElapsed:    number;
  movements:      KeywordMovement[];
  summary: {
    improved:     number;
    declined:     number;
    unchanged:    number;
    notRanking:   number;
    clicksDelta:  number | null;
    positionDelta: number | null;   // negative = better
  };
};

// ─── thresholds ──────────────────────────────────────────────────────────────

const TIMING = {
  /** Below this, nothing meaningful can be concluded about SEO work. */
  tooEarlyDays: 21,
  /** Below this we can see direction but shouldn't be firm about it. */
  provisionalDays: 45,
};

/** Position changes smaller than this are noise, not movement. */
const POSITION_NOISE = 1.0;

// ─── keyword movement ────────────────────────────────────────────────────────

export function computeMovements(
  keywords: TrackedKeyword[],
  current:  CurrentGscSnapshot | null,
): KeywordMovement[] {
  return keywords
    .filter(k => k.baselinePos != null)
    .map(k => {
      const baselinePos = k.baselinePos as number;
      const currentPos  = current?.keywordPos?.[k.keyword] ?? null;

      if (currentPos == null) {
        return {
          keyword: k.keyword,
          baselinePos,
          currentPos: null,
          delta: null,
          // Distinct from "declined": we genuinely don't know where it sits,
          // because Search Console only reports queries that got impressions.
          status: "not_ranking" as const,
        };
      }

      const delta = currentPos - baselinePos;   // negative = better
      const status =
        Math.abs(delta) < POSITION_NOISE ? ("unchanged" as const)
        : delta < 0                      ? ("improved"  as const)
        :                                  ("declined"  as const);

      return { keyword: k.keyword, baselinePos, currentPos, delta, status };
    })
    // Biggest improvements first — that's what the user wants to see.
    .sort((a, b) => (a.delta ?? 999) - (b.delta ?? 999));
}

// ─── the verdict ─────────────────────────────────────────────────────────────

export function buildRetrospective(input: {
  activatedAt:      string | Date;
  baseline:         BaselineGsc | null;
  current:          CurrentGscSnapshot | null;
  keywords:         TrackedKeyword[];
  checklistTotal:   number;
  checklistDone:    number;
  strategyTitle?:   string;
  now?:             Date;
}): Retrospective {
  const {
    activatedAt, baseline, current, keywords,
    checklistTotal, checklistDone, strategyTitle, now = new Date(),
  } = input;

  const activated   = new Date(activatedAt);
  const daysElapsed = Math.max(0, Math.floor((now.getTime() - activated.getTime()) / 86_400_000));

  const movements = computeMovements(keywords, current);
  const summary = {
    improved:   movements.filter(m => m.status === "improved").length,
    declined:   movements.filter(m => m.status === "declined").length,
    unchanged:  movements.filter(m => m.status === "unchanged").length,
    notRanking: movements.filter(m => m.status === "not_ranking").length,
    clicksDelta:   baseline && current ? current.clicks - baseline.clicks : null,
    positionDelta: baseline && current
      ? Number((current.avgPosition - baseline.avgPosition).toFixed(2))
      : null,
  };

  const checklistPct = checklistTotal ? checklistDone / checklistTotal : 0;
  const label = strategyTitle ? `"${strategyTitle}"` : "this strategy";

  // ── 1. Too early ──────────────────────────────────────────────────────────
  // Checked first and unconditionally. Whatever the numbers say at day 9, they
  // don't mean anything yet, and pretending otherwise is the most common way
  // these tools mislead people.
  if (daysElapsed < TIMING.tooEarlyDays) {
    return {
      verdict: "too_early",
      recommendation: "wait",
      headline: `Too early to judge ${label}`,
      narrative:
        `Only ${daysElapsed} ${daysElapsed === 1 ? "day has" : "days have"} passed since you activated this. ` +
        `Search rankings typically take three to six weeks to respond to on-page work, and longer for anything depending on links or authority. ` +
        `Any movement you see now is more likely to be normal fluctuation than a result. ` +
        `Come back after day ${TIMING.tooEarlyDays} — the honest answer today is that we don't know yet.`,
      evidence: [
        `Activated ${daysElapsed} ${daysElapsed === 1 ? "day" : "days"} ago.`,
        checklistTotal > 0
          ? `${checklistDone} of ${checklistTotal} checklist items complete — keep working through them.`
          : `No checklist items recorded for this strategy.`,
      ],
      daysElapsed, movements, summary,
    };
  }

  // ── 2. Not actually attempted ─────────────────────────────────────────────
  // Distinguishing "the plan failed" from "the plan was never executed" is the
  // difference between useful feedback and unfair blame.
  if (checklistTotal > 0 && checklistPct < 0.25) {
    return {
      verdict: "not_started",
      recommendation: "adjust",
      headline: `${label} hasn't really been tried yet`,
      narrative:
        `${daysElapsed} days in, but only ${checklistDone} of ${checklistTotal} actions are done. ` +
        `There's no result to assess here — the plan hasn't been tested, it's been parked. ` +
        `Either commit to the remaining actions, or replace this with something smaller you'll actually finish. ` +
        `A strategy you don't execute is worse than no strategy, because it occupies the slot.`,
      evidence: [
        `${checklistDone} of ${checklistTotal} checklist items complete (${Math.round(checklistPct * 100)}%).`,
        `${daysElapsed} days since activation.`,
        `Ranking movement is not meaningful when the work behind it hasn't happened.`,
      ],
      daysElapsed, movements, summary,
    };
  }

  // ── 3. Judge the movement ─────────────────────────────────────────────────
  if (!baseline || !current) {
    return {
      verdict: "mixed",
      recommendation: "continue",
      headline: `Can't measure ${label} yet`,
      narrative:
        `No baseline snapshot was captured when this strategy was activated, so there's nothing to compare against. ` +
        `Future strategies will record one automatically. For now, judge this on the checklist and your own read of the numbers.`,
      evidence: [
        baseline ? `Current performance data is unavailable.` : `No baseline was recorded at activation.`,
        `${checklistDone} of ${checklistTotal} checklist items complete.`,
      ],
      daysElapsed, movements, summary,
    };
  }

  const positionDelta = summary.positionDelta ?? 0;   // negative = better
  const clicksDelta   = summary.clicksDelta   ?? 0;
  const provisional   = daysElapsed < TIMING.provisionalDays;

  const evidence: string[] = [
    `${daysElapsed} days since activation, with ${checklistDone} of ${checklistTotal} actions complete.`,
    positionDelta < -POSITION_NOISE
      ? `Average position improved from ${baseline.avgPosition.toFixed(1)} to ${current.avgPosition.toFixed(1)} — up ${Math.abs(positionDelta).toFixed(1)} places.`
      : positionDelta > POSITION_NOISE
      ? `Average position worsened from ${baseline.avgPosition.toFixed(1)} to ${current.avgPosition.toFixed(1)} — down ${positionDelta.toFixed(1)} places.`
      : `Average position essentially unchanged (${baseline.avgPosition.toFixed(1)} → ${current.avgPosition.toFixed(1)}).`,
    clicksDelta !== 0
      ? `Clicks ${clicksDelta > 0 ? "up" : "down"} ${Math.abs(clicksDelta)} versus baseline (${baseline.clicks} → ${current.clicks}).`
      : `Clicks unchanged at ${current.clicks}.`,
  ];

  if (movements.length) {
    evidence.push(
      `Of ${movements.length} tracked keywords: ${summary.improved} improved, ${summary.declined} declined, ${summary.unchanged} unchanged` +
      (summary.notRanking ? `, ${summary.notRanking} not currently ranking.` : "."),
    );
  }

  // Declining — the clearest signal, and the one worth acting on fastest.
  if (positionDelta > POSITION_NOISE * 2 || (clicksDelta < 0 && positionDelta > POSITION_NOISE)) {
    return {
      verdict: "declining",
      recommendation: "adjust",
      headline: `${label} is going the wrong way`,
      narrative:
        `Positions have slipped since you started, not improved. ` +
        `That usually means one of three things: a competitor has moved on these terms, the changes made things worse, or something unrelated is dragging the site down. ` +
        `Work out which before doing more of the same — continuing a strategy that's losing ground compounds the loss.`,
      evidence, daysElapsed, movements, summary,
    };
  }

  // Working — improvement in position, or clicks up without position loss.
  if (positionDelta < -POSITION_NOISE || (clicksDelta > 0 && positionDelta <= POSITION_NOISE)) {
    return {
      verdict: "working",
      recommendation: provisional ? "hold" : "continue",
      headline: provisional
        ? `${label} is moving in the right direction`
        : `${label} is working`,
      narrative: provisional
        ? `Early but positive. ${summary.improved} of ${movements.length || "your"} tracked keywords have improved and the overall trend is up. ` +
          `It's still inside the window where rankings wobble, so don't change anything yet — hold the course and reassess after day ${TIMING.provisionalDays}.`
        : `${daysElapsed} days in, the movement is real rather than noise. ` +
          `${summary.improved} keywords improved${clicksDelta > 0 ? ` and clicks are up ${clicksDelta}` : ""}. ` +
          `This is worth continuing, and worth understanding — whatever produced this is the thing to repeat on the next strategy.`,
      evidence, daysElapsed, movements, summary,
    };
  }

  // Stalled — time spent, work done, nothing moved.
  if (daysElapsed >= TIMING.provisionalDays && checklistPct >= 0.7) {
    return {
      verdict: "stalled",
      recommendation: "stop",
      headline: `${label} hasn't moved the needle`,
      narrative:
        `${daysElapsed} days, ${Math.round(checklistPct * 100)}% of the actions done, and positions are essentially where they started. ` +
        `The work happened; it just didn't produce a result. That's useful information — it usually means the constraint is somewhere other than where this strategy was aimed, most often authority rather than on-page factors. ` +
        `Rather than pushing further here, it's worth switching to a different lever.`,
      evidence, daysElapsed, movements, summary,
    };
  }

  return {
    verdict: "mixed",
    recommendation: "continue",
    headline: `${label} is showing mixed results`,
    narrative:
      `${daysElapsed} days in with ${Math.round(checklistPct * 100)}% of actions complete. ` +
      `${summary.improved} keywords improved and ${summary.declined} declined, so there's movement but no clear direction yet. ` +
      `Finish the remaining actions before drawing a conclusion — a partially executed strategy produces exactly this kind of ambiguous picture.`,
    evidence, daysElapsed, movements, summary,
  };
}
