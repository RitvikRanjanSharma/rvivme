// lib/ai-crawler-view.ts
// =============================================================================
// AI Marketing Lab — what an answer engine actually receives
//
// THE QUESTION THIS ANSWERS
//
// Every other AEO check in this product asks "is your content shaped well?".
// This one asks something more basic that almost nobody checks: does the
// content reach the engine at all?
//
// Three ways it silently doesn't, in increasing order of how often we see it:
//
//   1. The server refuses the bot. A WAF, Cloudflare rule or hosting default
//      returns 403 to GPTBot while serving humans perfectly. robots.txt says
//      "allowed", so a robots-only audit reports green while the crawler is
//      being turned away at the door.
//
//   2. The server serves the bot something different. Sometimes deliberate
//      (paywall, geo-fence), sometimes an accident of caching or bot
//      mitigation. Either way the engine is reading a page the owner has
//      never seen.
//
//   3. The page is a JavaScript shell. The HTML contains a nearly empty root
//      element and a script bundle. Browsers run the bundle and the page
//      appears; crawlers do not, and receive almost no words.
//
// We hit (3) on our own homepage: the canvas headline meant a crawler saw
// eighteen words. It looked perfect to us in every browser. That is the whole
// argument for this module — the failure is invisible from the inside.
//
// HOW IT WORKS WITHOUT A HEADLESS BROWSER
//
// We fetch the same URL twice: once as an AI crawler, once with an ordinary
// browser User-Agent. Comparing the two responses is what makes cases 1 and 2
// detectable at all, and it needs no rendering engine.
//
// We deliberately do NOT run headless Chrome to produce the "human" side. It
// would be slow, expensive per user, and — the point that matters — it is not
// what we are measuring. The crawler's view IS the raw HTML. Rendering the
// other side only tells us how big the gap is, and the structural markers
// below establish that far more cheaply.
//
// HONESTY ABOUT WHAT WE CAN CLAIM
//
// A crawler's real behaviour is its own business: it may render JS, it may
// have its own timeouts, it may cache. What we can state as fact is what the
// server sent in reply to that User-Agent. Everything downstream is phrased as
// what the engine RECEIVES, never as "you are not cited because of this".
// =============================================================================

import { describeFetchError, type Fetcher } from "@/lib/site-fetch";

// ─── What we send ────────────────────────────────────────────────────────────

/**
 * OAI-SearchBot rather than GPTBot is the default, and the distinction is the
 * whole reason this list exists rather than one hardcoded string.
 *
 * GPTBot feeds model TRAINING. Blocking it is a defensible editorial choice
 * and has no effect on whether ChatGPT can cite you today. OAI-SearchBot is
 * what fetches pages for ChatGPT's live search results — block that and you
 * are removed from the answers. Auditing with GPTBot and reporting "you're
 * blocked from ChatGPT" would be wrong in the way that matters, because the
 * owner might have blocked training entirely on purpose.
 */
export const CRAWLER_AGENTS: Record<string, { ua: string; label: string; note: string }> = {
  "OAI-SearchBot": {
    ua:    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
    label: "ChatGPT (search)",
    note:  "Fetches pages for ChatGPT's live answers. This is the one that decides whether ChatGPT can cite you.",
  },
  "GPTBot": {
    ua:    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot",
    label: "GPTBot (training)",
    note:  "Feeds OpenAI model training. Blocking it is a legitimate choice and does not remove you from ChatGPT answers.",
  },
  "PerplexityBot": {
    ua:    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot",
    label: "Perplexity",
    note:  "Perplexity cites sources heavily, so reachability here is unusually valuable.",
  },
  "ClaudeBot": {
    ua:    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ClaudeBot/1.0; +claudebot@anthropic.com",
    label: "Claude",
    note:  "Anthropic's crawler.",
  },
  "Google-Extended": {
    ua:    "Mozilla/5.0 (compatible; Google-Extended/1.0; +http://www.google.com/bot.html)",
    label: "Gemini (training)",
    note:  "Controls Gemini training only. It does not affect Google Search or AI Overviews.",
  },
};

export const DEFAULT_AGENT = "OAI-SearchBot";

/** A mainstream desktop browser, as the control. */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

const TIMEOUT_MS = 10_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export type Snapshot = {
  ok:         boolean;
  status:     number | null;
  /** Populated only when the request failed outright. */
  error:      string | null;
  html:       string;
  /** Visible words, script/style/nav stripped. */
  text:       string;
  wordCount:  number;
  title:      string | null;
  h1:         string | null;
  /** Bytes of HTML, useful for spotting a shell vs a full document. */
  bytes:      number;
  /**
   * Where the request actually ended up after redirects.
   *
   * Without this we cannot tell "this page is broken" from "this page sent us
   * to the login screen", and those need opposite advice.
   */
  finalUrl:   string | null;
};

