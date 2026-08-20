// scripts/tests/forecast-gap.test.ts
// =============================================================================
// Tests for lib/forecast.ts and lib/content-gap.ts.
// Run with scripts/test-forecast-gap.sh.
//
// The forecast tests are mostly about refusal: the bug was not a wrong number,
// it was a confident number produced from nothing. So the assertions that
// matter are the ones checking we decline to answer.
// =============================================================================

import assert from "node:assert";
import {
  project, confidenceFrom, growthVolatility, confidenceLabel,
  MIN_MONTHS, MAX_CONFIDENCE, type MonthPoint,
} from "../../lib/forecast";
import {
  topicTerms, coverage, assessPages, buildGapReport, brandWordsFor, COVERED_AT,
} from "../../lib/content-gap";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try { fn(); passed++; process.stdout.write("."); }
  catch (e) { failures.push(`${name}\n    ${(e as Error).message}`); process.stdout.write("F"); }
}

const months = (...vals: Array<number | null>): MonthPoint[] =>
  vals.map((v, i) => ({ month: `M${i}`, actual: v }));

// ─── forecast: refusing to guess ─────────────────────────────────────────────

test("one month produces no projection at all", () => {
  // The original bug. One point, no growth rate, a hardcoded 1.05 fallback,
  // and a 90% confidence label on top of it.
  const p = project(months(1000));
  assert.strictEqual(p.ready, false);
  assert.strictEqual(p.confidence, null, "no confidence number when not projecting");
  assert.strictEqual(p.forecast6M, null);
  assert.strictEqual(p.monthlyRate, null, "no fallback growth rate leaks out");
  assert.deepStrictEqual(p.points, []);
  assert.ok(p.reason?.includes("1 month"));
});

test("zero months says so without arithmetic", () => {
  const p = project([]);
  assert.strictEqual(p.ready, false);
  assert.strictEqual(p.monthsUsed, 0);
  assert.ok(p.reason?.toLowerCase().includes("nothing to project"));
});

test("nulls are skipped, not counted as zero months", () => {
  // A gap in GA4 reporting is missing data, not a month of no traffic.
  const p = project(months(1000, null, 1100, null, 1200));
  assert.strictEqual(p.monthsUsed, 3);
  assert.strictEqual(p.ready, true);
});

test("exactly the minimum is enough, one below is not", () => {
  assert.strictEqual(project(months(100, 110)).ready, false);
  assert.strictEqual(project(months(100, 110, 121)).ready, true);
  assert.strictEqual(MIN_MONTHS, 3);
});

// ─── forecast: confidence behaves like evidence ──────────────────────────────

test("more history raises confidence", () => {
  // The old formula did the opposite: 92 - months * 2.
  const steady = (n: number) => project(months(...Array.from({ length: n }, (_, i) => Math.round(1000 * 1.1 ** i))));
  const three  = steady(3).confidence!;
  const twelve = steady(12).confidence!;
  assert.ok(twelve > three, `12 months (${twelve}) should beat 3 months (${three})`);
});

test("erratic growth lowers confidence", () => {
  const steady  = project(months(1000, 1100, 1210, 1331, 1464, 1610));
  const jumpy   = project(months(1000, 300, 2400, 500, 2900, 700));
  assert.ok(steady.confidence! > jumpy.confidence!,
    `steady (${steady.confidence}) should beat erratic (${jumpy.confidence})`);
});

test("confidence never claims certainty", () => {
  const long = project(months(...Array.from({ length: 36 }, () => 1000)));
  assert.ok(long.confidence! <= MAX_CONFIDENCE, "capped");
  assert.strictEqual(MAX_CONFIDENCE, 80);
});

test("confidenceFrom is monotonic in both inputs", () => {
  assert.ok(confidenceFrom(12, 0.05) > confidenceFrom(4, 0.05), "more months, more confidence");
  assert.ok(confidenceFrom(8, 0.05) > confidenceFrom(8, 0.40), "less volatility, more confidence");
  assert.strictEqual(confidenceFrom(2, 0.0), 0, "below the minimum there is no score");
});

test("volatility is scale-free", () => {
  // A small site and a large one growing identically must score the same.
  const small = growthVolatility([1.1, 1.1, 1.1]);
  const noisy = growthVolatility([0.5, 2.0, 0.7]);
  assert.ok(small < 0.01, "constant growth is not volatile");
  assert.ok(noisy > small);
  assert.strictEqual(growthVolatility([1.1]), 1, "one rate tells us nothing");
});

test("the growth rate stays inside sane bounds", () => {
  const explosive = project(months(10, 1000, 100000, 10000000));
  assert.ok(explosive.monthlyRate! <= 1.30, "a lucky month is not 400% forever");
  const collapsing = project(months(10000, 100, 1, 1));
  assert.ok(collapsing.monthlyRate! >= 0.97);
});

