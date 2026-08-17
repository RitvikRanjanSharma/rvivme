-- 015_fix_user_row_creation.sql
-- ===========================================================================
-- Every signed-in account must have a row in public.users.
--
-- ⚠️  RUN THIS. It fixes a live bug and backfills the accounts already broken.
--
-- THE BUG
--
-- handle_new_auth_user() built its defaults with COALESCE:
--
--   COALESCE(NEW.raw_user_meta_data ->> 'company_name', 'Unnamed Organisation')
--
-- COALESCE only substitutes NULL. The signup form sends
-- `company_name: company.trim()`, which is an EMPTY STRING when the field is
-- left blank — and an empty string is not NULL, so it sailed through and hit
-- the column's own constraint:
--
--   company_name CHECK (char_length(company_name) BETWEEN 1 AND 200)
--   website_url  CHECK (website_url ~* '^https?://')
--
-- '' fails both. The INSERT raised, the trigger aborted, and the account ended
-- up existing in auth.users with no matching row in public.users.
--
-- WHAT THAT LOOKED LIKE FROM THE OUTSIDE
--
-- Nothing sensible, which is the point. Every UPDATE on public.users matched
-- zero rows — and PostgREST calls that success — so Settings showed a green
-- "Saved" tick and persisted nothing, and the GA4 and Search Console fields
-- came back empty every time. The audit was blunter about it and surfaced the
-- real shape of the problem:
--
--   insert or update on table "site_audits" violates foreign key constraint
--   "site_audits_user_id_fkey"
--
-- That FK points at public.users. There was no row to point at.
--
-- THREE FIXES, BECAUSE ONE IS NOT ENOUGH
--   1. Repair the trigger so it cannot produce an invalid row.
--   2. Backfill the accounts already broken.
--   3. Give the app a way to self-heal, so a future gap fixes itself rather
--      than needing a migration and a person who knows about this file.
-- ===========================================================================


-- ── 1. A trigger that cannot fail ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company TEXT;
  v_site    TEXT;
BEGIN
  -- NULLIF(trim(...), '') turns "" into NULL so COALESCE can actually do its
  -- job. This is the whole bug in one line.
  v_company := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'company_name'), ''),
    'Unnamed Organisation'
  );
  v_site := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'website_url'), ''),
    'https://example.com'
  );

  -- Defend the constraints rather than hoping the input satisfies them. A
  -- website_url without a scheme is the likely next version of this bug —
  -- someone types "acme.co.uk" and the regex rejects it.
  IF v_site !~* '^https?://' THEN
    v_site := 'https://' || v_site;
  END IF;
  IF char_length(v_company) > 200 THEN
    v_company := left(v_company, 200);
  END IF;
  IF char_length(v_site) > 500 THEN
    v_site := 'https://example.com';
  END IF;

  INSERT INTO public.users (id, company_name, website_url)
  VALUES (NEW.id, v_company, v_site)
  -- Idempotent: a retried signup or a race with the self-heal below must not
  -- fail on the primary key.
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Last resort. An AFTER INSERT trigger that raises takes the whole
  -- transaction with it, which would mean a failed signup rather than a
  -- degraded one. Losing the profile row is recoverable — ensure_user_row()
  -- below repairs it on next page load. Losing the account is not.
  RAISE WARNING 'handle_new_auth_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;


-- ── 2. Backfill the accounts already broken ────────────────────────────────
-- Anyone who signed up while the bug was live has an auth row and no profile.

INSERT INTO public.users (id, company_name, website_url)
SELECT
  au.id,
  COALESCE(NULLIF(trim(au.raw_user_meta_data ->> 'company_name'), ''), 'Unnamed Organisation'),
  CASE
    WHEN COALESCE(NULLIF(trim(au.raw_user_meta_data ->> 'website_url'), ''), '') ~* '^https?://'
      THEN trim(au.raw_user_meta_data ->> 'website_url')
    ELSE 'https://example.com'
  END
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL
ON CONFLICT (id) DO NOTHING;


-- ── 3. Self-heal ───────────────────────────────────────────────────────────
--
-- The app calls this once per session. It exists because "run a migration" is
-- not an acceptable recovery path for a user who cannot save anything — and
-- because RLS on public.users is "no direct insert" (WITH CHECK (false)), so
-- the client genuinely cannot create its own row without help.
--
-- SECURITY DEFINER, but it can only ever insert a row for auth.uid() — the
-- caller's own id, taken from the verified JWT and never from an argument.
-- There is no parameter to abuse.

CREATE OR REPLACE FUNCTION public.ensure_user_row()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID := auth.uid();
BEGIN
  IF v_id IS NULL THEN
    RETURN FALSE;   -- not signed in; nothing to heal
  END IF;

  INSERT INTO public.users (id, company_name, website_url)
  VALUES (v_id, 'Unnamed Organisation', 'https://example.com')
  ON CONFLICT (id) DO NOTHING;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_row() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_user_row() TO authenticated;


-- ── Verify ─────────────────────────────────────────────────────────────────
-- Expect 0. Any other number means accounts are still missing a profile row.
--
--   SELECT count(*) AS accounts_without_a_profile
--   FROM auth.users au
--   LEFT JOIN public.users pu ON pu.id = au.id
--   WHERE pu.id IS NULL;
