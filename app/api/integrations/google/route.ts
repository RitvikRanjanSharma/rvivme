// app/api/integrations/google/route.ts
// =============================================================================
// Connection status + the caller's available GA4 properties and Search Console
// sites.
//
// Listing properties is the real payoff of moving to per-user OAuth: with the
// user's own token we can enumerate what they actually have access to, so
// Settings offers a dropdown instead of asking them to hunt down a numeric
// property ID in the GA4 admin UI (and reject the G-XXXX measurement ID they
// usually find first).
//
// Returns only non-sensitive fields. Tokens never leave the server.
// =============================================================================

import { NextResponse } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import { googleFetch } from "@/lib/outbound-fetch";
import {
  getConnection, getValidAccessToken, oauthConfigured,
} from "@/lib/google-oauth";

export const dynamic = "force-dynamic";
// Declared so a slow upstream fails as a timeout rather than as a killed
// process. A killed function returns nothing at all, which the UI cannot
// distinguish from an empty result.
export const maxDuration = 30;

type Ga4Property = { id: string; name: string; account?: string };
type GscSite     = { siteUrl: string; permissionLevel: string };

/** GA4 Admin API — every property the user can see, across all their accounts. */
async function listGa4Properties(accessToken: string): Promise<Ga4Property[]> {
  const out: Ga4Property[] = [];

  // accountSummaries bundles accounts and their properties in one call, which
  // avoids an N+1 over accounts.
  const res = await googleFetch(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return out;

  const data = await res.json();
  for (const account of data?.accountSummaries ?? []) {
    for (const p of account?.propertySummaries ?? []) {
      // property is "properties/123456789" — the Data API wants the bare number.
      const id = String(p?.property ?? "").replace(/^properties\//, "");
      if (!id) continue;
      out.push({
        id,
        name:    p?.displayName ?? id,
        account: account?.displayName ?? undefined,
      });
    }
  }
  return out;
}

/** Search Console — every site the user has any level of access to. */
async function listGscSites(accessToken: string): Promise<GscSite[]> {
  const res = await googleFetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.siteEntry ?? [])
    .map((s: { siteUrl?: string; permissionLevel?: string }) => ({
      siteUrl:         s?.siteUrl ?? "",
      permissionLevel: s?.permissionLevel ?? "",
    }))
    .filter((s: GscSite) => s.siteUrl)
    // siteUnverifiedUser can't read data — offering it would just produce a
    // confusing 403 later.
    .filter((s: GscSite) => s.permissionLevel !== "siteUnverifiedUser");
}

export async function GET() {
  const caller = await getCallerOrNull();
  if (!caller) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!oauthConfigured()) {
    return NextResponse.json({
      success:    true,
      configured: false,
      connected:  false,
      message:    "Google sign-in isn't set up on this deployment.",
    });
  }

  const conn = await getConnection(caller.user.id);
  if (!conn) {
    return NextResponse.json({ success: true, configured: true, connected: false });
  }

  const token = await getValidAccessToken(caller.user.id);
  if (!token.ok) {
    return NextResponse.json({
      success:      true,
      configured:   true,
      connected:    token.reason !== "not_connected",
      needsReauth:  token.reason === "reauth_required",
      googleEmail:  conn.google_email,
      message:      token.message,
    });
  }

  // Fetch both lists in parallel; a failure on either shouldn't blank the page.
  const [ga4Properties, gscSites] = await Promise.all([
    listGa4Properties(token.accessToken).catch(() => [] as Ga4Property[]),
    listGscSites(token.accessToken).catch(()   => [] as GscSite[]),
  ]);

  return NextResponse.json({
    success:     true,
    configured:  true,
    connected:   true,
    needsReauth: false,
    googleEmail: conn.google_email,
    scopes:      conn.scopes,
    ga4Properties,
    gscSites,
  });
}
