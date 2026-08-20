// app/api/strategies/retrospective/route.ts
// =============================================================================
// AI Marketing Lab — "did it work?"
//
// GET /api/strategies/retrospective?id=<strategy-id>
//   (omit id to assess the currently active strategy)
//
// Compares the baseline captured at activation with live Search Console data
// and returns a verdict plus its reasoning. See lib/retrospective.ts for the
// judgement rules — in particular why "too early" and "not started" take
// precedence over any movement in the numbers.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull }    from "@/lib/supabase-server";
import { resolveGoogleToken } from "@/lib/google-oauth";
import { googleFetch } from "@/lib/outbound-fetch";

// Declared so a slow upstream fails as a timeout rather than as a killed
// process. A killed function returns nothing at all, which the UI cannot
// distinguish from an empty result.
export const maxDuration = 60;
import {
  buildRetrospective,
  type BaselineGsc, type CurrentGscSnapshot, type TrackedKeyword,
} from "@/lib/retrospective";

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";
const GSC_SCOPE    = "https://www.googleapis.com/auth/webmasters.readonly";
const LAG_DAYS = 2;
const PERIOD   = 28;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

type BaselineMetrics = {
  capturedAt?:  string;
  gsc?:         { clicks: number; impressions: number; avgPosition: number; ctr: number };
  keywordPos?:  Record<string, number>;
};

export async function GET(request: NextRequest) {
  try {
    const caller = await getCallerOrNull();
    if (!caller) {
      return NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 });
    }

    const id = new URL(request.url).searchParams.get("id");

    // Either the named strategy or the active one.
    let query = caller.supabase
      .from("ai_strategies")
      .select("id, title, baseline_metrics, created_at, is_active")
      .eq("user_id", caller.user.id);
    query = id ? query.eq("id", id) : query.eq("is_active", true);

    const { data: stratData } = await query.maybeSingle();
    const strategy = stratData as {
      id: string; title: string;
      baseline_metrics: BaselineMetrics | null;
      created_at: string; is_active: boolean;
    } | null;

    if (!strategy) {
      return NextResponse.json({
        success: false,
        reason:  "no_strategy",
        message: id
          ? "That strategy could not be found."
          : "No active strategy. Activate one to start tracking whether it works.",
      });
    }

    // Checklist progress — needed to distinguish "didn't work" from "wasn't done".
    const { data: checklistData } = await caller.supabase
      .from("strategy_checklist")
      .select("is_completed")
      .eq("strategy_id", strategy.id);
    const checklist = (checklistData as { is_completed: boolean }[] | null) ?? [];

    const { data: kwData } = await caller.supabase
      .from("strategy_keywords")
      .select("keyword, baseline_pos")
      .eq("strategy_id", strategy.id);
    const keywords: TrackedKeyword[] =
      ((kwData as { keyword: string; baseline_pos: number | null }[] | null) ?? [])
        .map(k => ({ keyword: k.keyword, baselinePos: k.baseline_pos }));

    // Current Search Console state.
    let current: CurrentGscSnapshot | null = null;

    const { data: userRow } = await caller.supabase
      .from("users").select("gsc_site_url").eq("id", caller.user.id).single();
    const siteUrl = (userRow as { gsc_site_url: string | null } | null)?.gsc_site_url?.trim();

    if (siteUrl) {
      const tokenResult = await resolveGoogleToken(caller.user.id, GSC_SCOPE);
      if (tokenResult.ok) {
        const range = { startDate: isoDaysAgo(LAG_DAYS + PERIOD), endDate: isoDaysAgo(LAG_DAYS) };
        const call = (body: object) => googleFetch(
          `${GSC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${tokenResult.accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        ).then(r => r.ok ? r.json() : null).catch(() => null);

        const [totals, byQuery] = await Promise.all([
          call({ ...range, searchType: "web" }),
          call({ ...range, searchType: "web", dimensions: ["query"], rowLimit: 1000 }),
        ]);

        const t = totals?.rows?.[0];
        if (t) {
          const keywordPos: Record<string, number> = {};
          for (const row of (byQuery?.rows ?? []) as { keys: string[]; position: number }[]) {
            keywordPos[row.keys[0]] = row.position;
          }
          current = {
            avgPosition: t.position,
            clicks:      t.clicks,
            impressions: t.impressions,
            ctr:         t.ctr * 100,
            keywordPos,
          };
        }
      }
    }

    const baselineMetrics = strategy.baseline_metrics;
    const baseline: BaselineGsc | null = baselineMetrics?.gsc
      ? {
          avgPosition: baselineMetrics.gsc.avgPosition,
          clicks:      baselineMetrics.gsc.clicks,
          impressions: baselineMetrics.gsc.impressions,
          ctr:         baselineMetrics.gsc.ctr,
        }
      : null;

    // Prefer the baseline's own capture time; fall back to row creation.
    const activatedAt = baselineMetrics?.capturedAt ?? strategy.created_at;

    const retro = buildRetrospective({
      activatedAt,
      baseline,
      current,
      keywords,
      checklistTotal: checklist.length,
      checklistDone:  checklist.filter(c => c.is_completed).length,
      strategyTitle:  strategy.title,
    });

    return NextResponse.json({
      success: true,
      strategy: { id: strategy.id, title: strategy.title, isActive: strategy.is_active },
      ...retro,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[strategies/retrospective]", message);
    return NextResponse.json({ success: false, reason: "api_error", message });
  }
}
