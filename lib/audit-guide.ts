// lib/audit-guide.ts
// =============================================================================
// AI Marketing Lab — what each audit rule means, and how much it matters
//
// Every other analysis surface in this product explains itself. Opportunities
// carries an evidence chain per recommendation; Answer engines and Local carry
// a `why` on every check. Site audit did not — and it is the one a customer
// would point at and call "the audit", so the flagship surface was the only
// one behaving like every other SEO tool in the category.
//
// "Page has only ~57 words. Thin content can hurt rankings." states a fact and
// leaves the reader to work out whether they should care, what to do, and what
// to do first. That is an inventory, not advice.
//
// IMPACT (0-100) drives ordering. It is deliberately NOT the same as severity:
//   severity = how broken this is
//   impact   = how much fixing it is likely to change outcomes
//
// A missing <h1> is an error, but on a page nobody searches for it is worth
// less than a weak title on the page that already gets impressions. Ordering by
// severity puts the loudest item first; ordering by impact puts the most useful
// one first, which is the whole difference between a report and a plan.
//
// One guide entry per rule, keyed by rule id. A rule with no entry still
// renders — it just carries no reasoning, which the tests below guard against.
// =============================================================================

export type RuleGuide = {
  /** Why this matters, in terms of what actually happens to the page. */
  why:    string;
  /** What to do about it. Specific enough to act on without a second search. */
  fix:    string;
  /** 0-100 likely return on fixing it. See the note above on impact vs severity. */
  impact: number;
};

