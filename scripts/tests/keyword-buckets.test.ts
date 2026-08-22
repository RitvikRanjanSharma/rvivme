// scripts/tests/keyword-buckets.test.ts
// =============================================================================
// Tests for lib/keyword-buckets.ts. Run with scripts/test-buckets.sh.
//
// The assertions that matter are about PRECEDENCE and about what we refuse to
// claim. A classifier that quietly disagrees with lib/opportunities.ts, or that
// reports "0 impressions" for a term Search Console never mentioned, would be
// the same class of failure this codebase has spent its life removing.
// =============================================================================

import assert from "node:assert";
import {
  classifyKeywords, looksLikeMismatch, competitorTokensFrom, BUCKETS,
  type Bucket, type WatchRow,
} from "../../lib/keyword-buckets";
import type { Opportunity, QueryRow } from "../../lib/opportunities";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try { fn(); passed++; process.stdout.write("."); }
  catch (e) { failures.push(`${name}\n    ${(e as Error).message}`); process.stdout.write("F"); }
}

const q = (query: string, over: Partial<QueryRow> = {}): QueryRow => ({
  query, clicks: 0, impressions: 100, ctr: 0, position: 15, ...over,
});

const opp = (query: string, kind: Opportunity["kind"], over: Partial<Opportunity> = {}): Opportunity => ({
  kind, query, title: `${kind} for ${query}`, score: 50,
  clickUpside: null, effort: "low", confidence: "high", evidence: [], ...over,
} as Opportunity);

const run = (over: Partial<Parameters<typeof classifyKeywords>[0]> = {}) =>
  classifyKeywords({
    queries: [], opportunities: [], watchlist: [],
    brandTokens: [], competitorTokens: [], ...over,
  });

const bucketOf = (r: ReturnType<typeof run>, term: string): Bucket | undefined =>
  r.keywords.find(k => k.term === term)?.bucket;

// ─── precedence ──────────────────────────────────────────────────────────────

test("an Opportunity decides the bucket, not the position rule", () => {
  // Position 15 would fall to "striking" by the positional rule. The engine
  // says ctr_gap, and it has the site's own CTR curve; we do not.
  const r = run({
    queries:       [q("flat roof repair", { position: 15 })],
    opportunities: [opp("flat roof repair", "ctr_gap")],
  });
  assert.strictEqual(bucketOf(r, "flat roof repair"), "ctr_gap");
  assert.strictEqual(r.basis.fromOpportunity, 1);
});

test("the highest-scoring opportunity wins when a query has several", () => {
  const r = run({
    queries: [q("roofing leeds")],
    opportunities: [
      opp("roofing leeds", "ctr_gap", { score: 20 }),
      opp("roofing leeds", "decay",   { score: 80 }),
    ],
  });
  assert.strictEqual(bucketOf(r, "roofing leeds"), "slipping");
});

test("brand beats everything, including a winning position", () => {
  // Otherwise a company's own name lands in "winning" and flatters the whole
  // picture — you were always going to rank for it.
  const r = run({
    queries:       [q("acme roofing", { position: 1, clicks: 40 })],
    opportunities: [opp("acme roofing", "striking_distance", { score: 99 })],
    brandTokens:   ["acme"],
  });
  assert.strictEqual(bucketOf(r, "acme roofing"), "brand");
});

test("a mismatch outranks the positional rule but not an Opportunity", () => {
  // A job search sitting at position 2 is not a win worth defending...
  const asJob = run({ queries: [q("roofing jobs leeds", { position: 2, clicks: 5 })] });
  assert.strictEqual(bucketOf(asJob, "roofing jobs leeds"), "mismatch");

  // ...but if the engine produced a finding, the engine knows more than a
  // word list does.
  const withOpp = run({
    queries:       [q("roofing jobs leeds", { position: 2, clicks: 5 })],
    opportunities: [opp("roofing jobs leeds", "ctr_gap")],
  });
  assert.strictEqual(bucketOf(withOpp, "roofing jobs leeds"), "ctr_gap");
});

test("foundation opportunities do not place a keyword in a bucket", () => {
  // Foundational advice is about the site, not about one keyword.
  const r = run({
    queries:       [q("flat roofing", { position: 8 })],
    opportunities: [opp("flat roofing", "foundation", { score: 90 })],
  });
  assert.strictEqual(bucketOf(r, "flat roofing"), "striking", "falls through to the positional rule");
});

// ─── positional fallback ─────────────────────────────────────────────────────

test("top three with clicks is winning; top three without is not", () => {
  const won = run({ queries: [q("a", { position: 2, clicks: 9 })] });
  assert.strictEqual(bucketOf(won, "a"), "winning");

  // Position 2 and nobody clicking is a CTR problem, not a victory.
  const none = run({ queries: [q("b", { position: 2, clicks: 0 })] });
  assert.notStrictEqual(bucketOf(none, "b"), "winning");
});

test("positions 4-20 are striking, beyond that is watching", () => {
  assert.strictEqual(bucketOf(run({ queries: [q("c", { position: 4 })] }), "c"), "striking");
  assert.strictEqual(bucketOf(run({ queries: [q("d", { position: 20 })] }), "d"), "striking");
  assert.strictEqual(bucketOf(run({ queries: [q("e", { position: 21 })] }), "e"), "watching");
});

