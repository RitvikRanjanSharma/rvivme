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

/** The apex. Redirects to www — see the note on resolveBaseUrl. */
const APEX = "aimarketinglab.co.uk";

/**
 * The base URL for links we hand to the outside world — emails, RSS items,
 * canonical tags, Open Graph.
 *
 * Respects APP_URL, but rewrites the apex to www.
 *
 * WHY THIS STILL EXISTS NOW THE APEX IS FIXED
 *
 * It was originally a workaround for a broken host: the apex served a parking
 * certificate, so every link built from it — RSS entries, Open Graph URLs
 * shared to LinkedIn, unsubscribe links in email — landed on a TLS warning.
 * That is no longer true. The apex now resolves to Vercel and issues a 308 to
 * www, verified August 2026.
 *
 * The rewrite is kept because its justification changed rather than
 * disappeared. www is the canonical host, and a link to the apex now costs an
 * extra redirect hop on every click. In email and RSS that hop is paid by the
 * recipient, and for a canonical tag it is worth nothing at all — a canonical
 * pointing at a URL that redirects is a canonical pointing at the wrong URL.
 *
 * So this is now canonicalisation, not damage control. If the apex is ever
 * made to serve directly, this can go.
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
    if (u.hostname === APEX) return SITE_URL;
    return u.origin;
  } catch {
    return SITE_URL;
  }
}
