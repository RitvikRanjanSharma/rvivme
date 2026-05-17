// lib/quota.ts
// =============================================================================
// AI Marketing Lab — Per-user daily API quota
// =============================================================================
// Soft-launching free to UK small business owners means a single curious user
// can torch a day's DataForSEO budget if they discover the keyword tool. This
// module provides a small atomic-ish increment helper backed by the
// api_usage_quotas table so we can:
//
//   1. Stop calling paid APIs when a user has hit their daily cap.
//   2. Count cost-units (DFS) so the dashboard can show "you've used X / Y".
//   3. Surface friendly 429-style responses to the UI without burning credits.
//
// We use a per-(user, provider, day) row keyed by the UTC day. The increment
// happens BEFORE the upstream call — if the call fails we don't roll back,
// since DFS bills regardless. To avoid double-charging on retries, callers
// should pass `cost: 0` when retrying a known failed call.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";

type SB = SupabaseClient<Database>;
type Provider = Database["public"]["Tables"]["api_usage_quotas"]["Row"]["provider"];

// ---------------------------------------------------------------------------
// Default daily caps — per user, per UTC day. Tuned for a free soft launch
// where most users will spend < 5 minutes per day inside the app.
// ---------------------------------------------------------------------------
// These are intentionally conservative. A user who legitimately needs more
// can be bumped from the admin tools (or we can switch off the cap globally
// while we're still small) by editing this map.
export const DAILY_CAPS: Record<Provider, { count: number; cost?: number }> = {
  // DataForSEO is by far our biggest spend — keyword research can rip through
  // credits. 30 calls/day ≈ 6 keyword research sessions per day per user.
  dataforseo: { count: 30, cost: 1.5 },
  // Anthropic — token cost dominates, count is a coarse safeguard. Strategy
  // generation + content drafts ≈ 8-12 calls per session.
  anthropic:  { count: 50 },
  // PageSpeed Insights — Google rate-limits us to 25k/day across the project,
  // but a single user shouldn't audit > 10 pages a day.
  psi:        { count: 20 },
  // Google APIs are free up to generous quotas; we count them anyway so we
  // can spot abusive patterns.
  ga4:        { count: 200 },
  gsc:        { count: 200 },
  trends:     { count: 100 },
};

// Master switch — useful while we're still launching and want to see who
// is hitting limits without actually blocking them.
const ENFORCE = process.env.QUOTA_ENFORCE !== "false";

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// readUsage: returns today's row for (user, provider). If none exists the
// counter is implicitly 0; we don't insert a placeholder.
// ---------------------------------------------------------------------------
export async function readUsage(
  sb: SB,
  userId: string,
  provider: Provider,
): Promise<{ count: number; cost_units: number }> {
  const res = await sb
    .from("api_usage_quotas")
    .select("count, cost_units")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("day", utcDay())
    .maybeSingle();
  // Cast — postgrest v12 returns `never` for our hand-written Database type.
  const data = res.data as { count?: number; cost_units?: number } | null;
  return {
    count:      data?.count      ?? 0,
    cost_units: data?.cost_units ?? 0,
  };
}

// ---------------------------------------------------------------------------
// checkAndIncrement: the main entry point. Returns { allowed, remaining }.
// When `allowed: false`, callers should bail out and return a structured
// "quota_exceeded" response so the UI can render a calm explanation.
//
// Implementation note: there's no upsert-and-increment-in-one-call in
// PostgREST so we do select → insert OR update. This is racy under high
// concurrency, but for our single-user-per-page traffic it's fine. If we
// outgrow it we can swap in a Postgres function with row-level locking.
// ---------------------------------------------------------------------------
export type QuotaResult = {
  allowed:   boolean;
  remaining: number;
  cap:       number;
  used:      number;
  reason?:   string;
};

export async function checkAndIncrement(
  sb: SB,
  userId: string,
  provider: Provider,
  opts: { cost?: number; endpoint?: string; dryRun?: boolean } = {},
): Promise<QuotaResult> {
  const cap = DAILY_CAPS[provider]?.count ?? Number.POSITIVE_INFINITY;
  const cost = opts.cost ?? 0;
  const day = utcDay();

  const current = await readUsage(sb, userId, provider);

  // Already over cap — refuse before incrementing.
  if (ENFORCE && current.count >= cap) {
    return {
      allowed:   false,
      remaining: 0,
      cap,
      used:      current.count,
      reason:    "quota_exceeded",
    };
  }

  if (opts.dryRun) {
    return {
      allowed:   true,
      remaining: Math.max(0, cap - current.count),
      cap,
      used:      current.count,
    };
  }

  // Increment. Try insert first (fresh day); fall back to update.
  const updRes = await sb
    .from("api_usage_quotas")
    .update({
      count:      current.count + 1,
      cost_units: current.cost_units + cost,
      endpoint:   opts.endpoint ?? null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("day", day)
    .select("count, cost_units")
    .maybeSingle();
  const updated = updRes.data as { count: number } | null;

  if (!updRes.error && updated) {
    return {
      allowed:   true,
      remaining: Math.max(0, cap - updated.count),
      cap,
      used:      updated.count,
    };
  }

  // No row yet — insert a fresh one.
  const insRes = await sb
    .from("api_usage_quotas")
    .insert({
      user_id:    userId,
      provider,
      endpoint:   opts.endpoint ?? null,
      day,
      count:      1,
      cost_units: cost,
    } as never)
    .select("count, cost_units")
    .single();
  const inserted = insRes.data as { count: number } | null;

  return {
    allowed:   true,
    remaining: Math.max(0, cap - (inserted?.count ?? 1)),
    cap,
    used:      inserted?.count ?? 1,
  };
}

// ---------------------------------------------------------------------------
// usageSummary: read all of today's counters for a user. Surfaced on the
// Settings → Usage tab so people can see what they're consuming.
// ---------------------------------------------------------------------------
export async function usageSummary(sb: SB, userId: string) {
  const res = await sb
    .from("api_usage_quotas")
    .select("provider, count, cost_units")
    .eq("user_id", userId)
    .eq("day", utcDay());
  // Cast — postgrest v12 returns `never[]` for our hand-written Database type.
  const data = (res.data ?? []) as { provider: Provider; count: number; cost_units: number }[];

  const result: Record<Provider, { used: number; cost: number; cap: number }> =
    Object.fromEntries(
      (Object.keys(DAILY_CAPS) as Provider[]).map(p => [p, {
        used: 0,
        cost: 0,
        cap:  DAILY_CAPS[p].count,
      }]),
    ) as Record<Provider, { used: number; cost: number; cap: number }>;

  for (const row of data) {
    if (result[row.provider]) {
      result[row.provider].used = row.count;
      result[row.provider].cost = row.cost_units;
    }
  }

  return result;
}
