// lib/google-oauth.ts
// =============================================================================
// AI Marketing Lab — per-user Google OAuth
//
// Each user authorises us to read *their own* Analytics and Search Console
// data. We hold no credential of our own for their properties, and there's no
// manual "add this service account as a Viewer" step — which was the biggest
// onboarding failure point in the previous model.
//
// Scopes requested (both read-only — we can never write to their account):
//   analytics.readonly   — GA4 Data API + Admin API (property listing)
//   webmasters.readonly  — Search Console
//   userinfo.email       — so Settings can show which account is connected
//
// Required env:
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   SUPABASE_SERVICE_ROLE_KEY   — token table is service-role only (see 009)
//   APP_URL                     — must exactly match the redirect URI
//                                 registered in Google Cloud Console
// =============================================================================

import { createClient } from "@supabase/supabase-js";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

/**
 * Google Business Profile. Requested separately and only on request — never
 * added to GOOGLE_SCOPES.
 *
 * Two reasons. It's a restricted scope, so bundling it would drag every user
 * through a heavier consent screen and subject the whole app to a stricter
 * verification review, even for the majority who have no Business Profile.
 * And asking for a permission before there's a reason to is how you train
 * people to click through consent screens without reading them.
 *
 * Granted incrementally: include_granted_scopes preserves the existing grants,
 * so authorising this adds to the connection rather than replacing it.
 */
export const GOOGLE_BUSINESS_SCOPE = "https://www.googleapis.com/auth/business.manage";

const AUTH_ENDPOINT  = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

// ─── config ──────────────────────────────────────────────────────────────────

export function oauthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function appBaseUrl(): string {
  const explicit = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const domain = process.env.NEXT_PUBLIC_SITE_DOMAIN || "aimarketinglab.co.uk";
  return `https://${domain}`;
}

/** Must byte-for-byte match an Authorised redirect URI in Google Cloud Console. */
export function redirectUri(): string {
  return `${appBaseUrl()}/api/auth/google/callback`;
}

// ─── service-role Supabase client ────────────────────────────────────────────
// google_connections has RLS on with no permissive policy, so the anon client
// can't touch it at all. Everything here goes through the service role, which
// bypasses RLS. This client must never be constructed in browser code.

function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── consent URL ─────────────────────────────────────────────────────────────

/**
 * Build the Google consent URL.
 *
 * access_type=offline + prompt=consent is deliberate: Google returns a refresh
 * token only on the first authorisation for a given client/user pair. Without
 * prompt=consent, a user who reconnects gets an access token but NO refresh
 * token, and their connection silently dies an hour later. Forcing the consent
 * screen every time costs one extra click and removes that entire failure mode.
 */
export function buildConsentUrl(state: string, extraScopes: string[] = []): string {
  // Dedupe so re-requesting an already-granted scope doesn't produce a URL with
  // it listed twice, which Google accepts but which makes logs harder to read.
  const scopes = [...new Set([...GOOGLE_SCOPES, ...extraScopes])];

  const params = new URLSearchParams({
    client_id:              process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    redirect_uri:           redirectUri(),
    response_type:          "code",
    scope:                  scopes.join(" "),
    access_type:            "offline",
    prompt:                 "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** True when the stored connection carries the given scope. */
export function connectionHasScope(scopes: string | null | undefined, scope: string): boolean {
  if (!scopes) return false;
  return scopes.split(/\s+/).includes(scope);
}

// ─── token exchange + refresh ────────────────────────────────────────────────

type TokenResponse = {
  access_token:  string;
  refresh_token?: string;
  expires_in:    number;
  scope?:        string;
  token_type:    string;
  error?:            string;
  error_description?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams(body),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || data.error) {
    throw new Error(
      `Google token endpoint ${res.status}: ${data.error_description ?? data.error ?? "unknown error"}`
    );
  }
  return data;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  return postToken({
    code,
    client_id:     process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    redirect_uri:  redirectUri(),
    grant_type:    "authorization_code",
  });
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return postToken({
    refresh_token: refreshToken,
    client_id:     process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    grant_type:    "refresh_token",
  });
}

/** Look up the email on the token so Settings can show which account is linked. */
export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.email as string) ?? null;
  } catch {
    return null;
  }
}

// ─── persistence ─────────────────────────────────────────────────────────────

export type GoogleConnection = {
  user_id:       string;
  access_token:  string;
  refresh_token: string | null;
  expires_at:    string;
  scopes:        string;
  google_email:  string | null;
};

export async function saveConnection(userId: string, token: TokenResponse, email: string | null) {
  const sb = adminSupabase();
  const expiresAt = new Date(Date.now() + (token.expires_in - 60) * 1000).toISOString();

  // Read first so we can preserve an existing refresh token. Google omits
  // refresh_token on re-authorisation in some flows; blindly upserting null
  // would silently break the connection at the next expiry.
  const { data: existing } = await sb
    .from("google_connections")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();

  const prevRefresh = (existing as { refresh_token: string | null } | null)?.refresh_token ?? null;

  const { error } = await sb
    .from("google_connections")
    .upsert({
      user_id:       userId,
      access_token:  token.access_token,
      refresh_token: token.refresh_token ?? prevRefresh,
      expires_at:    expiresAt,
      scopes:        token.scope ?? "",
      google_email:  email,
    } as never, { onConflict: "user_id" });

  if (error) throw new Error(`Could not save Google connection: ${error.message}`);
}

