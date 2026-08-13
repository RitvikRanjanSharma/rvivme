// app/api/auth/google/callback/route.ts
// =============================================================================
// Google redirects here after the consent screen.
//
// Validates the CSRF state, exchanges the code for tokens, stores them, and
// bounces back to Settings with a status in the query string so the UI can
// show a result. Errors are surfaced as a `google_error` param rather than a
// raw 500 page — this is a user-facing redirect target, not an API call.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import {
  exchangeCode, saveConnection, fetchGoogleEmail,
  appBaseUrl, oauthConfigured,
} from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

function settingsRedirect(params: Record<string, string>) {
  const url = new URL(`${appBaseUrl()}/settings`);
  url.searchParams.set("tab", "integrations");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url.toString());
  // State cookie has done its job either way.
  res.cookies.delete("aiml_oauth_state");
  return res;
}

export async function GET(request: NextRequest) {
  const url    = new URL(request.url);
  const code   = url.searchParams.get("code");
  const state  = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  // User pressed "Cancel" on the consent screen — not an error worth shouting about.
  if (denied) {
    return settingsRedirect({ google: "cancelled" });
  }

  if (!oauthConfigured()) {
    return settingsRedirect({ google_error: "not_configured" });
  }

  const caller = await getCallerOrNull();
  if (!caller) {
    return settingsRedirect({ google_error: "session_expired" });
  }

  // CSRF check — the state Google echoed back must match our cookie.
  const cookieState = request.cookies.get("aiml_oauth_state")?.value;
  if (!state || !cookieState || state !== cookieState) {
    return settingsRedirect({ google_error: "state_mismatch" });
  }

  if (!code) {
    return settingsRedirect({ google_error: "missing_code" });
  }

  try {
    const token = await exchangeCode(code);
    const email = await fetchGoogleEmail(token.access_token);
    await saveConnection(caller.user.id, token, email);
    return settingsRedirect({ google: "connected" });
  } catch (err) {
    console.error("[auth/google/callback]", (err as Error).message);
    return settingsRedirect({ google_error: "exchange_failed" });
  }
}
