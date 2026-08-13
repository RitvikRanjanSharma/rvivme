// lib/ai-crawlers.ts
// =============================================================================
// AI Marketing Lab — answer-engine visibility
//
// Answers a question no free tool answers today: are the AI answer engines
// allowed to read your site, and is your content shaped so they can extract
// from it?
//
// A NOTE ON WHAT'S POSSIBLE. Crawlers don't run JavaScript, so a client-side
// snippet can never observe them — any tool claiming to track AI bots via a
// JS tag is measuring nothing. Real observation requires server-side logs.
// What we CAN do without any installation on the customer's part:
//
//   1. Read their robots.txt and determine, per crawler, whether it's allowed.
//      This catches the single most common GEO failure: sites blocking AI
//      crawlers by accident, usually via a broad Disallow or a copied robots
//      file, and wondering why they never get cited.
//
//   2. Fetch pages and score how extractable the content is — whether an
//      answer engine could lift a clean answer from it.
//
// Both are real, prescriptive, and cost nothing. Log-based observation is a
// separate feature requiring a proxy on the customer's own server.
//
// Pure functions. No fetching here — callers supply the text.
// =============================================================================

// ─── the crawlers ────────────────────────────────────────────────────────────

export type CrawlerPurpose = "answers" | "training" | "search";

export type AiCrawler = {
  /** Token as it appears in robots.txt User-agent lines. */
  token:   string;
  name:    string;
  operator: string;
  purpose: CrawlerPurpose;
  /** Why a site owner might care about this one specifically. */
  note:    string;
};

/**
 * Crawlers that matter for answer-engine visibility, as of mid-2026.
 *
 * Purpose matters more than it looks. "answers" bots fetch pages to build a
 * live response with citations — blocking those directly costs you visibility.
 * "training" bots feed model training, where the trade-off is genuinely
 * debatable and some sites block them deliberately. We report the two
 * differently rather than treating every block as a mistake.
 */
export const AI_CRAWLERS: AiCrawler[] = [
  {
    token: "GPTBot", name: "GPTBot", operator: "OpenAI", purpose: "training",
    note: "Feeds OpenAI model training. Blocking is a legitimate choice; it doesn't stop ChatGPT citing you live.",
  },
  {
    token: "OAI-SearchBot", name: "OAI-SearchBot", operator: "OpenAI", purpose: "answers",
    note: "Powers ChatGPT search results. Blocking this removes you from ChatGPT's answers.",
  },
  {
    token: "ChatGPT-User", name: "ChatGPT-User", operator: "OpenAI", purpose: "answers",
    note: "Fetches a page when a user asks ChatGPT about a specific URL.",
  },
  {
    token: "ClaudeBot", name: "ClaudeBot", operator: "Anthropic", purpose: "training",
    note: "Anthropic's general crawler.",
  },
  {
    token: "Claude-SearchBot", name: "Claude-SearchBot", operator: "Anthropic", purpose: "answers",
    note: "Used when Claude searches the web to answer a question.",
  },
  {
    token: "PerplexityBot", name: "PerplexityBot", operator: "Perplexity", purpose: "answers",
    note: "Perplexity cites sources heavily — this is one of the highest-value crawlers to allow.",
  },
  {
    token: "Google-Extended", name: "Google-Extended", operator: "Google", purpose: "training",
    note: "Controls Gemini training only. It does NOT affect Google Search ranking or AI Overviews.",
  },
  {
    token: "Applebot-Extended", name: "Applebot-Extended", operator: "Apple", purpose: "training",
    note: "Apple Intelligence training.",
  },
  {
    token: "CCBot", name: "CCBot", operator: "Common Crawl", purpose: "training",
    note: "Common Crawl feeds many downstream datasets and models.",
  },
  {
    token: "Bytespider", name: "Bytespider", operator: "ByteDance", purpose: "training",
    note: "Widely blocked for ignoring crawl-rate norms.",
  },
];

// ─── robots.txt ──────────────────────────────────────────────────────────────

export type RobotsGroup = {
  agents: string[];
  allow:  string[];
  disallow: string[];
};

/**
 * Parse robots.txt into user-agent groups.
 *
 * Consecutive User-agent lines share the rules that follow — that's the actual
 * spec and a very common source of misreading. A blank line or a rule line
 * closes the agent list for a group.
 */
