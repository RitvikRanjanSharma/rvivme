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

/** The apex that does not serve the site. Kept explicit so the guard below reads. */
const DEAD_APEX = "aimarketinglab.co.uk";

/**
 * The base URL for links we hand to the outside world — emails, RSS items,
 * canonical tags, Open Graph.
 *
 * Respects APP_URL, but corrects one specific known-broken value. Several
 * places defaulted to `https://aimarketinglab.co.uk`, and APP_URL in
 * production may well be set to it too, because the apex is the obvious thing
 * to type. It resolves to a parking certificate, so every one of those links
 * lands on a TLS warning: RSS entries, blog Open Graph URLs shared to
 * LinkedIn, and the unsubscribe links in outbound email.
 *
 * This is a deliberate override of configuration rather than a general
 * normaliser — it fires only for the one hostname we know doesn't serve.
 */
export function resolveBaseUrl(): string {
  const configured =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NEXT_PUBLIC_SITE_DOMAIN ? `https://${process.env.NEXT_PUBLIC_SITE_DOMAIN}` : "");

  if (!configured) return SITE_URL;

  try {
    const u = new URL(configured.replace(/\/$/, ""));
    // Leave localhost and preview deployments completely alone.
    if (u.hostname === DEAD_APEX) return SITE_URL;
    return u.origin;
  } catch {
    return SITE_URL;
  }
}
