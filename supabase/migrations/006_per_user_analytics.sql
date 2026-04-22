-- =============================================================================
-- AI Marketing Lab — Per-user Analytics Configuration
-- =============================================================================
-- Before this migration, every workspace shared a single GSC site URL and
-- GA4 property (read from process.env). That meant every new user landed on
-- the dashboard and saw whatever workspace the env vars pointed to — a major
-- multi-tenancy leak.
--
-- This migration lets each user store their own GSC property and GA4 property
-- on `public.users`. The /api/gsc and /api/ga4 routes read these per-caller
-- values after verifying the session via Supabase cookies.
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gsc_site_url     TEXT,
  ADD COLUMN IF NOT EXISTS ga4_property_id  TEXT;

-- Keep existing RLS policies on public.users as-is; the new columns are
-- covered by the same "users can read/update their own row" rules.

COMMENT ON COLUMN public.users.gsc_site_url
  IS 'Google Search Console site URL (e.g. "sc-domain:example.com" or "https://example.com/"). NULL = not connected.';
COMMENT ON COLUMN public.users.ga4_property_id
  IS 'Google Analytics 4 property ID (numeric string, e.g. "123456789"). NULL = not connected.';