export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let collectingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    // Strip comments and trim.
    const line = rawLine.split("#")[0].trim();
    if (!line) { collectingAgents = false; continue; }

    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!collectingAgents || !current) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
        collectingAgents = true;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (!current) continue;
    collectingAgents = false;

    if (field === "allow")    current.allow.push(value);
    if (field === "disallow") current.disallow.push(value);
  }

  return groups;
}

export type CrawlerAccess = {
  crawler:  AiCrawler;
  /** "allowed" | "blocked" | "partial" — partial means some paths are blocked. */
  status:   "allowed" | "blocked" | "partial";
  /** Which group decided it: the crawler's own rules, or the wildcard. */
  matchedBy: "specific" | "wildcard" | "default";
  /** The rule that produced a block, for evidence. */
  rule?:    string;
};

/**
 * Decide whether a crawler may fetch a given path.
 *
 * Follows the real precedence rules: a group naming the crawler explicitly wins
 * over the `*` group entirely — the wildcard is NOT merged in. That's the part
 * people most often get wrong when reading their own robots.txt, and it changes
 * the answer completely.
 */
export function crawlerAccess(
  groups: RobotsGroup[],
  crawler: AiCrawler,
  path = "/",
): CrawlerAccess {
  const token = crawler.token.toLowerCase();

  const specific = groups.find(g => g.agents.includes(token));
  const wildcard = groups.find(g => g.agents.includes("*"));
  const group    = specific ?? wildcard;

  if (!group) {
    // No robots.txt rules at all means everything is permitted.
    return { crawler, status: "allowed", matchedBy: "default" };
  }

  const matchedBy = specific ? "specific" as const : "wildcard" as const;

  // "Disallow:" with an empty value explicitly permits everything.
  const realDisallows = group.disallow.filter(d => d !== "");

  const blocksEverything = realDisallows.some(d => d === "/");
  if (blocksEverything) {
    // An Allow rule can carve an exception out of a total block.
    const hasCarveOut = group.allow.some(a => a && a !== "/");
    return {
      crawler,
      status: hasCarveOut ? "partial" : "blocked",
      matchedBy,
      rule: "Disallow: /",
    };
  }

  const blockingRule = realDisallows.find(d => path.startsWith(d));
  if (blockingRule) {
    return { crawler, status: "blocked", matchedBy, rule: `Disallow: ${blockingRule}` };
  }

  return {
    crawler,
    status: realDisallows.length ? "partial" : "allowed",
    matchedBy,
    rule: realDisallows.length ? `Disallow: ${realDisallows[0]}` : undefined,
  };
}

export function auditCrawlerAccess(robotsText: string, path = "/"): CrawlerAccess[] {
  const groups = parseRobots(robotsText);
  return AI_CRAWLERS.map(c => crawlerAccess(groups, c, path));
}

// ─── answer readiness ────────────────────────────────────────────────────────

export type ReadinessCheck = {
  id:      string;
  label:   string;
  passed:  boolean;
  /** Why this matters for answer engines specifically. */
  why:     string;
  detail?: string;
  weight:  number;
};

export type ReadinessReport = {
  score:  number;          // 0-100
  checks: ReadinessCheck[];
};

/** Rough visible-text extraction — enough for structural checks. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Score how easily an answer engine could extract a usable answer.
 *
 * These aren't generic SEO checks — each targets something specific about how
 * retrieval-augmented systems chunk and quote pages. They favour content that
 * answers directly and early, is structurally segmented, and carries machine-
 * readable context.
 */
