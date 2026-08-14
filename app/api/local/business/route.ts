// app/api/local/business/route.ts
// =============================================================================
// AI Marketing Lab — Google Business Profile (Layer 2)
//
// Additive by design. /api/local carries the module on its own; this endpoint
// adds profile completeness and Maps/Search performance when the user has got
// through both of Google's gates (see lib/google-business.ts).
//
// It reports WHICH gate blocks them, because "couldn't load your profile" is
// useless when the fix is a form Google reviews by hand.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import {
  getValidAccessToken, getConnection, connectionHasScope,
  GOOGLE_BUSINESS_SCOPE,
} from "@/lib/google-oauth";
import {
  listAccounts, listLocations, fetchLocationPerformance, scoreProfile,
  type BusinessLocation, type MetricTotals,
} from "@/lib/google-business";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const caller = await getCallerOrNull();
    if (!caller) {
      return NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 });
    }

    const connection = await getConnection(caller.user.id);
    if (!connection) {
      return NextResponse.json({
        success: false,
        reason:  "not_connected",
        message: "Connect your Google account under Settings first.",
      });
    }

    // Check the granted scope before spending a request. A 403 would tell us
    // the same thing eventually, but far less precisely — Google returns 403
    // for at least three unrelated conditions here.
    if (!connectionHasScope(connection.scopes, GOOGLE_BUSINESS_SCOPE)) {
      return NextResponse.json({
        success: false,
        reason:  "scope_missing",
        message: "Business Profile access hasn't been granted yet.",
      });
    }

    const token = await getValidAccessToken(caller.user.id);
    if (!token.ok) {
      return NextResponse.json({
        success: false,
        reason:  token.reason === "reauth_required" ? "reauth_required" : "not_connected",
        message: token.message,
      });
    }

    const accounts = await listAccounts(token.accessToken);
    if (!accounts.ok) {
      return NextResponse.json({ success: false, reason: accounts.reason, message: accounts.message });
    }

    // Locations can be spread across several accounts (personal plus an agency
    // group, typically). Gather them all rather than assuming the first.
    const locations: BusinessLocation[] = [];
    let lastFailure: { reason: string; message: string } | null = null;

    for (const account of accounts.data) {
      const r = await listLocations(token.accessToken, account.name);
      if (r.ok) locations.push(...r.data);
      else lastFailure = { reason: r.reason, message: r.message };
    }

    if (locations.length === 0) {
      return NextResponse.json({
        success: false,
        reason:  lastFailure?.reason ?? "no_profile",
        message: lastFailure?.message
          ?? "No locations found on the Business Profiles this account manages.",
      });
    }

    // Performance for the primary location only. Pulling every location would
    // multiply requests against a strict quota for information the user hasn't
    // asked for yet — they pick a location in the UI if they have several.
    const requested = new URL(request.url).searchParams.get("location");
    const primary =
      locations.find(l => l.name === requested) ?? locations[0];

    let performance: { totals: MetricTotals; days: number } | null = null;
    let performanceError: string | null = null;

    const perf = await fetchLocationPerformance(token.accessToken, primary.name, 30);
    if (perf.ok) performance = perf.data;
    else performanceError = perf.message;

    return NextResponse.json({
      success: true,
      locations: locations.map(l => ({
        name:     l.name,
        title:    l.title ?? "Untitled location",
        locality: l.storefrontAddress?.locality ?? null,
        category: l.categories?.primaryCategory?.displayName ?? null,
      })),
      selected: primary.name,
      profile:  scoreProfile(primary),
      performance,
      performanceError,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[api/local/business]", message);
    return NextResponse.json({ success: false, reason: "api_error", message });
  }
}
