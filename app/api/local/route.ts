// app/api/local/route.ts
// =============================================================================
// AI Marketing Lab — local search analysis
//
// Layer 1 only: Search Console data the user has already connected, plus the
// HTML their own site already serves. No new permission, no new vendor, works
// for everybody from the moment they connect Google.
//
// The Business Profile layer lives at /api/local/business and is additive —
// this route must never fail because a profile isn't connected, since most
// users will never get past Google's API access review.
//
// Response:
//   200 { success: true, diagnosis, demand, locality, signals, page }
//   200 { success: false, reason, message }
//   401 unauthenticated
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull }    from "@/lib/supabase-server";
import { resolveGoogleToken } from "@/lib/google-oauth";
import { originCandidates, fetchAcrossOrigins } from "@/lib/site-fetch";
import {
  summariseLocalDemand, inferLocality, scoreLocalSignals, diagnoseLocal,
  type LocalSignalReport,
} from "@/lib/local-seo";
import type { QueryRow } from "@/lib/opportunities";

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";
const GSC_SCOPE    = "https://www.googleapis.com/auth/webmasters.readonly";

// Matching the opportunities route: Search Console finalises on a ~2 day lag,
// so ending "today" would always show a partial tail.
const LAG_DAYS = 2;
const PERIOD   = 90;   // longer than the opportunities window — local queries
                       // are lower volume, and 28 days often isn't enough to
                       // tell a pattern from a coincidence.

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const caller = await getCallerOrNull();
    if (!caller) {
      return NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 });
    }

    const { data } = await caller.supabase
      .from("users").select("gsc_site_url").eq("id", caller.user.id).single();
    const siteUrl = (data as { gsc_site_url: string | null } | null)?.gsc_site_url?.trim();

    if (!siteUrl) {
      return NextResponse.json({
        success: false,
        reason:  "not_configured",
        message: "Connect Search Console under Settings to see your local search picture.",
      });
    }

    const tokenResult = await resolveGoogleToken(caller.user.id, GSC_SCOPE);
    if (!tokenResult.ok) {
      return NextResponse.json({
        success: false,
        reason:  tokenResult.reason === "reauth_required" ? "reauth_required" : "not_connected",
        message: tokenResult.message,
      });
    }

    // ── Search Console: queries over the window ──────────────────────────────
    const res = await fetch(
      `${GSC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${tokenResult.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate:  isoDaysAgo(LAG_DAYS + PERIOD),
          endDate:    isoDaysAgo(LAG_DAYS),
          dimensions: ["query"],
          rowLimit:   5000,
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[api/local] GSC", res.status, body.slice(0, 300));
      return NextResponse.json({
        success: false,
        reason:  "api_error",
        message: `Search Console returned ${res.status}.`,
      });
    }

    const json = await res.json();
    const rows: QueryRow[] = ((json.rows ?? []) as Array<{
      keys: string[]; clicks: number; impressions: number; ctr: number; position: number;
    }>).map(r => ({
      query:       r.keys[0],
      clicks:      r.clicks,
      impressions: r.impressions,
      ctr:         r.ctr * 100,   // Google sends 0-1; the engine works in percent
      position:    r.position,
    }));

    const demand   = summariseLocalDemand(rows);
    const locality = inferLocality(rows);

    // ── The site's own HTML: local signals a crawler can read ────────────────
    // A failure here must not sink the whole report — the Search Console half
    // stands on its own, and returning nothing because a fetch timed out would
    // throw away the more valuable analysis.
    let signals: LocalSignalReport | null = null;
    let pageState: { state: string; url: string; detail: string | null } | null = null;

    const candidates = originCandidates(siteUrl);
    if (candidates.length > 0) {
      const { result, origin } = await fetchAcrossOrigins(candidates, "/");
      pageState = {
        state:  result.kind === "ok" ? "ok" : result.kind,
        url:    origin,
        detail: result.kind === "unreachable" ? result.detail
              : result.kind === "absent"      ? `the server returned ${result.status}`
              : null,
      };
      if (result.kind === "ok") signals = scoreLocalSignals(result.text);
    }

    const diagnosis = diagnoseLocal(demand, locality, signals);

    return NextResponse.json({
      success: true,
      diagnosis,
      demand,
      locality,
      signals,
      page: pageState,
      period: {
        days:      PERIOD,
        startDate: isoDaysAgo(LAG_DAYS + PERIOD),
        endDate:   isoDaysAgo(LAG_DAYS),
        queryCount: rows.length,
      },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[api/local]", message);
    return NextResponse.json({ success: false, reason: "api_error", message });
  }
}
