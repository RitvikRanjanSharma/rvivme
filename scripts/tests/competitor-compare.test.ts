// scripts/tests/competitor-compare.test.ts
// =============================================================================
// Tests for lib/competitor-compare.ts. Run with scripts/test-competitors.sh.
//
// The tests that matter most here are the null ones. The bug this module was
// written to fix was not a wrong number — it was a missing number rendered as
// 0, which reads as a measurement. So most of what follows checks that an
// unknown stays unknown all the way to the formatted string.
//
// No test framework: the npm registry is unreachable from the build sandbox.
// node:assert plus the TypeScript compiler we already depend on is enough for
// pure functions.
// =============================================================================

import assert from "node:assert";
import {
  measureSite, compareSites, describeMeasure, schemaTypesIn,
  sitemapsFromRobots, toOrigin, domainOf, UNMEASURABLE,
  type SiteMeasure,
} from "../../lib/competitor-compare";
import { hostIsPublic, urlIsPublic, ssrfReason } from "../../lib/site-fetch";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try { fn(); passed++; process.stdout.write("."); }
  catch (e) { failures.push(`${name}\n    ${(e as Error).message}`); process.stdout.write("F"); }
}
const asyncTests: Array<[string, () => Promise<void>]> = [];
function testAsync(name: string, fn: () => Promise<void>) { asyncTests.push([name, fn]); }

// ─── fake network ────────────────────────────────────────────────────────────

