// lib/redirect-cache.ts
// =============================================================================
// AI Marketing Lab — runtime redirects, cached in module scope
//
// WHY THIS ISN'T THE unstable_cache USED EVERYWHERE ELSE
//
// This is read from proxy.ts, which runs on EVERY request — pages, API calls,
// prefetches, the lot. Next's data cache is not available there, so a plain
// query would put a Supabase round trip in front of every single request on the
// site. That is the kind of change that makes everything feel slow for a
// feature almost nobody uses.
//
// So: an in-memory map with a short TTL, held in module scope. Each serverless
// instance fetches at most once per TTL window, and a cold instance that cannot
// reach the database serves no redirects rather than failing the request — the
// safe direction, since a missing redirect is a 404 on one URL while a failed
// proxy is an outage on all of them.
//
// The trade is that an edit takes up to TTL seconds to appear, and longer if
// several instances are warm. That is stated plainly in the admin panel; it is
// the right trade for something consulted this often.
//
// A single in-flight promise is shared rather than allowing concurrent
// refreshes: a burst of traffic against a cold instance would otherwise fire
// one identical query per request, which is exactly when the database can least
// afford it.
// =============================================================================

import { createClient } from "@supabase/supabase-js";

export type RedirectRule = {
  source:      string;
  destination: string;
  status_code: number;
};

const TTL_MS = 60_000;

let cache:     RedirectRule[] = [];
let fetchedAt  = 0;
let inFlight:  Promise<RedirectRule[]> | null = null;

async function load(): Promise<RedirectRule[]> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return [];
  try {
    const sb = createClient(url, anon, { auth: { persistSession: false } });
    const { data, error } = await sb
      .from("redirects")
      .select("source, destination, status_code")
      .eq("enabled", true)
      .limit(500);
    if (error || !data) return [];
    return data as RedirectRule[];
  } catch {
    return [];
  }
}

/**
 * Current rules, refreshing at most once per TTL.
 *
 * Returns the STALE list while a refresh is in flight rather than awaiting it,
 * so no request ever blocks on this. A redirect being a minute out of date is
 * invisible; a request waiting on a database query is not.
 */
export async function getCachedRedirects(): Promise<RedirectRule[]> {
  const now = Date.now();

  if (now - fetchedAt < TTL_MS) return cache;

  if (!inFlight) {
    inFlight = load()
      .then(rules => {
        cache = rules;
        fetchedAt = Date.now();
        return rules;
      })
      .finally(() => { inFlight = null; });
  }

  // First ever call has nothing to serve, so it waits. Every later refresh
  // serves the previous list immediately.
  if (fetchedAt === 0) return inFlight;
  return cache;
}

/**
 * Find a rule for this path.
 *
 * Exact match on the pathname only. Wildcards and pattern matching are
 * deliberately absent: this runs on every request, and a list of regular
 * expressions evaluated against every URL is both a performance cliff and an
 * excellent way to take the site down with one bad pattern. Exact matches are
 * what a "we moved this page" redirect actually needs.
 */
export function matchRedirect(
  rules: RedirectRule[],
  pathname: string,
): RedirectRule | null {
  const needle = normalisePath(pathname);
  for (const rule of rules) {
    if (normalisePath(rule.source) === needle) {
      // Self-referential rules are rejected at the database level too, but a
      // redirect loop takes a route down hard enough to be worth checking on
      // both sides of the boundary.
      if (normalisePath(rule.destination) === needle) return null;
      return rule;
    }
  }
  return null;
}

function normalisePath(p: string): string {
  if (!p) return "/";
  const trimmed = p.split("?")[0].split("#")[0];
  if (trimmed === "/") return "/";
  return trimmed.replace(/\/+$/, "") || "/";
}