test("the band widens with distance and with volatility", () => {
  const p = project(months(1000, 1100, 1210, 1331));
  const first = p.points[0], last = p.points[5];
  assert.ok((last.upper - last.lower) > (first.upper - first.lower), "widens over time");

  // Compared as a PROPORTION of the forecast, not in absolute sessions. The
  // volatile series here also trends downward, so its absolute band is smaller
  // simply because the numbers are smaller — an absolute comparison would
  // measure magnitude and call it uncertainty.
  const jumpy = project(months(1000, 400, 1800, 600));
  const rel = (p: { upper: number; lower: number; forecast: number }) =>
    (p.upper - p.lower) / p.forecast;
  assert.ok(rel(jumpy.points[0]) > rel(first),
    `unsteady band ${rel(jumpy.points[0]).toFixed(3)} should exceed steady ${rel(first).toFixed(3)}`);
});

test("confidenceLabel never oversells", () => {
  assert.ok(!confidenceLabel(40).includes("steady"));
  assert.ok(confidenceLabel(40).toLowerCase().includes("early"));
});

// ─── content gap ─────────────────────────────────────────────────────────────

test("topicTerms drops stopwords, brand words and duplicates", () => {
  const t = topicTerms("The Best Flat Roof Repairs in Leeds | Acme Roofing", ["acme"]);
  assert.ok(!t.includes("the") && !t.includes("best"), "stopwords gone");
  assert.ok(!t.includes("acme"), "brand word gone");
  assert.ok(t.includes("flat") && t.includes("roof") && t.includes("leed"));
});

test("singular and plural are the same topic", () => {
  assert.deepStrictEqual(topicTerms("roofing services"), topicTerms("roofing service"));
});

test("coverage is measured against the page, not the query", () => {
  // "roofing" shares 100% of ITSELF with the page, but covers only a fraction
  // of what the page is about — and it's the page's subject we're asking about.
  const page = ["emergency", "flat", "roof", "repair", "leed"];
  assert.ok(coverage(page, ["roof"]) < 0.5, "a one-word query does not cover a five-word subject");
  assert.ok(coverage(page, page) === 1);
  assert.strictEqual(coverage([], ["anything"]), 0, "no terms, no coverage");
});

test("a page you appear for is covered, and says which query", () => {
  const pages = [{ url: "https://x.test/flat-roof-repairs", title: "Flat Roof Repairs", h1: null }];
  const r = assessPages(pages, [{ term: "flat roof repairs", impressions: 400 }]);
  assert.strictEqual(r[0].verdict, "covered");
  assert.strictEqual(r[0].matchedQuery, "flat roof repairs");
  assert.ok(r[0].overlap >= COVERED_AT);
});

test("a page you appear for nothing near is a gap", () => {
  const pages = [{ url: "https://x.test/green-roof-grants", title: "Green Roof Grant Funding Guide", h1: null }];
  const r = assessPages(pages, [{ term: "gutter cleaning", impressions: 90 }]);
  assert.strictEqual(r[0].verdict, "gap");
  assert.strictEqual(r[0].matchedQuery, undefined, "no query is claimed as a match");
});

test("a brand-only title is unclear, never a gap", () => {
  // "Home | Acme" carries no subject. Calling it a gap would send someone off
  // to write a duplicate homepage.
  const pages = [{ url: "https://acme.test/", title: "Home | Acme", h1: null }];
  const r = assessPages(pages, [{ term: "roofing", impressions: 10 }], ["acme"]);
  assert.strictEqual(r[0].verdict, "unclear");
  assert.deepStrictEqual(r[0].terms, []);
});

test("themes need to recur; one-offs are not a commitment", () => {
  const pages = [
    { url: "u1", title: "Solar Panel Installation Costs", h1: null },
    { url: "u2", title: "Solar Panel Maintenance", h1: null },
    { url: "u3", title: "Chimney Repointing", h1: null },
  ];
  const report = buildGapReport(assessPages(pages, [{ term: "gutter cleaning", impressions: 5 }]));
  const terms = report.themes.map(t => t.term);
  assert.ok(terms.includes("solar"), "appears on two pages");
  assert.ok(!terms.includes("chimney"), "appears on one page only");
});

test("gaps are ordered with the widest first", () => {
  const pages = [
    { url: "near", title: "Gutter Cleaning Prices Leeds", h1: null },
    { url: "far",  title: "Heritage Slate Conservation Grants", h1: null },
  ];
  const report = buildGapReport(assessPages(pages, [{ term: "gutter cleaning", impressions: 50 }]));
  assert.strictEqual(report.gaps[0].url, "far", "the subject you're nowhere near comes first");
});

test("brandWordsFor drops TLDs and keeps the name", () => {
  const w = brandWordsFor("acme-roofing.co.uk", "https://www.example.com");
  assert.ok(w.includes("acme") && w.includes("roofing"));
  assert.ok(!w.includes("co") && !w.includes("uk") && !w.includes("com"));
});

// ─── run ─────────────────────────────────────────────────────────────────────

process.stdout.write("\n\n");
if (failures.length) {
  console.log(`${failures.length} failed, ${passed} passed\n`);
  for (const f of failures) console.log("  ✗ " + f + "\n");
  process.exit(1);
}
console.log(`${passed} passed`);
