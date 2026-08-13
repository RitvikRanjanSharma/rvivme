// app/api/auth/google/start/route.ts
// =============================================================================
// Kicks off the Google OAuth consent flow.
//
// CSRF: we generate a random `state`, set it in a short-lived HttpOnly cookie,
// and send the same value to Google. The callback only proceeds if the value
// Google returns matches the cookie. Without this, an attacker could feed a
// victim a crafted callback URL and attach their own Google account to the
// victim's workspace.
// =============================================================================

import { NextResponse } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import { buildConsentUrl, oauthConfigured } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const caller = await getCallerOrNull();
  if (!caller) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!oauthConfigured()) {
    return NextResponse.json(
      {
        success: false,
        reason:  "not_configured",
        message: "Google sign-in isn't set up on this deployment. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 200 },
    );
  }

  const state = crypto.randomUUID();
  const res   = NextResponse.redirect(buildConsentUrl(state));

  res.cookies.set("aiml_oauth_state", state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",   // must survive the cross-site redirect back from Google
    path:     "/",
    maxAge:   600,     // 10 minutes is ample for a consent screen
  });

  return res;
}
