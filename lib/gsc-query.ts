// lib/gsc-query.ts
// =============================================================================
// AI Marketing Lab — one way to ask Search Console a question
//
// This exact function had been copy-pasted into four routes — /api/gsc,
// /api/opportunities, /api/keywords/ranked and /api/competitors/content-gap —
// each with its own slightly different error handling and its own idea of how
// to convert Google's 0-1 CTR into the 0-100 the rest of the codebase uses.
// This file exists so the fifth caller does not become a fifth copy.
//
// The conversions matter more than they look. Google returns `ctr` as a
// fraction and `position` as a float; everything downstream expects a
// percentage and one decimal place. A copy that forgets the ×100 does not
// crash — it reports a 4% click-through rate as 0.04% and looks like a
// catastrophe rather than a bug.
// =============================================================================

import { googleFetch } from "./outbound-fetch";
import type { QueryRow, QueryPageRow } from "./opportunities";

export const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";
export const GSC_SCOPE    = "https://www.googleapis.com/auth/webmasters.readonly";

/**
 * Search Console publishes on a two-day lag, so "yesterday" is always empty.
 * Asking for it produces a report that looks like a traffic collapse.
 */
export const GSC_LAG_DAYS = 2;

export type GscApiRow = {
  keys:        string[];
  clicks:      number;
  impressions: number;
  /** 0-1 from Google. Converted on the way out. */
  ctr:         number;
  position:    number;
};

export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export async function searchAnalytics(
  siteUrl: string, token: string, body: object,
): Promise<GscApiRow[]> {
  const res = await googleFetch(
    `${GSC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    },
  );
  if (!res.ok) {
    // Google's own message is carried through. "GSC API error 403" alone
    // cannot distinguish a permissions problem from a wrong property.
    throw new Error(`GSC API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = await res.json();
  return (json.rows ?? []) as GscApiRow[];
}

/** Google's shape → ours. The ×100 on ctr is the part copies get wrong. */
export function toQueryRow(r: GscApiRow): QueryRow {
  return {
    query:       r.keys[0],
    clicks:      r.clicks,
    impressions: r.impressions,
    ctr:         r.ctr * 100,
    position:    r.position,
  };
}

export function toQueryPageRow(r: GscApiRow, siteUrl: string): QueryPageRow {
  const raw = r.keys[1] ?? "";
  // Paths rather than absolute URLs — shorter, and easier to scan in a table.
  let page = raw;
  if (raw.startsWith(siteUrl)) page = raw.slice(siteUrl.length) || "/";
  else {
    try { page = new URL(raw).pathname; } catch { /* leave as-is */ }
  }
  return { ...toQueryRow(r), page };
}

/** The current period and the one before it, for change detection. */
export function periodPair(days = 28) {
  return {
    current: {
      startDate: isoDaysAgo(GSC_LAG_DAYS + days),
      endDate:   isoDaysAgo(GSC_LAG_DAYS),
    },
    previous: {
      startDate: isoDaysAgo(GSC_LAG_DAYS + days * 2),
      endDate:   isoDaysAgo(GSC_LAG_DAYS + days + 1),
    },
  };
}
