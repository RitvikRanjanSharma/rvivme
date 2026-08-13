-- 009_google_oauth_connections.sql
-- =============================================================================
-- AI Marketing Lab — per-user Google OAuth connections
--
-- Replaces the shared service-account model. Previously one app-owned service
-- account read every workspace's data, and each user had to manually grant it
-- Viewer access on their own GA4 property and Search Console site. That put a
-- credential in our hands that we didn't want to hold, and the manual grant
-- step was the single biggest onboarding failure point.
--
-- Now each user authorises us directly via Google OAuth and we store their
-- tokens here.
--
-- SECURITY — read this before changing the policies below:
--   A refresh token is a long-lived credential that can mint access tokens
--   until explicitly revoked. It must never reach the browser. So unlike
--   every other table in this schema, there is NO policy granting the
--   authenticated role access. RLS is enabled with no permissive policy,
--   which denies anon and authenticated outright. Only the service role
--   (server-side, via SUPABASE_SERVICE_ROLE_KEY) can read or write.
--
--   The UI never queries this table. It calls /api/integrations/google/status,
--   which returns only booleans and the connected Google account's email.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.google_connections (
  user_id        UUID        PRIMARY KEY
                             REFERENCES public.users (id) ON DELETE CASCADE,

  -- Short-lived (typically 1 hour). Refreshed on demand server-side.
  access_token   TEXT        NOT NULL,
  -- Long-lived. Google only returns this on the FIRST consent unless the
  -- consent screen is re-prompted, so we never overwrite a non-null value
  -- with null — see lib/google-oauth.ts saveConnection().
  refresh_token  TEXT,
  expires_at     TIMESTAMPTZ NOT NULL,

  -- Space-separated scope list actually granted. Google may grant fewer
  -- scopes than requested if the user unticks boxes on the consent screen,
  -- so we record what we got rather than what we asked for.
  scopes         TEXT        NOT NULL DEFAULT '',

  -- Which Google account this is, shown in Settings so the user can tell
  -- whether they connected the right one.
  google_email   TEXT,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;

-- Intentionally NO policies. With RLS enabled and no permissive policy,
-- anon and authenticated are denied all access. The service role bypasses
-- RLS entirely, which is exactly the access level we want.

COMMENT ON TABLE public.google_connections IS
  'Per-user Google OAuth tokens for GA4 + Search Console. Service-role access only — never exposed to the browser.';
COMMENT ON COLUMN public.google_connections.refresh_token IS
  'Long-lived credential. Google returns it only on first consent (or with prompt=consent), so never overwrite a stored value with NULL.';

-- Keep updated_at honest without relying on every caller remembering.
CREATE OR REPLACE FUNCTION public.touch_google_connections()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_google_connections_touch ON public.google_connections;
CREATE TRIGGER trg_google_connections_touch
  BEFORE UPDATE ON public.google_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_google_connections();
