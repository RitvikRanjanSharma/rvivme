// app/api/keywords/buckets/route.ts
// =============================================================================
// AI Marketing Lab — the keyword planner view
//
// Joins three things the product already had and never introduced to each
// other:
//
//   Search Console  what you actually appear for, with position and CTR
//   /opportunities  the analysis engine — CTR curve, scaled thresholds, decay
//   tracked_keywords  the watchlist the user has been building all along
//
// The result is the same data /opportunities works from, organised by keyword
// instead of by action. See lib/keyword-buckets.ts for why the classification
// defers to the opportunity engine rather than re-deriving its thresholds.
//
// WHY THE OPPORTUNITY LIMIT IS RAISED
//
// /opportunities returns the top 25, because a person acting on a list wants
// the top of it. Bucketing wants every classified query, so the limit goes to
// 500 here. Same engine, different question.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import { callerGscSite } from "@/lib/caller-site";
import { resolveGoogleToken } from "@/lib/google-oauth";
import {
  searchAnalytics, toQueryRow, toQueryPageRow, periodPair, GSC_SCOPE,
} from "@/lib/gsc-query";
import { buildReport, brandTokensFromSite, type QueryRow, type QueryPageRow } from "@/lib/opportunities";
import { classifyKeywords, competitorTokensFrom, BUCKETS, type WatchRow } from "@/lib/keyword-buckets";

export const dynamic = "force-dynamic";
// Three Search Console calls plus two small database reads.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const caller = await getCallerOrNull();
    if (!caller) {
      return NextResponse.json({ success: false, reason: "unauthenticated" }, { status: 401 });
    }

    const site = await callerGscSite(caller.supabase, caller.user.id);
    if (!site.ok) {
      return NextResponse.json({
        success: false, reason: site.reason,
        message: site.reason === "not_configured"
          ? "Connect Search Console under Settings → Integrations. Every bucket here is derived from queries you actually appear for."
          : site.message,
      });
    }
    const siteUrl = site.siteUrl;

    const tokenResult = await resolveGoogleToken(caller.user.id, GSC_SCOPE);
    if (!tokenResult.ok) {
      return NextResponse.json({
        success: false,
        reason:  tokenResult.reason === "reauth_required" ? "reauth_required" : "not_connected",
        message: tokenResult.message,
      });
    }
    const token = tokenResult.accessToken;

    const range = periodPair(28);

    // Search Console and the user's own lists, together. The watchlist and the
    // competitor list are small local reads, so they cost nothing to include.
    const [currentRaw, previousRaw, queryPageRaw, watchRes, compRes] = await Promise.all([
      searchAnalytics(siteUrl, token, {
        ...range.current, searchType: "web", dimensions: ["query"], rowLimit: 1000,
      }),
      // Losing the previous period costs us decay detection and nothing else,
      // so it must not sink the report.
      searchAnalytics(siteUrl, token, {
        ...range.previous, searchType: "web", dimensions: ["query"], rowLimit: 1000,
      }).catch(() => []),
      searchAnalytics(siteUrl, token, {
        ...range.current, searchType: "web", dimensions: ["query", "page"], rowLimit: 2000,
      }).catch(() => []),
      caller.supabase
        .from("tracked_keywords")
        .select("keyword, source, notes")
        .eq("user_id", caller.user.id),
      caller.supabase
        .from("competitors")
        .select("domain")
        .eq("user_id", caller.user.id)
        .eq("is_active", true),
    ]);

    const queries: QueryRow[]         = currentRaw.map(toQueryRow);
    const previous: QueryRow[]        = previousRaw.map(toQueryRow);
    const queryPages: QueryPageRow[]  = queryPageRaw.map(r => toQueryPageRow(r, siteUrl));

    const watchlist = ((watchRes.data ?? []) as WatchRow[]);
    const competitorDomains = ((compRes.data ?? []) as Array<{ domain: string }>)
      .map(c => c.domain).filter(Boolean);

    if (queries.length === 0 && watchlist.length === 0) {
      // Neither half exists. Classifying nothing into nine empty buckets would
      // render as a working feature that found no keywords, which is a claim
      // about the site rather than about our data.
      return NextResponse.json({
        success: false, reason: "no_data",
        message: "Search Console has no queries for your site in this period, and your watchlist is empty. There is nothing to sort yet — the buckets fill in as impressions arrive.",
      });
    }

    // Every classified query, not the top 25 — see the note above.
    const report = buildReport({ queries, queryPages, previous, limit: 500, siteUrl });

    const buckets = classifyKeywords({
      queries,
      opportunities:    report.opportunities,
      watchlist,
      brandTokens:      brandTokensFromSite(siteUrl),
      competitorTokens: competitorTokensFrom(competitorDomains),
      period:           "last 28 days",
    });

    return NextResponse.json({
      success: true,
      ...buckets,
      // Sent so the page can label each bucket with what it means rather than
      // leaving the reader to infer it from a colour.
      meta: BUCKETS,
      // Named plainly: this is 28 days of one property, and a report built on
      // twelve queries deserves less weight than one built on eight hundred.
      scale: report.scale,
      brand: report.brand,
      curve: report.curve,
      period: range.current,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[keywords/buckets]", message);
    return NextResponse.json({ success: false, reason: "api_error", message });
  }
}
