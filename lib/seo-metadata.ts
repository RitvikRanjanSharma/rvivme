// lib/seo-metadata.ts
// =============================================================================
// AI Marketing Lab — merge a route's database override over its code default
//
// Used by every route's generateMetadata. The route keeps its compiled default
// in the file, exactly as before; this only substitutes the fields an operator
// has actually set in /admin.
//
// WHY A HELPER RATHER THAN MERGING INLINE
//
// Next merges metadata objects SHALLOWLY — a nested object in a child segment
// replaces the parent's version of that key wholesale rather than extending it.
// We shipped that bug once already: setting `twitter: { title, description }`
// on the homepage silently discarded the root layout's
// `card: "summary_large_image"` and downgraded the Twitter card.
//
// Doing the merge in one place means the openGraph and twitter objects are
// rebuilt completely and correctly every time, instead of every route having to
// remember which inherited fields it is about to destroy.
// =============================================================================

import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";
import { getSeoOverrides, normaliseRoute, type SeoOverride } from "@/lib/site-content";

/** What a route declares in code. Everything is optional except the route. */
export type RouteSeo = {
  route:        string;
  title?:       string;
  /** Set when the title must NOT get the "— AI Marketing Lab" suffix. */
  titleAbsolute?: boolean;
  description?: string;
  canonical?:   string;
  index?:       boolean;
  follow?:      boolean;
  ogType?:      "website" | "article";
};

function pick<T>(override: T | null | undefined, fallback: T | undefined): T | undefined {
  return override === null || override === undefined ? fallback : override;
}

/**
 * Build the final Metadata for a route.
 *
 * Deliberately tolerant: if the overrides cannot be read we return the code
 * defaults rather than throwing, because a metadata lookup failing is not a
 * reason to fail the page.
 */
export async function resolveSeo(defaults: RouteSeo): Promise<Metadata> {
  let override: SeoOverride | undefined;
  try {
    const all = await getSeoOverrides();
    override = all[normaliseRoute(defaults.route)];
  } catch {
    override = undefined;
  }

  const title       = pick(override?.title,       defaults.title);
  const description = pick(override?.description, defaults.description);
  const canonical   = pick(override?.canonical,   defaults.canonical ?? defaults.route);
  const index       = pick(override?.robots_index,  defaults.index  ?? true);
  const follow      = pick(override?.robots_follow, defaults.follow ?? true);

  // Social titles fall back to the page title, then to the code default. An
  // operator who changes the title alone should not have to remember to change
  // the OG title as well for the link preview to match.
  const ogTitle       = pick(override?.og_title,       undefined) ?? absoluteTitle(title, defaults);
  const ogDescription = pick(override?.og_description, undefined) ?? description;
  const ogImage       = override?.og_image ?? undefined;

  // Keys are OMITTED rather than set to undefined when there is no value.
  //
  // This is not tidiness. The deployed site was serving twitter:card
  // "summary" — a small thumbnail — despite this file asking for
  // "summary_large_image". The cause appears to be `images: undefined`:
  // Next resolves the twitter object first and treats an explicitly imageless
  // card as a small one, then merges in the image from the file-based
  // opengraph-image convention afterwards, by which point the card type is
  // already decided. Leaving the key out entirely lets the file convention
  // govern images from the start.
  const openGraph: NonNullable<Metadata["openGraph"]> = {
    title:       ogTitle,
    description: ogDescription,
    url:         canonical,
    type:        defaults.ogType ?? "website",
    // Restated because of the shallow merge described above.
    siteName:    SITE_NAME,
    locale:      "en_GB",
  };
  if (ogImage) openGraph.images = [{ url: ogImage }];

  const twitter: NonNullable<Metadata["twitter"]> = {
    card:        "summary_large_image",
    title:       ogTitle,
    description: ogDescription,
  };
  if (ogImage) twitter.images = [ogImage];

  const meta: Metadata = {
    title: defaults.titleAbsolute && title ? { absolute: title } : title,
    description,
    alternates: canonical ? { canonical } : undefined,
    // Only emitted when something is actually restricted — an explicit
    // "index, follow" is noise, and its absence is the same instruction.
    robots: index && follow ? undefined : { index, follow },
    openGraph,
    twitter,
  };

  return meta;
}

/** The title as it will appear standalone, i.e. with the brand applied. */
function absoluteTitle(title: string | undefined, defaults: RouteSeo): string | undefined {
  if (!title) return undefined;
  if (defaults.titleAbsolute) return title;
  return title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`;
}

/**
 * The JSON-LD an operator has attached to a route, ready to render.
 *
 * Returned as a string for <script type="application/ld+json">. `<` is escaped
 * so a value containing "</script>" cannot break out of the tag — the one
 * genuine injection risk in shipping operator-supplied JSON to the page.
 */
export async function resolveJsonLd(route: string): Promise<string | null> {
  try {
    const all = await getSeoOverrides();
    const raw = all[normaliseRoute(route)]?.json_ld;
    if (!raw) return null;
    return JSON.stringify(raw).replace(/</g, "\\u003c");
  } catch {
    return null;
  }
}
