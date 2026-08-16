// scripts/tests/crawler-view.test.ts
// =============================================================================
// Tests for lib/ai-crawler-view.ts. Run with scripts/test-crawler-view.sh.
//
// No test framework: the npm registry is unreachable from the build sandbox, so
// vitest/jest cannot be installed. node:assert plus the TypeScript compiler we
// already depend on covers this perfectly well for pure functions.
// =============================================================================

import assert from "node:assert";
import {
  visibleText, countWords, looksLikeEmptyShell, hasNoscriptWarning,
  normaliseUrl, snapshotFrom, analyse, inspectAsCrawler, looksLikeSignIn,
  CRAWLER_AGENTS, DEFAULT_AGENT,
} from "../../lib/ai-crawler-view";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void | Promise<void>) {
  try {
    const r = fn();
    if (r instanceof Promise) throw new Error("use testAsync for async cases");
    passed++; process.stdout.write(".");
  } catch (e) {
    failures.push(`${name}\n    ${(e as Error).message}`);
    process.stdout.write("F");
  }
}
const asyncTests: Array<[string, () => Promise<void>]> = [];
function testAsync(name: string, fn: () => Promise<void>) { asyncTests.push([name, fn]); }

// ─── text extraction ─────────────────────────────────────────────────────────

test("visibleText strips scripts, styles and their contents", () => {
  const html = `<html><head><style>.a{color:red}</style></head>
    <body><p>Real words here</p><script>var hidden = "should not count";</script></body></html>`;
  const t = visibleText(html);
  assert.ok(t.includes("Real words here"), "keeps body copy");
  assert.ok(!t.includes("hidden"), "drops script contents");
  assert.ok(!t.includes("color"), "drops style contents");
});

test("visibleText drops noscript and template copies", () => {
  // Both routinely carry a duplicate of the page. Counting them would hide the
  // exact failure this module exists to detect.
  const html = `<body><div id="root"></div>
    <noscript><h1>Full page copy for no-JS users</h1><p>lots and lots of words</p></noscript>
    <template><p>more hidden copy</p></template></body>`;
  const t = visibleText(html);
  assert.ok(!t.includes("Full page copy"), "noscript excluded");
  assert.ok(!t.includes("more hidden copy"), "template excluded");
});

test("visibleText decodes entities", () => {
  assert.strictEqual(visibleText("<p>Tom &amp; Jerry &#8212; fun</p>"), "Tom & Jerry — fun");
});

test("countWords handles empty and whitespace", () => {
  assert.strictEqual(countWords(""), 0);
  assert.strictEqual(countWords("   "), 0);
  assert.strictEqual(countWords("one two  three"), 3);
});

// ─── shell detection ─────────────────────────────────────────────────────────

test("looksLikeEmptyShell detects an empty mount point", () => {
  assert.strictEqual(looksLikeEmptyShell(`<body><div id="__next"></div><script src="/a.js"></script></body>`), true);
  assert.strictEqual(looksLikeEmptyShell(`<body><div id="root"></div></body>`), true);
});

test("looksLikeEmptyShell does NOT flag a server-rendered page with the same id", () => {
  // The regression this guards: presence of __next proves nothing on its own,
  // because a fully server-rendered Next.js page has it too.
  const ssr = `<body><div id="__next"><h1>Real heading</h1><p>Real content</p></div></body>`;
  assert.strictEqual(looksLikeEmptyShell(ssr), false);
});

test("hasNoscriptWarning matches only genuine warnings", () => {
  assert.strictEqual(hasNoscriptWarning(`<noscript>Please enable JavaScript to continue</noscript>`), true);
  assert.strictEqual(hasNoscriptWarning(`<noscript><img src="/pixel.gif"></noscript>`), false);
  assert.strictEqual(hasNoscriptWarning(`<body>no noscript at all</body>`), false);
});

// ─── url handling ────────────────────────────────────────────────────────────

test("normaliseUrl adds a scheme and strips the fragment", () => {
  assert.strictEqual(normaliseUrl("example.com/page"), "https://example.com/page");
  assert.strictEqual(normaliseUrl("https://example.com/a#section"), "https://example.com/a");
});

test("normaliseUrl rejects junk", () => {
  assert.strictEqual(normaliseUrl(""), null);
  assert.strictEqual(normaliseUrl("   "), null);
  assert.strictEqual(normaliseUrl("localhost"), null, "no dot, not a public host");
  assert.strictEqual(normaliseUrl("javascript:alert(1)"), null);
});

// ─── analysis ────────────────────────────────────────────────────────────────

const GOOD_HTML = `<html><head><title>Emergency plumber in Leeds</title></head><body>
  <h1>Emergency plumber in Leeds</h1>
  <p>${"We fix burst pipes across Leeds and the surrounding area. ".repeat(20)}</p>
</body></html>`;

