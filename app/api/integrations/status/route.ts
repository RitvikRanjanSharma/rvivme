// app/api/integrations/status/route.ts
// =============================================================================
// AI Marketing Lab — Integrations Status
// Lightweight connection probe for the Settings page. Returns "connected" only
// when the required credentials are actually present on the server. Never hits
// the downstream APIs — this is meant to be fast and safe to poll.
// =============================================================================

import { NextResponse } from "next/server";
import { parseServiceAccountKey } from "@/lib/google-auth";

type Status = "connected" | "disconnected";

function ok(val: string | undefined | null): boolean {
  return Boolean(val && String(val).trim().length > 0);
}

function ga4Status(): Status {
  const hasKey  = ok(process.env.GA4_SERVICE_ACCOUNT_KEY);
  const hasProp = ok(process.env.GA4_PROPERTY_ID);
  if (!hasKey || !hasProp) return "disconnected";
  // Use the forgiving parser so a key pasted with literal newlines inside the
  // `private_key` field (a very common .env footgun) still registers as valid.
  try { parseServiceAccountKey(process.env.GA4_SERVICE_ACCOUNT_KEY); }
  catch { return "disconnected"; }
  return "connected";
}

function gscStatus(): Status {
  // GSC reuses GA4's service account + a site URL.
  if (ga4Status() !== "connected") return "disconnected";
  return ok(process.env.GSC_SITE_URL) ? "connected" : "disconnected";
}

function dfsStatus(): Status {
  return ok(process.env.DATAFORSEO_LOGIN) && ok(process.env.DATAFORSEO_PASSWORD)
    ? "connected"
    : "disconnected";
}

function anthropicStatus(): Status {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!ok(k)) return "disconnected";
  // Anthropic keys start with "sk-ant-" — a light shape check catches keys
  // that were accidentally truncated or contain stray quote characters.
  const trimmed = String(k).trim();
  if (!trimmed.startsWith("sk-ant-")) return "disconnected";
  if (trimmed.length < 20) return "disconnected";
  return "connected";
}

function supabaseStatus(): Status {
  return ok(process.env.NEXT_PUBLIC_SUPABASE_URL) && ok(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    ? "connected"
    : "disconnected";
}

export async function GET() {
  return NextResponse.json({
    success:    true,
    ga4:        ga4Status(),
    gsc:        gscStatus(),
    dataforseo: dfsStatus(),
    anthropic:  anthropicStatus(),
    supabase:   supabaseStatus(),
  });
}