export async function getConnection(userId: string): Promise<GoogleConnection | null> {
  const sb = adminSupabase();
  const { data } = await sb
    .from("google_connections")
    .select("user_id, access_token, refresh_token, expires_at, scopes, google_email")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as GoogleConnection | null) ?? null;
}

export async function deleteConnection(userId: string): Promise<void> {
  const sb = adminSupabase();
  const conn = await getConnection(userId);

  // Best-effort revoke at Google's end so the grant disappears from the user's
  // account permissions page too, not just from our database.
  if (conn?.refresh_token) {
    try {
      await fetch(REVOKE_ENDPOINT, {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:    new URLSearchParams({ token: conn.refresh_token }),
      });
    } catch { /* revocation is advisory — proceed with local delete regardless */ }
  }

  await sb.from("google_connections").delete().eq("user_id", userId);
}

// ─── the function every API route actually calls ─────────────────────────────

export type TokenResult =
  | { ok: true;  accessToken: string }
  | { ok: false; reason: "not_connected" | "reauth_required" | "not_configured"; message: string };

/**
 * Return a usable access token for this user, refreshing if it's expired.
 *
 * Callers should branch on `reason` rather than treating every failure as an
 * error: "not_connected" is a normal state for a new user and should render an
 * empty state, whereas "reauth_required" means the stored refresh token was
 * revoked (user removed access in their Google account, or changed password)
 * and the UI should prompt them to reconnect.
 */
export async function getValidAccessToken(userId: string): Promise<TokenResult> {
  if (!oauthConfigured()) {
    return { ok: false, reason: "not_configured", message: "Google sign-in is not set up on this deployment." };
  }

  const conn = await getConnection(userId);
  if (!conn) {
    return { ok: false, reason: "not_connected", message: "No Google account connected yet." };
  }

  // Still valid (saveConnection already subtracted a 60s safety margin).
  if (new Date(conn.expires_at).getTime() > Date.now()) {
    return { ok: true, accessToken: conn.access_token };
  }

  if (!conn.refresh_token) {
    return {
      ok: false,
      reason: "reauth_required",
      message: "Your Google connection expired and can't be renewed automatically. Please reconnect.",
    };
  }

  try {
    const refreshed = await refreshAccessToken(conn.refresh_token);
    await saveConnection(userId, refreshed, conn.google_email);
    return { ok: true, accessToken: refreshed.access_token };
  } catch (e) {
    // invalid_grant means the refresh token is dead — revoked, expired after
    // long disuse, or invalidated by a password change. Only a fresh consent
    // fixes it, so surface that rather than retrying.
    const msg = (e as Error).message;
    if (/invalid_grant/i.test(msg)) {
      return {
        ok: false,
        reason: "reauth_required",
        message: "Google access was revoked or expired. Please reconnect your account.",
      };
    }
    throw e;
  }
}

// ─── transition helper ───────────────────────────────────────────────────────

/**
 * Resolve a token for a data API call, preferring the user's own OAuth
 * connection and falling back to the legacy shared service account.
 *
 * The fallback exists so this change doesn't break the deployment mid-migration:
 * if OAuth env vars aren't set yet, or a user hasn't connected, an existing
 * service-account setup keeps working exactly as before. Once every user has
 * connected their own account, GA4_SERVICE_ACCOUNT_KEY can be deleted and this
 * branch removed.
 *
 * `source` is returned so routes can tell the UI which path served the data —
 * useful for nudging remaining users onto OAuth.
 */
export async function resolveGoogleToken(
  userId: string,
  serviceAccountScope: string,
): Promise<
  | { ok: true;  accessToken: string; source: "oauth" | "service_account" }
  | { ok: false; reason: "not_connected" | "reauth_required" | "not_configured"; message: string }
> {
  if (oauthConfigured()) {
    const conn = await getConnection(userId);
    if (conn) {
      const t = await getValidAccessToken(userId);
      return t.ok
        ? { ok: true, accessToken: t.accessToken, source: "oauth" }
        : t;
    }
  }

  // Legacy path — shared service account, requires the user to have granted it
  // Viewer access on their property.
  if (process.env.GA4_SERVICE_ACCOUNT_KEY) {
    const { getGoogleAccessToken } = await import("@/lib/google-auth");
    try {
      const accessToken = await getGoogleAccessToken(serviceAccountScope);
      return { ok: true, accessToken, source: "service_account" };
    } catch (e) {
      return { ok: false, reason: "not_configured", message: (e as Error).message };
    }
  }

  return {
    ok: false,
    reason: "not_connected",
    message: "Connect your Google account under Settings to see your data.",
  };
}