test("healthy page is ok with an explanatory finding", () => {
  const snap = snapshotFrom(GOOD_HTML, 200, true);
  const r = analyse("https://x.test/", DEFAULT_AGENT, snap, snap);
  assert.strictEqual(r.verdict, "ok");
  assert.strictEqual(r.parity, 100);
  assert.ok(r.findings.some(f => f.rule === "readable"), "explains why it passed");
  assert.ok(!r.findings.some(f => f.severity === "error"));
});

test("403 to the crawler but 200 to a browser is an error", () => {
  const crawler = snapshotFrom("", 403, false);
  const browser = snapshotFrom(GOOD_HTML, 200, true);
  const r = analyse("https://x.test/", DEFAULT_AGENT, crawler, browser);
  assert.strictEqual(r.verdict, "invisible");
  const f = r.findings.find(x => x.rule === "blocked_to_crawler");
  assert.ok(f, "raises blocked_to_crawler");
  assert.ok(f!.message.includes("403"), "states the actual status");
  assert.ok(/WAF|Cloudflare|bot/i.test(f!.fix), "points at bot mitigation");
});

test("JS shell is detected even though the server said 200", () => {
  // The bug we shipped on our own homepage.
  const shell = snapshotFrom(
    `<html><head><title>Site</title></head><body><div id="__next"></div>${"<script src='/a.js'></script>".repeat(10)}</body></html>`,
    200, true,
  );
  const browser = snapshotFrom(GOOD_HTML, 200, true);
  const r = analyse("https://x.test/", DEFAULT_AGENT, shell, browser);
  assert.strictEqual(r.verdict, "invisible");
  assert.ok(r.findings.some(f => f.rule === "js_rendered_content"), "raises js_rendered_content");
});

test("parity gap flagged when the crawler gets materially less", () => {
  const long  = snapshotFrom(`<html><head><title>T</title></head><body><h1>H</h1><p>${"word ".repeat(400)}</p></body></html>`, 200, true);
  const short = snapshotFrom(`<html><head><title>T</title></head><body><h1>H</h1><p>${"word ".repeat(100)}</p></body></html>`, 200, true);
  const r = analyse("https://x.test/", DEFAULT_AGENT, short, long);
  assert.ok(r.findings.some(f => f.rule === "content_parity_gap"), "raises content_parity_gap");
  assert.ok(r.parity < 60, `parity ${r.parity} should be under the floor`);
});

test("equal-length pages do not trigger a parity gap", () => {
  const snap = snapshotFrom(GOOD_HTML, 200, true);
  const r = analyse("https://x.test/", DEFAULT_AGENT, snap, snap);
  assert.ok(!r.findings.some(f => f.rule === "content_parity_gap"));
});

test("both sides failing reports unreachable, not blocking", () => {
  const dead = snapshotFrom("", null, false, "the hostname could not be resolved");
  const r = analyse("https://nope.test/", DEFAULT_AGENT, dead, dead);
  assert.ok(r.findings.some(f => f.rule === "page_unreachable"), "raises page_unreachable");
  assert.ok(!r.findings.some(f => f.rule === "blocked_to_crawler"),
    "must NOT claim blocking when we never reached the server as anyone");
});

test("missing title and h1 are reported against the crawler's copy", () => {
  const noHead = snapshotFrom(`<html><body><p>${"word ".repeat(100)}</p></body></html>`, 200, true);
  const r = analyse("https://x.test/", DEFAULT_AGENT, noHead, noHead);
  assert.ok(r.findings.some(f => f.rule === "no_title_to_crawler"));
  assert.ok(r.findings.some(f => f.rule === "no_h1_to_crawler"));
});

test("every finding carries why and fix", () => {
  // The product rule: a finding that states a fact without saying why it
  // matters or what to do is an inventory entry, not advice.
  const cases = [
    analyse("https://x.test/", DEFAULT_AGENT, snapshotFrom("", 403, false), snapshotFrom(GOOD_HTML, 200, true)),
    analyse("https://x.test/", DEFAULT_AGENT, snapshotFrom(GOOD_HTML, 200, true), snapshotFrom(GOOD_HTML, 200, true)),
    analyse("https://x.test/", DEFAULT_AGENT, snapshotFrom("", null, false, "boom"), snapshotFrom("", null, false, "boom")),
  ];
  for (const r of cases) {
    for (const f of r.findings) {
      assert.ok(f.why.length  > 20, `${f.rule} needs a real why`);
      assert.ok(f.fix.length  > 20, `${f.rule} needs a real fix`);
      assert.ok(f.message.length > 10, `${f.rule} needs a message`);
    }
  }
});