export function scoreAnswerReadiness(html: string, url?: string): ReadinessReport {
  const text   = visibleText(html);
  const words  = text ? text.split(/\s+/).length : 0;
  const checks: ReadinessCheck[] = [];

  // 1. Content actually present in the HTML (not JS-rendered).
  checks.push({
    id: "server_rendered",
    label: "Content is in the HTML",
    passed: words >= 150,
    why: "Answer engines read raw HTML and do not execute JavaScript. Content that only appears after a client-side render is invisible to them, no matter how it looks in a browser.",
    detail: `${words} words found in the served HTML.`,
    weight: 3,
  });

  // 2. Single clear H1.
  const h1s = html.match(/<h1[^>]*>/gi) ?? [];
  checks.push({
    id: "single_h1",
    label: "Exactly one H1",
    passed: h1s.length === 1,
    why: "The H1 tells a retrieval system what the page is fundamentally about. None leaves it guessing; several make the topic ambiguous.",
    detail: h1s.length === 0 ? "No H1 found." : `${h1s.length} H1 tags found.`,
    weight: 2,
  });

  // 3. Heading structure to chunk on.
  const h2s = html.match(/<h2[^>]*>/gi) ?? [];
  checks.push({
    id: "heading_structure",
    label: "Sub-headings break up the content",
    passed: h2s.length >= 2,
    why: "Answer engines chunk pages at heading boundaries. A wall of text gets chunked arbitrarily and quoted badly; clear H2s produce clean, quotable segments.",
    detail: `${h2s.length} H2 headings.`,
    weight: 2,
  });

  // 4. Structured data.
  const hasJsonLd = /<script[^>]+application\/ld\+json/i.test(html);
  checks.push({
    id: "structured_data",
    label: "Schema.org structured data",
    passed: hasJsonLd,
    why: "JSON-LD states facts unambiguously — who wrote this, when, what it's about — instead of leaving them to be inferred from prose.",
    detail: hasJsonLd ? "JSON-LD present." : "No JSON-LD found.",
    weight: 2,
  });

  // 5. Meta description as a ready-made summary.
  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1];
  checks.push({
    id: "meta_description",
    label: "Meta description present",
    passed: Boolean(metaDesc && metaDesc.length >= 50),
    why: "Often lifted verbatim as a summary. A missing or thin one means the engine writes its own, from whatever it happens to chunk first.",
    detail: metaDesc ? `${metaDesc.length} characters.` : "Missing.",
    weight: 1,
  });

  // 6. Answer-first structure — is there prose near the top, before the fold
  //    of navigation and hero furniture?
  const firstParagraph = html.match(/<p[^>]*>([\s\S]{40,}?)<\/p>/i)?.[1];
  const firstPlain     = firstParagraph ? visibleText(firstParagraph) : "";
  checks.push({
    id: "answer_first",
    label: "Substantive opening paragraph",
    passed: firstPlain.split(/\s+/).length >= 25,
    why: "Retrieval systems weight early content heavily. A page that opens with marketing throat-clearing rather than a direct answer gets quoted from the wrong part, or skipped.",
    detail: firstPlain ? `Opening paragraph is ${firstPlain.split(/\s+/).length} words.` : "No substantial opening paragraph found.",
    weight: 2,
  });

  // 7. Enough substance to be worth citing.
  checks.push({
    id: "depth",
    label: "Enough depth to cite",
    passed: words >= 400,
    why: "Thin pages rarely contain a complete answer, so engines prefer a competitor's fuller treatment even when you rank well in classic search.",
    detail: `${words} words.`,
    weight: 2,
  });

  // 8. Canonical — stops citation splitting across duplicates.
  const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);
  checks.push({
    id: "canonical",
    label: "Canonical URL declared",
    passed: hasCanonical,
    why: "Without it, duplicate URLs can split citations between versions of the same page.",
    detail: hasCanonical ? "Present." : "Missing.",
    weight: 1,
  });

  // 9. Dates — recency is a strong ranking factor inside answer engines.
  const hasDate =
    /<time[^>]+datetime=/i.test(html) ||
    /"datePublished"/i.test(html) ||
    /<meta[^>]+property=["']article:published_time["']/i.test(html);
  checks.push({
    id: "dates",
    label: "Publication date is machine-readable",
    passed: hasDate,
    why: "Answer engines strongly prefer content they can date, and will pass over undated pages in favour of something demonstrably current.",
    detail: hasDate ? "Found a machine-readable date." : "No datePublished or <time> element.",
    weight: 1,
  });

  const earned   = checks.filter(c => c.passed).reduce((s, c) => s + c.weight, 0);
  const possible = checks.reduce((s, c) => s + c.weight, 0);

  return {
    score: possible ? Math.round((earned / possible) * 100) : 0,
    checks,
  };
}

// ─── request-time detection (for proxy.ts) ─────────────────────────────────

/**
 * Identify an AI crawler from a User-Agent header.
 *
 * Used by proxy.ts to log real crawler visits to our own domain. This is the
 * only honest way to *observe* crawler behaviour — as noted at the top of the
 * file, JavaScript-based tracking cannot see bots at all.
 */
export function identifyCrawler(userAgent: string | null): AiCrawler | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  return AI_CRAWLERS.find(c => ua.includes(c.token.toLowerCase())) ?? null;
}
