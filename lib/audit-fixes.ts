// lib/audit-fixes.ts
// =============================================================================
// AI Marketing Lab — ready-to-paste fixes
//
// THE GAP THIS CLOSES
//
// The audit could tell you a title was 68 characters and that 68 is too many.
// So can every other tool. What none of them do is show you YOUR title, and
// hand you the replacement.
//
// Two problems were hiding in that, and they need different solutions.
//
// TRUST. "Title is 68 characters" is unverifiable — the reader has no way to
// know we actually read their page rather than guessed. Showing the exact
// string, with its length, is the whole difference between a claim and
// evidence. That data was already being captured; it simply was never shown.
//
// SOLUTION. "Trim to roughly 60 characters" is homework, not help. For some
// rules there is exactly ONE correct answer — the viewport tag is the viewport
// tag — and for those, generating it here is better than asking a model,
// because a deterministic function cannot hallucinate an attribute or quietly
// drift between runs. Rules that need judgement (what should the title SAY)
// go to Claude instead, on demand. This file is the deterministic half.
//
// Everything below is built from the site's OWN values. No placeholders like
// "Your Company Name" — if we cannot fill a field from real data we leave the
// fix out rather than ship something that has to be edited before it works.
// =============================================================================

export type ReadyFix = {
  /** Short label for the copy button, e.g. "meta tag". */
  label:    string;
  /** The exact text to paste. */
  code:     string;
  /** Where it goes. One sentence, no jargon. */
  where:    string;
  /** Language hint for display. */
  lang:     "html" | "json" | "text";
};

type Detail = Record<string, unknown>;

function str(d: Detail | undefined, key: string): string | undefined {
  const v = d?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).origin; } catch { return null; }
}

/** A readable site name from the domain, e.g. "aimarketinglab.co.uk" → "Aimarketinglab". */
function nameFromHost(url: string | undefined): string | null {
  const origin = originOf(url);
  if (!origin) return null;
  try {
    const host = new URL(origin).hostname.replace(/^www\./, "");
    const first = host.split(".")[0];
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : null;
  } catch { return null; }
}

/**
 * The deterministic fix for a finding, if it has one.
 *
 * Returns null where the answer needs judgement rather than a template —
 * those are handled by the on-demand suggestion endpoint.
 */
