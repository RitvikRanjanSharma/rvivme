// app/api/integrations/status/route.ts
// =============================================================================
// AI Marketing Lab — Integrations Status (per-user)
// Lightweight connection probe for the Settings page. Returns "connected"
// when the server has the necessary service-account credentials AND the
// current caller has stored their own GSC / GA4 pointer in public.users.
// Never hits the downstream APIs — this is meant to be fast and safe to poll.
// =============================================================================

import { NextResponse } from "next/server";
import { parseServiceAccountKey } from "@/lib/google-auth";
import { getCallerOrNull } from "@/lib/supabase-server";

type Status = "connected" | "disconnected";

function ok(val: string | undefined | null): boolean {
  return Boolean(val && String(val).trim().length > 0);
}

// Server has a valid service-account key (shared across all workspaces since
// we run Google Analytics through a single app-owned account).
function serviceAccountOk(): boolean {
  if (!ok(process.env.GA4_SERVICE_ACCOUNT_KEY)) return false;
  try { parseServiceAccountKey(process.env.GA4_SERVICE_ACCOUNT_KEY); }
  catch { return false; }
  return true;
}

function dfsStatus(): Status {
  return ok(process.env.DATAFORSEO_LOGIN) && ok(process.env.DATAFORSEO_PASSWORD)
    ? "connected"
    : "disconnected";
}

function anthropicStatus(): Status {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!ok(k)) return "disconnected";
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
  // Per-user GSC/GA4 requires a signed-in caller. Unauthenticated pings just
  // see everything Google-shaped as "disconnected" — but we still report the
  // Supabase / Anthropic / DataForSEO side so the Settings page can render.
  const caller = await getCallerOrNull();

  let ga4: Status = "disconnected";
  let gsc: Status = "disconnected";

  if (caller && serviceAccountOk()) {
    const { data } = await caller.supabase
      .from("users")
      .select("gsc_site_url, ga4_property_id")
      .eq("id", caller.user.id)
      .single();
    const row = data as { gsc_site_url: string | null; ga4_property_id: string | null } | null;

    if (ok(row?.ga4_property_id))  ga4 = "connected";
    if (ok(row?.gsc_site_url))     gsc = "connected";
  }

  return NextResponse.json({
    success:    true,
    ga4,
    gsc,
    dataforseo: dfsStatus(),
    anthropic:  anthropicStatus(),
    supabase:   supabaseStatus(),
  });
}
