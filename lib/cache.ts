// lib/cache.ts
// =============================================================================
// AI Marketing Lab — Postgres-backed KV cache
// =============================================================================
// DataForSEO charges per call, so we cache the most expensive responses
// (keyword-ideas, competitors, SERPs, domain-metrics) for a TTL window. The
// store is the public.cache_entries table — fast enough for our scale and
// avoids running a separate Redis. Anything that needs sub-50ms reads should
// not use this; everything else (keyword research, audits, GEO) is fine.
//
// Two access patterns:
//
//   getOrFetch(ns, key, ttl, fetcher) — the common case. Returns cached or
//                                        runs the fetcher and stores the
//                                        result before returning.
//   get / set / del                     — for places that need finer control
//                                        (e.g. invalidation on user action).
//
// Keys are namespaced so we can purge-by-namespace later (e.g. nuke all
// keyword caches when a user updates their domain).
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";

type SB = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Stable cache keys. Using a named constant makes it grep-able when we want
// to invalidate everything in a namespace.
// ---------------------------------------------------------------------------
export const CACHE_NS = {
  DFS_KEYWORDS:    "dfs:keyword-ideas",
  DFS_COMPETITORS: "dfs:competitors",
  DFS_SERP:        "dfs:serp",
  DFS_DOMAIN:      "dfs:domain-metrics",
  TRENDS:          "google-trends",
  PSI:             "psi",
  GEO:             "geo:ai-overview",
} as const;

// Sensible TTL defaults in seconds. Long-tail volume data doesn't change
// minute-to-minute; SERP results refresh more often.
export const CACHE_TTL = {
  short:  60 * 5,        // 5 minutes
  medium: 60 * 60,       // 1 hour
  long:   60 * 60 * 24,  // 24 hours
  week:   60 * 60 * 24 * 7,
} as const;

function nowPlusSeconds(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// get: return value if present and not expired, else null. Userless reads
// (userId === null) hit the global namespace.
// ---------------------------------------------------------------------------
export async function get<T>(
  sb: SB,
  userId: string | null,
  namespace: string,
  cacheKey: string,
): Promise<T | null> {
  let q = sb
    .from("cache_entries")
    .select("value, expires_at")
    .eq("namespace", namespace)
    .eq("cache_key", cacheKey);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);

  const { data } = await q.maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.value as T;
}

// ---------------------------------------------------------------------------
// set: write a value. Upserts on (user_id, namespace, cache_key) — the table
// has a unique constraint on those three columns.
// ---------------------------------------------------------------------------
export async function set<T extends Record<string, unknown> | unknown[]>(
  sb: SB,
  userId: string | null,
  namespace: string,
  cacheKey: string,
  value: T,
  ttlSeconds: number = CACHE_TTL.medium,
): Promise<void> {
  // Wrap arrays/scalars so the JSONB column always receives an object —
  // simpler typing on the read side.
  const wrapped = (value && typeof value === "object" && !Array.isArray(value))
    ? value
    : { __value: value };

  await sb
    .from("cache_entries")
    .upsert(
      {
        user_id:    userId,
        namespace,
        cache_key:  cacheKey,
        value:      wrapped as Record<string, unknown>,
        expires_at: nowPlusSeconds(ttlSeconds),
      },
      { onConflict: "user_id,namespace,cache_key" },
    );
}

// ---------------------------------------------------------------------------
// del: remove a single key. Used when a user's settings change in a way that
// invalidates the cache (e.g. switching primary domain).
// ---------------------------------------------------------------------------
export async function del(
  sb: SB,
  userId: string | null,
  namespace: string,
  cacheKey: string,
): Promise<void> {
  let q = sb
    .from("cache_entries")
    .delete()
    .eq("namespace", namespace)
    .eq("cache_key", cacheKey);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  await q;
}

// ---------------------------------------------------------------------------
// getOrFetch: the workhorse. Returns cached value or invokes fetcher, stores
// the result, and returns it. fetcher errors propagate; we don't poison the
// cache with failed responses.
// ---------------------------------------------------------------------------
export async function getOrFetch<T extends Record<string, unknown> | unknown[]>(
  sb: SB,
  userId: string | null,
  namespace: string,
  cacheKey: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = await get<T | { __value: T }>(sb, userId, namespace, cacheKey);
  if (cached !== null) {
    // Unwrap if we wrapped a non-object on the way in.
    if (cached && typeof cached === "object" && "__value" in cached) {
      return (cached as { __value: T }).__value;
    }
    return cached as T;
  }
  const fresh = await fetcher();
  await set(sb, userId, namespace, cacheKey, fresh, ttlSeconds);
  return fresh;
}

// ---------------------------------------------------------------------------
// purgeNamespace: drop every cache row in a namespace for a user. Useful on
// "force refresh" buttons.
// ---------------------------------------------------------------------------
export async function purgeNamespace(
  sb: SB,
  userId: string | null,
  namespace: string,
): Promise<void> {
  let q = sb.from("cache_entries").delete().eq("namespace", namespace);
  q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
  await q;
}