/** Build a fetch that serves a fixed map of URL -> [status, body]. */
function fakeFetch(routes: Record<string, [number, string]>): typeof fetch {
  return (async (input: string | URL) => {
    const url = String(input);
    const hit = routes[url];
    if (!hit) return { ok: false, status: 404, url, text: async () => "" } as unknown as Response;
    const [status, body] = hit;
    return { ok: status >= 200 && status < 300, status, url, text: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
}

const PAGE = `<!doctype html><html><head>
  <title>Acme Roofing — Flat Roof Specialists in Leeds</title>
  <meta name="description" content="Flat roofing, repairs and inspections across West Yorkshire.">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme"}</script>
</head><body>
  <h1>Flat roof specialists in Leeds</h1>
  <h2>What we do</h2><p>${"word ".repeat(200)}</p>
  <h2>Areas covered</h2><p>${"more ".repeat(200)}</p>
</body></html>`;

// ─── extractors ──────────────────────────────────────────────────────────────

test("schemaTypesIn reads @type from a plain block", () => {
  assert.deepStrictEqual(schemaTypesIn(PAGE), ["Organization"]);
});

test("schemaTypesIn walks @graph and arrays", () => {
  const html = `<script type="application/ld+json">
    {"@graph":[{"@type":"Organization"},{"@type":["LocalBusiness","Roofer"]}]}</script>`;
  const t = schemaTypesIn(html).sort();
  assert.deepStrictEqual(t, ["LocalBusiness", "Organization", "Roofer"]);
});

test("malformed JSON-LD yields none rather than throwing", () => {
  // Broken JSON-LD is extremely common. A throw here would fail the whole
  // measurement of a site that is otherwise perfectly readable.
  const html = `<script type="application/ld+json">{ this is not json </script>`;
  assert.deepStrictEqual(schemaTypesIn(html), []);
});

test("sitemapsFromRobots picks up declared sitemaps", () => {
  const robots = "User-agent: *\nDisallow: /admin\nSitemap: https://x.test/sitemap.xml\n";
  assert.deepStrictEqual(sitemapsFromRobots(robots), ["https://x.test/sitemap.xml"]);
});

test("toOrigin adds a scheme and rejects non-domains", () => {
  assert.strictEqual(toOrigin("example.co.uk"), "https://example.co.uk");
  assert.strictEqual(toOrigin("https://www.example.co.uk/path"), "https://www.example.co.uk");
  assert.strictEqual(toOrigin("localhost"), null, "no dot, not a domain");
  assert.strictEqual(toOrigin(""), null);
  assert.strictEqual(toOrigin("   "), null);
});

test("domainOf strips scheme and www", () => {
  assert.strictEqual(domainOf("https://www.example.co.uk/a/b"), "example.co.uk");
});

// ─── measurement ─────────────────────────────────────────────────────────────

testAsync("a reachable site produces real figures", async () => {
  const f = fakeFetch({
    "https://acme.test": [200, PAGE],
    "https://acme.test/robots.txt": [200, "User-agent: *\nAllow: /\nSitemap: https://acme.test/sitemap.xml\n"],
    "https://acme.test/sitemap.xml": [200,
      `<urlset><url><loc>https://acme.test/</loc></url><url><loc>https://acme.test/about</loc></url></urlset>`],
  });
  const m = await measureSite("https://acme.test", f);

  assert.strictEqual(m.reachable, true);
  assert.strictEqual(m.title, "Acme Roofing — Flat Roof Specialists in Leeds");
  assert.strictEqual(m.h1, "Flat roof specialists in Leeds");
  assert.strictEqual(m.pagesInSitemap, 2, "counted from the real sitemap");
  assert.strictEqual(m.sitemapUrl, "https://acme.test/sitemap.xml");
  assert.deepStrictEqual(m.schemaTypes, ["Organization"]);
  assert.ok((m.wordCount ?? 0) > 300, "counts homepage words");
  assert.ok((m.answerScore ?? 0) > 0);
  assert.strictEqual(m.robotsKnown, true);
  assert.deepStrictEqual(m.answerBotsBlocked, []);
});

testAsync("an unreachable site yields nulls, never zeros", async () => {
  // The whole point of the module. A site we could not fetch must not report
  // "0 pages, 0 words, 0 schema types" — that is a claim about their business.
  const f = fakeFetch({});
  const m = await measureSite("https://gone.test", f);

  assert.strictEqual(m.reachable, false);
  assert.strictEqual(m.wordCount, null);
  assert.strictEqual(m.answerScore, null);
  assert.strictEqual(m.pagesInSitemap, null);
  assert.strictEqual(m.answerBotsAllowed, null);
  assert.strictEqual(m.robotsKnown, false);
});

testAsync("an unreachable robots.txt leaves crawler access unknown", async () => {
  // Distinct from a 404. A 404 means no rules exist and everything is allowed;
  // a failed request means we learned nothing. site-fetch.ts already carries
  // this lesson — this asserts it survived the copy.
  const f = fakeFetch({ "https://acme.test": [200, PAGE] });   // robots 404 -> known
  const known = await measureSite("https://acme.test", f);
  assert.strictEqual(known.robotsKnown, true, "404 robots means no rules, which is knowledge");
  assert.strictEqual(known.answerBotsAllowed, known.answerBotsTotal);

  const thrower = (async (input: string | URL) => {
    if (String(input).endsWith("/robots.txt")) throw new Error("network down");
    return { ok: true, status: 200, url: String(input), text: async () => PAGE } as unknown as Response;
  }) as unknown as typeof fetch;
  const unknown = await measureSite("https://acme.test", thrower);
  assert.strictEqual(unknown.robotsKnown, false);
  assert.strictEqual(unknown.answerBotsAllowed, null, "unknown, not 'all allowed'");
});

testAsync("a blocked answer engine is counted and named", async () => {
  const f = fakeFetch({
    "https://acme.test": [200, PAGE],
    "https://acme.test/robots.txt": [200, "User-agent: OAI-SearchBot\nDisallow: /\n"],
  });
  const m = await measureSite("https://acme.test", f);
  assert.ok(m.answerBotsBlocked.includes("OAI-SearchBot"));
  assert.strictEqual(m.answerBotsAllowed, m.answerBotsTotal - 1);
});

testAsync("a sitemap index is followed one level", async () => {
  const f = fakeFetch({
    "https://acme.test": [200, PAGE],
    "https://acme.test/robots.txt": [200, "User-agent: *\nAllow: /\n"],
    "https://acme.test/sitemap.xml": [200,
      `<sitemapindex><sitemap><loc>https://acme.test/s1.xml</loc></sitemap></sitemapindex>`],
    "https://acme.test/s1.xml": [200,
      `<urlset><url><loc>https://acme.test/a</loc></url><url><loc>https://acme.test/b</loc></url><url><loc>https://acme.test/c</loc></url></urlset>`],
  });
  const m = await measureSite("https://acme.test", f);
  assert.strictEqual(m.pagesInSitemap, 3);
});

// ─── host resolution: the apex/www problem ───────────────────────────────────

testAsync("falls back to the www sibling when the apex is unreachable", async () => {
  // The bug this fixes: useDomain() strips "www." before the page calls us, so
  // a site served from www was always asked for at its apex. A parked or
  // mis-certificated apex then produced "couldn't reach your site" about a
  // site that was plainly up — which is what happened to our own domain.
  const f = (async (input: string | URL) => {
    const url = String(input);
    if (url.startsWith("https://acme.test")) {
      throw Object.assign(new Error("nope"), { cause: { code: "ENOTFOUND" } });
    }
    if (url === "https://www.acme.test") {
      return { ok: true, status: 200, url, text: async () => PAGE } as unknown as Response;
    }
    return { ok: false, status: 404, url, text: async () => "" } as unknown as Response;
  }) as unknown as typeof fetch;

  const m = await measureSite("https://acme.test", f);
  assert.strictEqual(m.reachable, true, "www answered, so the site is reachable");
  assert.strictEqual(m.url, "https://www.acme.test", "reports the host that actually answered");
  assert.strictEqual(m.title, "Acme Roofing — Flat Roof Specialists in Leeds");
});

testAsync("a real answer stops the walk — we do not shop for a better host", async () => {
  // A 404 from the apex means that server exists and answered. Trying www
  // after a real answer would be measuring a site nobody asked about.
  let wwwTried = false;
  const f = (async (input: string | URL) => {
    const url = String(input);
    if (url.includes("www.")) { wwwTried = true; }
    return { ok: false, status: 404, url, text: async () => "" } as unknown as Response;
  }) as unknown as typeof fetch;

  const m = await measureSite("https://acme.test", f);
  assert.strictEqual(m.reachable, false);
  assert.strictEqual(wwwTried, false, "stopped at the host that answered");
  assert.ok(m.error?.includes("404"), "says what the server actually said");
});

testAsync("an unreachable site names both hosts it tried", async () => {
  // "Couldn't reach your site" with no detail is a verdict the reader can only
  // believe or ignore. Saying what was attempted makes it actionable.
  const f = (async () => {
    throw Object.assign(new Error("nope"), { cause: { code: "ENOTFOUND" } });
  }) as unknown as typeof fetch;

  const m = await measureSite("https://acme.test", f);
  assert.strictEqual(m.reachable, false);
  assert.ok(m.error?.includes("hostname"), "human-readable cause");
  assert.ok(m.error?.includes("acme.test") && m.error?.includes("www.acme.test"),
    `names both attempts, got: ${m.error}`);
});

testAsync("robots and sitemap follow the host that answered", async () => {
  // If the apex is dead and www serves the site, reading robots.txt from the
  // apex would report "no rules" — which renders as "every crawler allowed".
  const f = fakeFetch({
    "https://www.acme.test": [200, PAGE],
    "https://www.acme.test/robots.txt": [200, "User-agent: OAI-SearchBot\nDisallow: /\n"],
  });
  const m = await measureSite("https://www.acme.test", f);
  assert.strictEqual(m.robotsKnown, true);
  assert.ok(m.answerBotsBlocked.includes("OAI-SearchBot"),
    "read robots from the answering host, not a guess");
});

// ─── comparison ──────────────────────────────────────────────────────────────

function measureStub(over: Partial<SiteMeasure>): SiteMeasure {
  return {
    domain: "x.test", url: "https://x.test", reachable: true, status: 200, error: null,
    title: null, description: null, h1: null,
    wordCount: 500, schemaTypes: ["Organization"], answerScore: 60,
    pagesInSitemap: 20, sitemapUrl: "https://x.test/sitemap.xml",
    answerBotsAllowed: 3, answerBotsTotal: 3, answerBotsBlocked: [], robotsKnown: true,
    https: true, measuredAt: new Date().toISOString(),
    ...over,
  };
}

test("behind on a metric is flagged with an actionable note", () => {
  const you  = measureStub({ pagesInSitemap: 12 });
  const them = measureStub({ pagesInSitemap: 340 });
  const c = compareSites(you, them);
  const pages = c.metrics.find(m => m.key === "pagesInSitemap")!;
  assert.strictEqual(pages.verdict, "behind");
  assert.ok(pages.note?.includes("328"), "states the actual gap");
  assert.strictEqual(c.behindOn, 1);
});

test("a difference inside tolerance is level, not a win", () => {
  // Reporting a 2-point answer-score difference as "ahead" would be noise
  // dressed as a finding.
  const c = compareSites(measureStub({ answerScore: 61 }), measureStub({ answerScore: 59 }));
  assert.strictEqual(c.metrics.find(m => m.key === "answerScore")!.verdict, "level");
});

test("an unknown on either side is unknown, never a win", () => {
  const c = compareSites(measureStub({ pagesInSitemap: 40 }), measureStub({ pagesInSitemap: null }));
  const pages = c.metrics.find(m => m.key === "pagesInSitemap")!;
  assert.strictEqual(pages.verdict, "unknown", "we did not beat them, we do not know");
  assert.strictEqual(pages.themText, "—");
  assert.strictEqual(c.aheadOn, 0);
  assert.strictEqual(c.unknownOn, 1);
});

test("every null formats as an em dash, never as 0", () => {
  // The single assertion this whole module exists for.
  const dead = measureStub({
    reachable: false, wordCount: null, answerScore: null,
    pagesInSitemap: null, answerBotsAllowed: null, schemaTypes: [],
  });
  for (const row of describeMeasure(dead)) {
    assert.strictEqual(row.text, "—", `${row.key} rendered "${row.text}" instead of an em dash`);
    assert.ok(!/\b0\b/.test(row.text), `${row.key} rendered a zero`);
  }
});

test("a measured zero is distinguishable from an unknown", () => {
  // "Their sitemap lists no pages" and "we could not read their sitemap" are
  // different facts about a business and must not render the same way.
  const empty = measureStub({ pagesInSitemap: 0, schemaTypes: [] });
  const rows  = describeMeasure(empty);
  assert.strictEqual(rows.find(r => r.key === "pagesInSitemap")!.text, "0");
  assert.strictEqual(rows.find(r => r.key === "schemaTypes")!.text, "None");
});

test("the unmeasurable metrics are named with a reason", () => {
  assert.ok(UNMEASURABLE.length >= 3);
  for (const u of UNMEASURABLE) {
    assert.ok(u.label.length > 0);
    assert.ok(u.why.length > 40, `${u.label} needs a real explanation, not a label`);
  }
});

// ─── SSRF: the one shared control ────────────────────────────────────────────
//
// These live here because this module was the third caller of a check that had
// been copied twice. The copies have been folded into lib/site-fetch.ts; these
// tests are what stops the next one being written.

test("private, loopback and metadata hosts are refused", () => {
  for (const h of [
    "localhost", "app.localhost", "127.0.0.1", "0.0.0.0", "::1", "::",
    "10.1.2.3", "192.168.0.5", "172.16.0.1", "172.31.255.255",
    "169.254.169.254",              // AWS/GCP instance metadata
    "db.internal", "printer.local",
  ]) {
    assert.strictEqual(hostIsPublic(h), false, `${h} must be refused`);
  }
});

test("172.x outside the private block is public", () => {
  // 172.15 and 172.32 are ordinary public space. A prefix match on "172."
  // would wrongly refuse them, which is why the range needs arithmetic.
  assert.strictEqual(hostIsPublic("172.15.0.1"), true);
  assert.strictEqual(hostIsPublic("172.32.0.1"), true);
  assert.strictEqual(hostIsPublic("172.20.0.1"), false);
});

test("ordinary hostnames are allowed", () => {
  for (const h of ["example.co.uk", "www.acme.com", "sub.domain.example.org"]) {
    assert.strictEqual(hostIsPublic(h), true, `${h} should be allowed`);
  }
});

test("case does not defeat the check", () => {
  assert.strictEqual(hostIsPublic("LOCALHOST"), false);
  assert.strictEqual(hostIsPublic("Db.INTERNAL"), false);
});

test("non-http schemes are refused with their own reason", () => {
  // file:// and gopher:// are classic SSRF escalations, and the reason has to
  // differ from "not publicly reachable" or the UI sends the user to the
  // wrong fix.
  const r = ssrfReason("file:///etc/passwd");
  assert.ok(r && /http/i.test(r), "names the scheme problem");
  assert.notStrictEqual(r, ssrfReason("http://127.0.0.1"));
});

test("ssrfReason accepts a bare domain and a full URL alike", () => {
  assert.strictEqual(ssrfReason("example.co.uk"), null);
  assert.strictEqual(ssrfReason("https://example.co.uk/some/path"), null);
  assert.ok(ssrfReason("169.254.169.254"));
  assert.ok(ssrfReason("not a url at all"));
});

test("urlIsPublic agrees with ssrfReason", () => {
  for (const u of ["https://example.com", "http://127.0.0.1", "file:///etc/passwd", "gibberish"]) {
    assert.strictEqual(urlIsPublic(u), ssrfReason(u) === null, u);
  }
});

// ─── run ─────────────────────────────────────────────────────────────────────

(async () => {
  for (const [name, fn] of asyncTests) {
    try { await fn(); passed++; process.stdout.write("."); }
    catch (e) { failures.push(`${name}\n    ${(e as Error).message}`); process.stdout.write("F"); }
  }
  process.stdout.write("\n\n");
  if (failures.length) {
    console.log(`${failures.length} failed, ${passed} passed\n`);
    for (const f of failures) console.log("  ✗ " + f + "\n");
    process.exit(1);
  }
  console.log(`${passed} passed`);
})();
