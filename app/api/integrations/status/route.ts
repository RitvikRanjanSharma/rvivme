// app/api/integrations/status/route.ts
// =============================================================================
// AI Marketing Lab — Integrations Status
// Lightweight connection probe for the Settings page. Returns "connected" only
// when the required credentials are actually present on the server. Never hits
// the downstream APIs — this is meant to be fast and safe to poll.
// =============================================================================

import { NextResponse } from "next/server";

type Status = "connected" | "disconnected";

function ok(val: string | undefined | null): boolean {
  return Boolean(val && String(val).trim().length > 0);
}

function ga4Status(): Status {
  const hasKey  = ok(process.env.GA4_SERVICE_ACCOUNT_KEY);
  const hasProp = ok(process.env.GA4_PROPERTY_ID);
  if (!hasKey || !hasProp) return "disconnected";
  // Shallow JSON validity check so a malformed key registers as disconnected.
  try { JSON.parse(process.env.GA4_SERVICE_ACCOUNT_KEY as string); }
  catch { return "disconnected"; }
  return "connected";
}

function gscStatus(): Status {
  // GSC reuses GA4's service account — no extra credentials required.
  return ga4Status();
}

function dfsStatus(): Status {
  return ok(process.env.DATAFORSEO_LOGIN) && ok(process.env.DATAFORSEO_PASSWORD)
    ? "connected"
    : "disconnected";
}

export async function GET() {
  return NextResponse.json({
    success:    true,
    ga4:        ga4Status(),
    gsc:        gscStatus(),
    dataforseo: dfsStatus(),
  });
}