export const RULE_GUIDE: Record<string, RuleGuide> = {
  // ── Indexability and crawl ────────────────────────────────────────────────
  robots_disallow_all: {
    why: "Your robots.txt tells every crawler to ignore the entire site. Nothing here can be indexed or cited while that rule stands, so no other finding in this report matters until it's removed.",
    fix: "Remove the `Disallow: /` line under `User-agent: *`. This is almost always a staging config that shipped to production by accident.",
    impact: 100,
  },
  robots_missing: {
    why: "Without robots.txt everything is crawlable by default, which is usually fine. It matters because you lose the ability to keep admin and checkout paths out of the index, and to point crawlers at your sitemap.",
    fix: "Add a robots.txt that allows your public pages, disallows app and auth routes, and declares your sitemap URL.",
    impact: 25,
  },
  sitemap_missing: {
    why: "A sitemap is how you tell search engines which pages you consider canonical and worth indexing. Without one, discovery depends entirely on internal linking — so anything more than three clicks from the homepage may go unfound for a long time.",
    fix: "Publish /sitemap.xml listing your public URLs, and reference it from robots.txt.",
    impact: 45,
  },
  homepage_unreachable: {
    why: "The crawler couldn't fetch your homepage at all. Search engines hitting the same failure will drop the site from the index rather than rank it lower.",
    fix: "Check the domain resolves, the TLS certificate matches the hostname, and the origin isn't blocking automated requests.",
    impact: 100,
  },
  broken_internal_link: {
    why: "A link that returns an error wastes crawl budget and strands whatever it points at. For a reader it's a dead end; for a crawler it's a signal the site isn't maintained.",
    fix: "Fix or remove the link. If the target moved, add a 301 to the new location rather than deleting the path.",
    impact: 55,
  },
  missing_canonical: {
    why: "Without a canonical tag, a page reachable at several URLs — with and without a trailing slash, with tracking parameters — can be treated as several competing pages. They split the ranking signals that should have accumulated on one.",
    fix: "Add `<link rel=\"canonical\">` pointing at the preferred absolute URL of the page.",
    impact: 50,
  },

  // ── On-page ───────────────────────────────────────────────────────────────
  missing_title: {
    why: "The title tag is the single strongest on-page ranking signal and the line people actually click in results. Without one, the search engine writes its own from your page text, usually badly.",
    fix: "Add a unique title of roughly 50-60 characters, leading with the term the page should rank for.",
    impact: 95,
  },
  title_too_short: {
    why: "A very short title wastes the most valuable text you control. It gives the search engine little to match a query against and gives a human little reason to click.",
    fix: "Extend to roughly 50-60 characters. Add the qualifier someone would actually type — a place, a product, an outcome.",
    impact: 60,
  },
  title_too_long: {
    why: "Titles beyond about 60 characters get truncated in results, so the tail is invisible. If your differentiator sits at the end, nobody reads it.",
    fix: "Trim to roughly 60 characters and move the distinguishing words to the front.",
    impact: 40,
  },
  missing_meta_description: {
    why: "The meta description doesn't affect ranking, but it is the sales copy under your result. Without one the engine excerpts your page text, which frequently produces a fragment mid-sentence.",
    fix: "Write 140-160 characters describing what the page gives the reader, not what the company is.",
    impact: 35,
  },
  meta_description_short: {
    why: "A very short description leaves most of the result snippet empty, which reads as a thinner page than the ones around it.",
    fix: "Extend to 140-160 characters.",
    impact: 20,
  },
  meta_description_long: {
    why: "Descriptions past about 160 characters are cut off, so the closing sentence — usually the call to action — never appears.",
    fix: "Trim to 160 characters, front-loading the reason to click.",
    impact: 18,
  },
  missing_h1: {
    why: "The h1 tells both readers and retrieval systems what the page is about before anything else is parsed. Answer engines in particular use heading structure to decide which chunk of a page answers a question.",
    fix: "Add exactly one h1 stating the page's subject in the words a searcher would use.",
    impact: 70,
  },
  multiple_h1: {
    why: "Several h1s give no single answer to \"what is this page about\", which weakens the signal rather than multiplying it.",
    fix: "Keep one h1 and demote the rest to h2.",
    impact: 30,
  },
  missing_viewport: {
    why: "Without a viewport meta tag mobile browsers render at desktop width and scale down, so text arrives too small to read. Google indexes the mobile version of your site first.",
    fix: "Add `<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">`.",
    impact: 80,
  },
  images_missing_alt: {
    why: "Alt text is how screen reader users perceive an image and how search engines understand it. Missing alt is an accessibility failure first and a lost ranking signal second.",
    fix: "Describe what the image conveys. Decorative images take an empty alt=\"\" so they're skipped rather than announced.",
    impact: 40,
  },
  hreflang_no_xdefault: {
    why: "With hreflang but no x-default, visitors whose language matches none of your variants get no defined destination, and the engine guesses.",
    fix: "Add `<link rel=\"alternate\" hreflang=\"x-default\">` pointing at your primary-language version.",
    impact: 25,
  },

  // ── Content ───────────────────────────────────────────────────────────────
  thin_content: {
    why: "A page with very little text gives a search engine almost nothing to match against, and an answer engine nothing worth quoting. Length isn't a ranking factor in itself — the problem is that there's no substance to rank.",
    fix: "Either build the page out to genuinely answer what someone arriving there wants, or remove it and redirect. A thin page that stays is a page competing with your good ones.",
    impact: 65,
  },
  incomplete_open_graph: {
    why: "Open Graph tags control how a link renders when shared on LinkedIn, Slack, WhatsApp or X. Incomplete tags produce a bare grey box, which measurably reduces click-through on shared links.",
    fix: "Set og:title, og:description and og:image. The image should be 1200x630.",
    impact: 30,
  },

  // ── Structured data ───────────────────────────────────────────────────────
  no_structured_data: {
    why: "JSON-LD is how you state facts about a page in a form that needs no interpretation — what it is, who published it, when. Answer engines lean on it to attribute a citation to a named organisation rather than a bare URL.",
    fix: "Add JSON-LD matching the page type: Organization and WebSite on the homepage, Article or BlogPosting on posts, LocalBusiness if you serve an area.",
    impact: 45,
  },

  // ── Performance ───────────────────────────────────────────────────────────
  low_performance_score: {
    why: "Core Web Vitals are a confirmed ranking signal, but the larger cost is behavioural: every extra second before a page becomes usable loses a share of visitors who never see the content at all.",
    fix: "Start with the largest contentful paint element — usually a hero image or a render-blocking script — rather than optimising broadly.",
    impact: 60,
  },
  low_accessibility_score: {
    why: "Accessibility failures exclude real users, carry legal exposure in the UK under the Equality Act, and overlap heavily with the semantics search engines rely on. Contrast, labels and heading order help both audiences at once.",
    fix: "Work the Lighthouse accessibility list top down; contrast and form labels are usually the quickest wins.",
    impact: 55,
  },

  // ── Added with the cross-page pass ────────────────────────────────────────
  noindex_page: {
    why: "This page explicitly asks search engines not to index it. If that's deliberate — a thank-you page, a duplicate — fine. If it isn't, the page cannot rank no matter what else you do to it, and a stray noindex from a staging config is one of the most expensive one-line mistakes in SEO.",
    fix: "Remove the noindex from the robots meta tag, or confirm it's intentional and stop optimising the page.",
    impact: 90,
  },
  heading_skip: {
    why: "Jumping heading levels — h1 straight to h3 — breaks the outline screen readers use to navigate, and blurs the section boundaries answer engines rely on when deciding which part of a page answers a question.",
    fix: "Use levels in order. If the jump exists for styling, change the CSS rather than the tag.",
    impact: 25,
  },
  duplicate_title: {
    why: "Pages sharing a title compete with each other for the same query. Google picks one and the others' signals are wasted — and because it's invisible on any single page, this usually goes unnoticed for years.",
    fix: "Give each page a title describing what only that page offers.",
    impact: 75,
  },
  duplicate_meta_description: {
    why: "Identical descriptions make results look templated and give no reason to prefer one over another. It also suggests the pages are near-duplicates, which invites consolidation.",
    fix: "Write a distinct description per page, or leave it out and let the engine excerpt.",
    impact: 20,
  },
  canonical_to_noindex: {
    why: "The page says \"index this other URL instead\" while that URL says \"don't index me\". The instructions contradict, so the engine resolves it however it likes — usually by indexing neither.",
    fix: "Point the canonical at an indexable page, or remove the noindex from the target.",
    impact: 85,
  },
};

/** Attach reasoning and impact to a finding. Unknown rules pass through. */
export function enrich<T extends { rule: string }>(finding: T): T & Partial<RuleGuide> {
  const guide = RULE_GUIDE[finding.rule];
  return guide ? { ...finding, ...guide } : finding;
}

/**
 * Order by likely return, not by loudness.
 *
 * Ties break on severity so that, among equally consequential items, the
 * genuinely broken one leads.
 */
export function byImpact<T extends { impact?: number; severity?: string }>(a: T, b: T): number {
  const d = (b.impact ?? 0) - (a.impact ?? 0);
  if (d !== 0) return d;
  const rank: Record<string, number> = { error: 0, warning: 1, notice: 2 };
  return (rank[a.severity ?? "notice"] ?? 2) - (rank[b.severity ?? "notice"] ?? 2);
}