test("default agent is the search bot, not the training bot", () => {
  // Auditing with GPTBot and reporting "blocked from ChatGPT" would be wrong:
  // blocking training is a legitimate choice with no effect on citation.
  assert.strictEqual(DEFAULT_AGENT, "OAI-SearchBot");
  assert.ok(CRAWLER_AGENTS["GPTBot"].note.toLowerCase().includes("training"));
});

// ─── pages that were never meant to be crawled ───────────────────────────────
// Regression tests for a false positive found on the deployed site: checking
// /dashboard reported "content is assembled by JavaScript, server-render it"
// about a login-gated, robots-disallowed page. Both the crawler and the browser
// received the SAME six words — the sign-in screen — so it was never a
// rendering problem at all.

const SIGNIN_HTML = `<html><head><title>Sign in — AI Marketing Lab</title></head><body><p>Sign in to continue</p></body></html>`;

test("a robots-disallowed page is reported as excluded, not broken", () => {
  const snap = snapshotFrom(SIGNIN_HTML, 200, true, null, "https://x.test/dashboard");
  const r = analyse("https://x.test/dashboard", DEFAULT_AGENT, snap, snap, true);
  assert.strictEqual(r.verdict, "ok", "an intentionally excluded page is not a failure");
  assert.ok(r.findings.some(f => f.rule === "excluded_by_robots"));
  assert.ok(!r.findings.some(f => f.rule === "js_rendered_content"),
    "must NOT tell the user to server-render a page no crawler will fetch");
});

test("a login redirect is reported as a login, not as a JS shell", () => {
  const snap = snapshotFrom(SIGNIN_HTML, 200, true, null, "https://x.test/auth/login");
  const r = analyse("https://x.test/dashboard", DEFAULT_AGENT, snap, snap, false);
  assert.strictEqual(r.verdict, "ok");
  assert.ok(r.findings.some(f => f.rule === "requires_sign_in"));
  assert.ok(!r.findings.some(f => f.rule === "js_rendered_content"));
});

test("looksLikeSignIn does not fire on an auth page requested directly", () => {
  // Asking "what does the crawler see on my login page" should report on the
  // login page, not announce that it redirected to itself.
  const snap = snapshotFrom(SIGNIN_HTML, 200, true, null, "https://x.test/auth/login");
  assert.strictEqual(looksLikeSignIn(snap, "https://x.test/auth/login"), false);
});

test("a genuine JS shell is still caught when robots permits it", () => {
  // The suppression must not swallow the real bug it was built to find.
  const shell = snapshotFrom(
    `<html><head><title>Site</title></head><body><div id="__next"></div>${"<script src='/a.js'></script>".repeat(10)}</body></html>`,
    200, true, null, "https://x.test/",
  );
  const r = analyse("https://x.test/", DEFAULT_AGENT, shell, snapshotFrom(GOOD_HTML, 200, true), false);
  assert.strictEqual(r.verdict, "invisible");
  assert.ok(r.findings.some(f => f.rule === "js_rendered_content"));
});

// ─── end to end with a fake fetcher ──────────────────────────────────────────

testAsync("inspectAsCrawler distinguishes the two user agents", async () => {
  const seen: string[] = [];
  const fake = (async (_url: string, init?: RequestInit) => {
    const ua = String((init?.headers as Record<string, string>)?.["User-Agent"] ?? "");
    seen.push(ua);
    const isBot = /OAI-SearchBot/i.test(ua);
    return {
      ok: !isBot,
      status: isBot ? 403 : 200,
      text: async () => (isBot ? "" : GOOD_HTML),
    } as unknown as Response;
  }) as unknown as typeof fetch;

  const r = await inspectAsCrawler("https://x.test/", "OAI-SearchBot", fake);
  assert.strictEqual(seen.length, 2, "fetches twice");
  assert.ok(/OAI-SearchBot/.test(seen[0]), "crawler request first");
  assert.ok(/Chrome/.test(seen[1]), "browser request second");
  assert.strictEqual(r.verdict, "invisible");
  assert.ok(r.findings.some(f => f.rule === "blocked_to_crawler"));
});

testAsync("inspectAsCrawler falls back to the default for an unknown agent", async () => {
  const fake = (async () => ({ ok: true, status: 200, text: async () => GOOD_HTML }) as unknown as Response) as unknown as typeof fetch;
  const r = await inspectAsCrawler("https://x.test/", "NotARealBot", fake);
  assert.strictEqual(r.agent, DEFAULT_AGENT);
});

testAsync("a thrown fetch is reported, not crashed on", async () => {
  const fake = (async () => { throw Object.assign(new Error("nope"), { cause: { code: "ENOTFOUND" } }); }) as unknown as typeof fetch;
  const r = await inspectAsCrawler("https://x.test/", DEFAULT_AGENT, fake);
  assert.ok(r.findings.some(f => f.rule === "page_unreachable"));
  assert.ok(r.crawler.error?.includes("hostname"), "surfaces a human-readable cause");
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
