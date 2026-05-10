// app/api/cron/cleanup/route.ts
// =============================================================================
// AI Marketing Lab — Daily housekeeping
// =============================================================================
// Removes expired cache rows and trims data the privacy notice promises we
// won't keep forever. Idempotent and cheap to run.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { verifyCron, getServiceSupabase } from "@/lib/cron";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = verifyCron(req);
  if (guard) return guard;

  const sb = getServiceSupabase();
  const result = { cache_deleted: 0, quotas_pruned: 0, logs_pruned: 0 };

  // 1. Expired cache entries
  const { count: cacheCount } = await sb
    .from("cache_entries")
    .delete({ count: "exact" })
    .lt("expires_at", new Date().toISOString());
  result.cache_deleted = cacheCount ?? 0;

  // 2. Quota counters older than 90 days — privacy notice says we keep usage
  //    counters for that long.
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const { count: quotaCount } = await sb
    .from("api_usage_quotas")
    .delete({ count: "exact" })
    .lt("day", ninetyDaysAgo);
  result.quotas_pruned = quotaCount ?? 0;

  // 3. Provider call logs older than 90 days
  const { count: logsCount } = await sb
    .from("data_provider_logs")
    .delete({ count: "exact" })
    .lt("called_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
  result.logs_pruned = logsCount ?? 0;

  return NextResponse.json({ success: true, ...result });
}
