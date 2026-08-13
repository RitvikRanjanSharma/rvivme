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

  // Two distinct things can fail here and they have completely different fixes,
  // so they get distinct error codes rather than one catch-all.
  let token;
  try {
    token = await exchangeCode(code);
  } catch (err) {
    // Google rejected the code→token swap. Almost always a wrong
    // GOOGLE_OAUTH_CLIENT_SECRET, or a redirect_uri that differs between the
    // consent request and this exchange (they must match exactly).
    console.error("[auth/google/callback] token exchange failed:", (err as Error).message);
    return settingsRedirect({ google_error: "exchange_failed" });
  }

  try {
    const email = await fetchGoogleEmail(token.access_token);
    await saveConnection(caller.user.id, token, email);
    return settingsRedirect({ google: "connected" });
  } catch (err) {
    // Google was happy; we failed to persist. Usually the google_connections
    // table doesn't exist (migration 009 not run) or SUPABASE_SERVICE_ROLE_KEY
    // is missing/incorrect — that table is service-role only by design.
    const msg = (err as Error).message ?? "";
    console.error("[auth/google/callback] save failed:", msg);

    if (/relation .*google_connections.* does not exist|could not find the table/i.test(msg)) {
      return settingsRedirect({ google_error: "table_missing" });
    }
    if (/service role|invalid api key|jwt/i.test(msg)) {
      return settingsRedirect({ google_error: "service_role" });
    }
    return settingsRedirect({ google_error: "save_failed" });
  }
}
