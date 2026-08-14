// lib/site.ts
// =============================================================================
// One definition of where this site lives.
//
// The apex (aimarketinglab.co.uk) does not serve the application — it has a
// parking certificate — so every canonical URL, sitemap entry and robots
// directive must point at the www host. That fact was previously repeated in
// three files, which is how it ends up wrong in one of them.
// =============================================================================

export const SITE_URL = "https://www.aimarketinglab.co.uk";

export const SITE_NAME = "AI Marketing Lab";

export const SITE_DESCRIPTION =
  "Unified SEO and GEO intelligence. Google Analytics, Search Console and AI answer-engine tracking in one workspace.";

/** Absolute URL for a path, with no trailing-slash surprises. */
export function absoluteUrl(path: string): string {
  if (!path || path === "/") return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