export type ViewSeverity = "error" | "warning" | "notice" | "ok";

export type ViewFinding = {
  rule:     string;
  severity: ViewSeverity;
  /** One sentence, plain English, stating what happens. */
  message:  string;
  /** Why it matters — the consequence, not a restatement. */
  why:      string;
  /** What to do about it. */
  fix:      string;
};

export type CrawlerViewResult = {
  url:       string;
  agent:     string;
  agentLabel: string;
  crawler:   Snapshot;
  browser:   Snapshot;
  findings:  ViewFinding[];
  /**
   * invisible — the engine gets essentially nothing
   * degraded  — it gets markedly less than a browser
   * ok        — parity
   */
  verdict:   "invisible" | "degraded" | "ok";
  /** 0-100. Share of the browser's words the crawler actually receives. */
  parity:    number;
};

// ─── HTML → text ─────────────────────────────────────────────────────────────

export function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * Visible text only.
 *
 * <template> and <noscript> are stripped along with script/style because both
 * routinely carry a full copy of the page that no engine treats as content —
 * counting them would mask the exact failure we are looking for.
 */
export function visibleText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped).replace(/\s+/g, " ").trim();
}

export function countWords(text: string): number {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m?.[1] ? decodeEntities(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : null;
}

export function snapshotFrom(
  html: string, status: number | null, ok: boolean,
  error: string | null = null, finalUrl: string | null = null,
): Snapshot {
  const text = visibleText(html);
  return {
    ok, status, error, html,
    text,
    wordCount: countWords(text),
    title: firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    h1:    firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
    bytes: html.length,
    finalUrl,
  };
}

// ─── Fetching ────────────────────────────────────────────────────────────────

async function fetchAs(url: string, ua: string, fetcher: Fetcher): Promise<Snapshot> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetcher(url, {
      headers: {
        "User-Agent": ua,
        // Sent because a real crawler sends them. Some bot-mitigation rules key
        // on a missing Accept header rather than on the UA string, and omitting
        // them would make us look less like a crawler than the thing we are
        // impersonating — producing a false pass.
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
      },
      signal:   controller.signal,
      redirect: "follow",
    });
    const html = await res.text().catch(() => "");
    // res.url is the URL after redirects — the difference between "broken" and
    // "sent to the sign-in page".
    return snapshotFrom(html, res.status, res.ok, null, res.url || url);
  } catch (err) {
    return {
      ok: false, status: null, error: describeFetchError(err),
      html: "", text: "", wordCount: 0, title: null, h1: null, bytes: 0,
      finalUrl: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Shell detection ─────────────────────────────────────────────────────────

/**
 * Markers of a client-rendered page: a mount point that is empty in the
 * source. Presence alone proves nothing — a fully server-rendered Next.js page
 * also has __next — so we check the element is EMPTY.
 */
const MOUNT_POINTS = [
  /<div[^>]+id=["']__next["'][^>]*>\s*<\/div>/i,
  /<div[^>]+id=["']root["'][^>]*>\s*<\/div>/i,
  /<div[^>]+id=["']app["'][^>]*>\s*<\/div>/i,
  /<body[^>]*>\s*<div[^>]*>\s*<\/div>\s*<script/i,
];

export function looksLikeEmptyShell(html: string): boolean {
  return MOUNT_POINTS.some(re => re.test(html));
}

/** A page that tells the reader to turn JavaScript on is admitting the problem. */
export function hasNoscriptWarning(html: string): boolean {
  const m = html.match(/<noscript[^>]*>([\s\S]*?)<\/noscript>/i);
  if (!m) return false;
  return /enable\s+javascript|requires\s+javascript|javascript\s+(is\s+)?(required|disabled)/i.test(m[1]);
}

// ─── Analysis ────────────────────────────────────────────────────────────────

/** Below this, a page has no substantive content to quote. */
const MIN_USEFUL_WORDS = 50;
/** Crawler text below this share of the browser's is a real gap, not noise. */
const PARITY_FLOOR = 0.6;

/**
 * Did this request end up on a sign-in page?
 *
 * Checked on the FINAL url and the title, not the body, because a login page
 * is short by nature and would otherwise be indistinguishable from a broken
 * one on word count alone.
 */
export function looksLikeSignIn(snap: Snapshot, requestedUrl: string): boolean {
  const AUTH = /\/(auth|login|signin|sign-in|account\/login)(\/|$|\?)/i;
  try {
    const requestedPath = new URL(requestedUrl).pathname;
    // Already an auth page — landing on one is the correct outcome, not a
    // redirect worth reporting.
    if (AUTH.test(requestedPath)) return false;
  } catch { /* fall through */ }

  if (snap.finalUrl) {
    try {
      if (AUTH.test(new URL(snap.finalUrl).pathname)) return true;
    } catch { /* fall through */ }
  }
  return /\bsign in\b|\bsign-in\b|\blog in\b|\blogin\b/i.test(snap.title ?? "");
}

export function analyse(
  url: string,
  agent: string,
  crawler: Snapshot,
  browser: Snapshot,
  /**
   * Whether robots.txt disallows this path for this crawler. Optional so the
   * pure function stays testable without a network.
   */
  disallowedByRobots = false,
): CrawlerViewResult {
  const findings: ViewFinding[] = [];
  const agentLabel = CRAWLER_AGENTS[agent]?.label ?? agent;

  const parity = browser.wordCount > 0
    ? Math.round(Math.min(1, crawler.wordCount / browser.wordCount) * 100)
    : crawler.wordCount > 0 ? 100 : 0;

  // ── 1. Refused outright ────────────────────────────────────────────────────
  if (!crawler.ok && browser.ok) {
    findings.push({
      rule: "blocked_to_crawler",
      severity: "error",
      message: crawler.status
        ? `Your server returns ${crawler.status} to ${agentLabel} but ${browser.status} to a browser.`
        : `Your server refused ${agentLabel} (${crawler.error}) but answered a browser normally.`,
      why: "The page is being turned away before robots.txt is even consulted, so a permissive robots.txt is misleading you. To this engine the page does not exist, and nothing else on this report can help until it does.",
      fix: "This is almost always a bot-mitigation rule rather than a deliberate choice — check your WAF, Cloudflare Bot Fight Mode, or host's default bot filtering, and allow the answer-engine user agents you want citing you.",
    });
  }

  // ── 2. Both failed ─────────────────────────────────────────────────────────
  if (!crawler.ok && !browser.ok) {
    findings.push({
      rule: "page_unreachable",
      severity: "error",
      message: crawler.status
        ? `The page returned ${crawler.status} to both a crawler and a browser.`
        : `The page could not be fetched at all — ${crawler.error ?? "the request failed"}.`,
      why: "We could not read the page as anyone, so this is a availability problem rather than an answer-engine one. No crawler can cite a URL that does not respond.",
      fix: "Check the URL is correct and publicly reachable, that the certificate matches the hostname, and that the origin is not rate-limiting automated requests.",
    });
  }

  // ── 2b. The page is not meant to be crawled at all ─────────────────────────
  //
  // This runs BEFORE the content checks and suppresses them, because reporting
  // "server-render your content" about a page robots.txt already excludes is
  // advice for a problem that does not exist. It sent a user to look at their
  // rendering setup when nothing was wrong.
  const signIn = crawler.ok && looksLikeSignIn(crawler, url);

  if (disallowedByRobots || signIn) {
    if (disallowedByRobots) {
      findings.push({
        rule: "excluded_by_robots",
        severity: "notice",
        message: `Your robots.txt tells ${agentLabel} not to fetch this page.`,
        why: "No answer engine will read it, so nothing else about this page affects your visibility. If the exclusion is deliberate — an app screen, an account area — this is working as intended.",
        fix: "Nothing to do unless you expected this page to be citable. If you did, remove the matching Disallow rule from robots.txt.",
      });
    }
    if (signIn) {
      findings.push({
        rule: "requires_sign_in",
        severity: "notice",
        message: "This URL returns a sign-in page rather than content.",
        why: "The page is behind a login, so a crawler receives the sign-in screen — which is the correct behaviour for a private page, not a fault. Whatever is behind the login was never going to be citable.",
        fix: "Nothing to fix. To test how your public pages read to an answer engine, check one that does not require an account.",
      });
    }

    return {
      url, agent, agentLabel, crawler, browser, findings,
      // Not "invisible": that word means something is wrong. A private page not
      // being readable by ChatGPT is the system working.
      verdict: "ok",
      parity,
    };
  }

  if (crawler.ok) {
    // ── 3. Empty shell ───────────────────────────────────────────────────────
    const shell = looksLikeEmptyShell(crawler.html);
    if (shell || (crawler.wordCount < MIN_USEFUL_WORDS && crawler.bytes > 1000)) {
      findings.push({
        rule: "js_rendered_content",
        severity: "error",
        message: `${agentLabel} receives ${crawler.wordCount} word${crawler.wordCount === 1 ? "" : "s"} of text${shell ? " and an empty page container" : ""}.`,
        why: "The content is assembled by JavaScript in the browser. Answer engines read the HTML the server sends and mostly do not run that JavaScript, so there is nothing for them to quote — the page looks finished to you and blank to them.",
        fix: "Server-render the main content, or pre-render it at build time. The text a reader is meant to see should be present in the raw HTML before any script executes.",
      });
    } else if (crawler.wordCount < MIN_USEFUL_WORDS) {
      findings.push({
        rule: "thin_to_crawler",
        severity: "warning",
        message: `Only ${crawler.wordCount} words reach ${agentLabel}.`,
        why: "There is too little substance for an engine to extract an answer from, so the page is unlikely to be cited even where it is technically readable.",
        fix: "Expand the page to answer, in plain text, the question a visitor arrived with.",
      });
    }

    // ── 4. Parity gap ────────────────────────────────────────────────────────
    if (browser.ok && browser.wordCount >= MIN_USEFUL_WORDS && parity < PARITY_FLOOR * 100) {
      findings.push({
        rule: "content_parity_gap",
        severity: "warning",
        message: `${agentLabel} receives about ${parity}% of the text a browser receives (${crawler.wordCount} words versus ${browser.wordCount}).`,
        why: "The server is sending materially different content depending on who asks. Whether that is deliberate or a side effect of caching or bot mitigation, the engine is forming its impression of this page from something you have never seen.",
        fix: "Compare the two outputs below. If the difference is not intentional, look at bot-mitigation rules and any user-agent-dependent caching or personalisation.",
      });
    }

    // ── 5. Structural essentials, as the crawler sees them ───────────────────
    if (!crawler.title) {
      findings.push({
        rule: "no_title_to_crawler",
        severity: "error",
        message: `No <title> in the HTML sent to ${agentLabel}.`,
        why: "The title is the strongest single signal of what a page is about, and it is what an engine displays when attributing a citation.",
        fix: "Add a title to the server-rendered HTML rather than setting it client-side.",
      });
    }
    if (!crawler.h1) {
      findings.push({
        rule: "no_h1_to_crawler",
        severity: "warning",
        message: `No <h1> in the HTML sent to ${agentLabel}.`,
        why: "Answer engines lean on heading structure to decide which part of a page answers a question. With no h1 there is no stated subject to match against.",
        fix: "Add a single h1 stating the page's subject, server-rendered.",
      });
    }
    if (hasNoscriptWarning(crawler.html)) {
      findings.push({
        rule: "noscript_warning",
        severity: "notice",
        message: "The page carries a \"please enable JavaScript\" message.",
        why: "That message is written for humans, but a crawler may be the only party that ever reads it — it is a strong hint that the real content is unavailable without scripting.",
        fix: "Treat this as confirmation to server-render the main content.",
      });
    }
  }

  // ── verdict ────────────────────────────────────────────────────────────────
  let verdict: CrawlerViewResult["verdict"] = "ok";
  if (findings.some(f => f.severity === "error")) verdict = "invisible";
  else if (findings.some(f => f.severity === "warning")) verdict = "degraded";

  if (verdict === "ok" && crawler.ok) {
    findings.push({
      rule: "readable",
      severity: "ok",
      message: `${agentLabel} receives the same page a browser does — ${crawler.wordCount} words, title and heading intact.`,
      why: "Reachability is the precondition for everything else in answer-engine visibility, and this page clears it.",
      fix: "Nothing to fix here. Whether you get cited now depends on how the content is written, which the answer-readiness score covers.",
    });
  }

  return { url, agent, agentLabel, crawler, browser, findings, verdict, parity };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export function normaliseUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    // Strip the fragment — servers never see it, so keeping it would imply we
    // checked something we did not.
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Fetch as crawler and as browser, then compare.
 *
 * Sequential rather than parallel on purpose: two simultaneous requests from
 * one IP to the same URL is exactly the shape bot-mitigation reacts to, and
 * tripping it ourselves would manufacture the very block we are testing for.
 */
export async function inspectAsCrawler(
  url: string,
  agent: string = DEFAULT_AGENT,
  fetcher: Fetcher = fetch,
  disallowedByRobots = false,
): Promise<CrawlerViewResult> {
  const spec = CRAWLER_AGENTS[agent] ?? CRAWLER_AGENTS[DEFAULT_AGENT];
  const crawler = await fetchAs(url, spec.ua, fetcher);
  const browser = await fetchAs(url, BROWSER_UA, fetcher);
  return analyse(
    url,
    agent in CRAWLER_AGENTS ? agent : DEFAULT_AGENT,
    crawler, browser, disallowedByRobots,
  );
}