export function readyFix(rule: string, detail: Detail | undefined, pageUrl?: string): ReadyFix[] {
  const url   = str(detail, "url") ?? pageUrl;
  const title = str(detail, "title");
  const desc  = str(detail, "description");
  const h1    = str(detail, "h1");

  switch (rule) {
    // ── Exactly one right answer ─────────────────────────────────────────────
    case "missing_viewport":
      return [{
        label: "meta tag",
        lang:  "html",
        where: "Inside the <head> of every page.",
        code:  `<meta name="viewport" content="width=device-width, initial-scale=1">`,
      }];

    case "missing_canonical": {
      if (!url) return [];
      return [{
        label: "canonical tag",
        lang:  "html",
        where: "Inside the <head> of this page.",
        // The page's own URL — a canonical pointing anywhere else would be a
        // guess, and a wrong canonical is worse than none at all.
        code:  `<link rel="canonical" href="${escapeAttr(url)}">`,
      }];
    }

    case "incomplete_open_graph": {
      const ogTitle = title ?? h1;
      if (!ogTitle || !url) return [];
      const lines = [
        `<meta property="og:title" content="${escapeAttr(ogTitle)}">`,
        desc ? `<meta property="og:description" content="${escapeAttr(desc)}">` : null,
        `<meta property="og:url" content="${escapeAttr(url)}">`,
        `<meta property="og:type" content="website">`,
        `<meta property="og:image" content="${escapeAttr(originOf(url) ?? "")}/og-image.png">`,
        `<meta name="twitter:card" content="summary_large_image">`,
      ].filter(Boolean);
      return [{
        label: "Open Graph tags",
        lang:  "html",
        where: "Inside the <head>. Replace the image path with a real 1200×630 image.",
        code:  lines.join("\n"),
      }];
    }

    case "no_structured_data": {
      const name = nameFromHost(url);
      const origin = originOf(url);
      if (!name || !origin) return [];
      const org = {
        "@context": "https://schema.org",
        "@type":    "Organization",
        name,
        url:        origin,
        ...(desc ? { description: desc } : {}),
      };
      const page = {
        "@context": "https://schema.org",
        "@type":    "WebPage",
        ...(title ? { name: title } : {}),
        url,
        ...(desc ? { description: desc } : {}),
      };
      return [
        {
          label: "Organization schema",
          lang:  "json",
          where: "In a <script type=\"application/ld+json\"> tag in the <head> of your homepage.",
          code:  JSON.stringify(org, null, 2),
        },
        {
          label: "WebPage schema",
          lang:  "json",
          where: "In a <script type=\"application/ld+json\"> tag in the <head> of this page.",
          code:  JSON.stringify(page, null, 2),
        },
      ];
    }

    case "robots_missing": {
      const origin = originOf(url);
      if (!origin) return [];
      return [{
        label: "robots.txt",
        lang:  "text",
        where: "Save as robots.txt at the root of your site.",
        code:  [
          "User-agent: *",
          "Allow: /",
          "",
          "# Keep admin and checkout paths out of search results.",
          "Disallow: /admin",
          "Disallow: /cart",
          "Disallow: /checkout",
          "",
          `Sitemap: ${origin}/sitemap.xml`,
          "",
        ].join("\n"),
      }];
    }

    case "sitemap_missing": {
      const origin = originOf(url);
      if (!origin) return [];
      return [{
        label: "sitemap starter",
        lang:  "text",
        where: "Save as sitemap.xml at the root of your site, then add one <url> block per page.",
        code:  [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          `  <url>`,
          `    <loc>${origin}/</loc>`,
          `    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>`,
          `  </url>`,
          `</urlset>`,
        ].join("\n"),
      }];
    }

    case "noindex_page":
      return [{
        label: "remove this line",
        lang:  "html",
        where: "Find this in the <head> and delete it — it is what removes the page from search.",
        code:  `<meta name="robots" content="noindex">`,
      }];

    case "hreflang_no_xdefault": {
      if (!url) return [];
      return [{
        label: "x-default tag",
        lang:  "html",
        where: "Alongside your other hreflang tags in the <head>.",
        code:  `<link rel="alternate" hreflang="x-default" href="${escapeAttr(url)}">`,
      }];
    }

    // ── Judgement required — handled by the suggestion endpoint ──────────────
    default:
      return [];
  }
}

/**
 * Which rules can be improved by a written suggestion.
 *
 * Kept as an explicit list rather than "everything not in readyFix", because
 * some rules genuinely have no useful suggestion — a broken link needs finding,
 * not writing, and a slow page needs profiling. Offering a "suggest a fix"
 * button that returns waffle is worse than not offering one.
 */
export const SUGGESTIBLE = new Set([
  "missing_title", "title_too_short", "title_too_long", "duplicate_title",
  "missing_meta_description", "meta_description_short", "meta_description_long",
  "duplicate_meta_description",
  "missing_h1", "multiple_h1", "heading_skip",
  "thin_content",
  "images_missing_alt",
  "low_accessibility_score",
  "aeo_answer_first", "aeo_heading_structure", "aeo_depth", "aeo_meta_description",
]);

export function canSuggest(rule: string): boolean {
  return SUGGESTIBLE.has(rule);
}

/** True when we have something concrete to show beyond the message itself. */
export function hasEvidence(detail: Detail | undefined): boolean {
  if (!detail) return false;
  return ["title", "description", "h1", "headings", "word_count", "pages", "length", "total"]
    .some(k => detail[k] !== undefined && detail[k] !== null);
}
