// app/api/geo/crawler-hit/route.ts
// =============================================================================
// Internal endpoint. Records a crawler visit reported by proxy.ts.
//
// Guarded by a shared secret rather than a user session, because the proxy
// runs before auth and the caller is our own edge function. Without the guard
// anyone could POST fabricated crawler traffic.
//
// GET returns an aggregate for the dashboard — never raw rows.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCallerOrNull } from "@/lib/supabase-server";
import { AI_CRAWLERS } from "@/lib/ai-crawlers";

export const dynamic = "force-dynamic";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const VALID_TOKENS = new Set(AI_CRAWLERS.map(c => c.token));

export async function POST(request: NextRequest) {
  // Constant-ish comparison is unnecessary here — the secret only prevents
  // casual spam of a write-only aggregate, not access to anything sensitive.
  const secret = process.env.INTERNAL_LOG_SECRET;
  if (!secret || request.headers.get("x-aiml-internal") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const sb = adminClient();
  if (!sb) return NextResponse.json({ ok: false, reason: "not_configured" });

  try {
    const { crawler, path } = (await request.json()) as { crawler?: string; path?: string };

    // Only record crawlers we recognise — stops the table filling with
    // arbitrary strings if the endpoint is ever reached with junk.
    if (!crawler || !VALID_TOKENS.has(crawler)) {
      return NextResponse.json({ ok: false, reason: "unknown_crawler" });
    }

    await sb.from("ai_crawler_hits").insert({
      crawler,
      path: (path ?? "/").slice(0, 500),
    } as never);

    return NextResponse.json({ ok: true });
  } catch {
    // Logging failures are never worth surfacing.
    return NextResponse.json({ ok: false });
  }
}

/** Aggregated crawler activity for the last N days. Requires a session. */
export async function GET(request: NextRequest) {
  const caller = await getCallerOrNull();
  if (!caller) {
    return NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 });
  }

  const sb = adminClient();
  if (!sb) {
    return NextResponse.json({
      success: false,
      reason:  "not_configured",
      message: "Crawler logging isn't set up on this deployment.",
    });
  }

  const days  = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days") ?? 30), 1), 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await sb
    .from("ai_crawler_hits")
    .select("crawler, path, occurred_at")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ success: false, reason: "api_error", message: error.message });
  }

  const rows = (data as { crawler: string; path: string; occurred_at: string }[] | null) ?? [];

  const byCrawler = new Map<string, { hits: number; lastSeen: string; paths: Set<string> }>();
  for (const r of rows) {
    const entry = byCrawler.get(r.crawler) ?? { hits: 0, lastSeen: r.occurred_at, paths: new Set<string>() };
    entry.hits += 1;
    if (r.occurred_at > entry.lastSeen) entry.lastSeen = r.occurred_at;
    entry.paths.add(r.path);
    byCrawler.set(r.crawler, entry);
  }

  const crawlers = AI_CRAWLERS.map(c => {
    const seen = byCrawler.get(c.token);
    return {
      token:       c.token,
      name:        c.name,
      operator:    c.operator,
      purpose:     c.purpose,
      hits:        seen?.hits ?? 0,
      lastSeen:    seen?.lastSeen ?? null,
      uniquePaths: seen ? seen.paths.size : 0,
    };
  }).sort((a, b) => b.hits - a.hits);

  return NextResponse.json({
    success:   true,
    days,
    totalHits: rows.length,
    crawlers,
    seenCount: crawlers.filter(c => c.hits > 0).length,
  });
}
