// lib/site-content.ts
// =============================================================================
// AI Marketing Lab — reading operator-editable site content
//
// Backs the /admin panel: per-route SEO overrides, editable copy blocks, the
// robots.txt and llms.txt bodies, and runtime redirects.
//
// TWO RULES GOVERN EVERYTHING IN THIS FILE
//
// 1. THE DATABASE OVERRIDES; IT NEVER REPLACES.
//    Every reader takes the value compiled into the app and returns the
//    database's version only where one exists. A missing row, an empty table
//    or an outright outage therefore renders the site exactly as it ships.
//    This is what makes putting page copy in a database safe: the failure mode
//    is "your edit didn't apply", never "the page is blank".
//
// 2. READS ARE CACHED, NOT PER-REQUEST.
//    Metadata is resolved on every page render and redirects are consulted on
//    every single request. A naive query in either path would add a database
//    round trip to the whole site. Everything here goes through the Next data
//    cache with a tag, and the admin panel revalidates that tag on save — so a
//    read happens once per edit rather than once per visitor, and an edit still
//    appears immediately.
//
// The anon key is deliberate rather than an oversight: these tables are
// world-readable by RLS policy, because their contents are already visible to
// anyone who loads the page. Writes are gated on public.is_site_admin() in the
// database. Rendering therefore needs no elevated credential.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
// unstable_cache rather than the newer `use cache` directive: `use cache` needs
// Cache Components enabled application-wide, which changes caching semantics on
// every route in the app. That is a large blast radius for one feature.
// unstable_cache is still supported and documented in this version.
import { unstable_cache, updateTag } from "next/cache";

export const CONTENT_TAG = "site-content";

/** How long a cached read survives without an explicit revalidation. */
const TTL_SECONDS = 300;

function publicClient() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, { auth: { persistSession: false } });
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type SeoOverride = {
  route:          string;
  title:          string | null;
  description:    string | null;
  canonical:      string | null;
  robots_index:   boolean | null;
  robots_follow:  boolean | null;
  og_title:       string | null;
  og_description: string | null;
  og_image:       string | null;
  json_ld:        unknown | null;
};

export type ContentBlock = { key: string; value: string; label: string | null };

export type SiteFile = { key: "robots_txt" | "llms_txt"; content: string; enabled: boolean };

export type Redirect = {
  source: string; destination: string; status_code: number; enabled: boolean; note: string | null;
};

// ─── Cached readers ──────────────────────────────────────────────────────────
//
// Each returns an empty collection on any failure. That is not swallowing an
// error for convenience — an override table that cannot be read must leave the
// compiled defaults in place, and throwing here would take down a page that is
// perfectly capable of rendering itself.

export const getSeoOverrides = unstable_cache(
  async (): Promise<Record<string, SeoOverride>> => {
    const sb = publicClient();
    if (!sb) return {};
    const { data, error } = await sb.from("seo_overrides").select("*");
    if (error || !data) return {};
    const map: Record<string, SeoOverride> = {};
    for (const row of data as SeoOverride[]) map[normaliseRoute(row.route)] = row;
    return map;
  },
  ["seo-overrides"],
  { revalidate: TTL_SECONDS, tags: [CONTENT_TAG] },
);

export const getContentBlocks = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const sb = publicClient();
    if (!sb) return {};
    const { data, error } = await sb.from("content_blocks").select("key, value");
    if (error || !data) return {};
    const map: Record<string, string> = {};
    for (const row of data as ContentBlock[]) map[row.key] = row.value;
    return map;
  },
  ["content-blocks"],
  { revalidate: TTL_SECONDS, tags: [CONTENT_TAG] },
);

export const getSiteFile = unstable_cache(
  async (key: "robots_txt" | "llms_txt"): Promise<string | null> => {
    const sb = publicClient();
    if (!sb) return null;
    const { data, error } = await sb
      .from("site_files").select("content, enabled").eq("key", key).maybeSingle();
    if (error || !data) return null;
    const row = data as { content: string; enabled: boolean };
    // enabled=false is how the operator parks a draft without deleting it, so
    // it must fall back rather than serve an empty file.
    return row.enabled && row.content.trim() ? row.content : null;
  },
  ["site-file"],
  { revalidate: TTL_SECONDS, tags: [CONTENT_TAG] },
);

export const getRedirects = unstable_cache(
  async (): Promise<Redirect[]> => {
    const sb = publicClient();
    if (!sb) return [];
    const { data, error } = await sb
      .from("redirects").select("*").eq("enabled", true);
    if (error || !data) return [];
    return data as Redirect[];
  },
  ["redirects"],
  { revalidate: TTL_SECONDS, tags: [CONTENT_TAG] },
);

/**
 * Call after any admin write so the change is visible immediately.
 *
 * updateTag rather than revalidateTag, and the difference matters here.
 * revalidateTag marks the entry stale and serves the OLD value while fetching
 * the new one in the background — correct for a blog, wrong for an editor,
 * where saving and then seeing your previous text looks like the save failed.
 * updateTag expires immediately so the next read blocks on fresh data.
 *
 * The constraint that comes with it: updateTag may only be called from a
 * Server Action, not a Route Handler. That is why the admin panel writes
 * through actions rather than API routes.
 */
export function invalidateSiteContent() {
  updateTag(CONTENT_TAG);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * "/blog/" and "/blog" are the same route to a reader and different strings to
 * a database. Normalising on both write and read means an override cannot be
 * silently orphaned by a trailing slash.
 */
export function normaliseRoute(route: string): string {
  const trimmed = (route || "/").trim();
  if (trimmed === "/") return "/";
  return trimmed.replace(/\/+$/, "") || "/";
}

/**
 * Resolve one text block.
 *
 * The default is passed at the CALL SITE rather than stored centrally, which
 * matters: it keeps the shipped copy next to the markup that uses it, so the
 * code stays readable on its own and a deleted database row cannot leave a
 * page with a blank space where a sentence should be.
 */
export function block(
  blocks: Record<string, string>,
  key: string,
  fallback: string,
): string {
  const v = blocks[key];
  return typeof v === "string" && v.trim() ? v : fallback;
}