test("a fallback striking verdict admits it is low confidence", () => {
  // The engine passed it over, usually for too few impressions. Saying so is
  // the difference between a finding and a guess wearing a finding's clothes.
  const r = run({ queries: [q("f", { position: 9, impressions: 12 })] });
  assert.strictEqual(r.keywords[0].confidence, "low");
  assert.strictEqual(r.keywords[0].opportunityScore, null);
});

// ─── the no-presence bucket ──────────────────────────────────────────────────

const gapRow = (keyword: string): WatchRow =>
  ({ keyword, source: "gap", notes: "Appears on 4 of rival.com's pages." });

test("a watched gap term with no impressions is no_presence", () => {
  const r = run({ queries: [], watchlist: [gapRow("green roof grants")] });
  assert.strictEqual(bucketOf(r, "green roof grants"), "no_presence");
  assert.ok(r.keywords[0].why.includes("rival.com"), "carries the evidence from the gap analysis");
});

test("no_presence reports nulls, never zeros", () => {
  // "No impressions recorded" and "zero people saw you" are the same number
  // and different claims. Only one of them is ours to make from an absent row.
  const r = run({ watchlist: [gapRow("slate conservation")] });
  const k = r.keywords[0];
  assert.strictEqual(k.impressions, null);
  assert.strictEqual(k.clicks, null);
  assert.strictEqual(k.position, null);
  assert.strictEqual(k.ctr, null);
});

test("a watched term that DOES have impressions is classified on its data", () => {
  const r = run({
    queries:   [q("green roof grants", { position: 6, impressions: 400 })],
    watchlist: [gapRow("green roof grants")],
  });
  assert.strictEqual(bucketOf(r, "green roof grants"), "striking");
  assert.strictEqual(r.keywords[0].watched, true, "still flagged as watched");
});

test("watchlist matching ignores case and stray whitespace", () => {
  const r = run({
    queries:   [q("Roofing Leeds", { position: 7 })],
    watchlist: [{ keyword: "  roofing leeds ", source: "manual", notes: null }],
  });
  assert.strictEqual(r.keywords.length, 1, "not counted twice");
  assert.strictEqual(r.keywords[0].watched, true);
});

test("a non-gap watchlist term with no data is watching, not no_presence", () => {
  // We only claim "no presence" when a competitor demonstrably covers it.
  // A term someone typed in is just untested.
  const r = run({ watchlist: [{ keyword: "some idea", source: "manual", notes: null }] });
  assert.strictEqual(bucketOf(r, "some idea"), "watching");
});

// ─── mismatch detection ──────────────────────────────────────────────────────

test("non-buyer markers are matched as whole words", () => {
  assert.ok(looksLikeMismatch("roofing jobs near me", []));
  assert.ok(looksLikeMismatch("what is a purlin definition", []));
  // "jobs" inside another word must not fire.
  assert.strictEqual(looksLikeMismatch("jobsworth roofing supplies", []), null);
});

test("free quote is not confused with salary", () => {
  // The reason the marker list is kept short: over-matching eats real intent.
  assert.strictEqual(looksLikeMismatch("free roofing quote leeds", []), null);
});

test("a tracked competitor's brand name is flagged, with the reason", () => {
  const why = looksLikeMismatch("rankai pricing", ["rankai"]);
  assert.ok(why?.includes("rankai"));
  assert.ok(why?.toLowerCase().includes("converts poorly"));
});

test("short competitor tokens are ignored", () => {
  // Matching "ai" or "co" against every query would classify half a site's
  // traffic as somebody else's brand.
  assert.deepStrictEqual(competitorTokensFrom(["rank.ai"]), ["rank"]);
  assert.deepStrictEqual(competitorTokensFrom(["acme-roofing.co.uk"]).sort(), ["acme", "roofing"]);
  assert.strictEqual(looksLikeMismatch("ai marketing", ["ai"]), null);
});

// ─── report shape ────────────────────────────────────────────────────────────

test("counts cover every bucket, including the empty ones", () => {
  const r = run({ queries: [q("x", { position: 2, clicks: 3 })] });
  assert.strictEqual(Object.keys(r.counts).length, Object.keys(BUCKETS).length);
  assert.strictEqual(r.counts.winning, 1);
  assert.strictEqual(r.counts.no_presence, 0);
});

test("output is ordered by bucket, then by opportunity score", () => {
  const r = run({
    queries: [
      q("win",  { position: 1, clicks: 5 }),
      q("near", { position: 8 }),
      q("weak", { position: 9 }),
    ],
    opportunities: [
      opp("near", "striking_distance", { score: 90 }),
      opp("weak", "striking_distance", { score: 10 }),
    ],
  });
  assert.deepStrictEqual(r.keywords.map(k => k.term), ["near", "weak", "win"]);
});

test("every bucket carries a meaning and an action", () => {
  for (const [name, meta] of Object.entries(BUCKETS)) {
    assert.ok(meta.meaning.length > 40, `${name} needs a real explanation`);
    assert.ok(meta.action.length > 20, `${name} needs to say what to do`);
  }
});

process.stdout.write("\n\n");
if (failures.length) {
  console.log(`${failures.length} failed, ${passed} passed\n`);
  for (const f of failures) console.log("  ✗ " + f + "\n");
  process.exit(1);
}
console.log(`${passed} passed`);
