-- 014_site_admin_overrides.sql
-- =============================================================================
-- AI Marketing Lab — operator-editable site content
--
-- WHAT THIS IS FOR
--
-- The site is a Next.js app: its pages are code, compiled at deploy time. That
-- makes fixing an SEO issue a code change, which is the wrong loop for the
-- owner of the tool — especially when this site is also the test subject for
-- the audit features. These tables move the things an SEO fix actually touches
-- out of the deploy cycle and into the database.
--
-- THE DESIGN RULE: THE DATABASE OVERRIDES, IT DOES NOT REPLACE
--
-- Every table here is read as an OVERLAY on top of the values hardcoded in the
-- app. A missing row means "use what the code says", not "render nothing". So
-- an empty set of tables produces exactly the site that ships today, and a
-- database outage degrades to the committed defaults rather than to a blank
-- page. Nothing in the app is allowed to depend on a row existing.
--
-- ADMIN IDENTITY LIVES IN ONE PLACE
--
-- public.blog_admins already exists and already has the right shape: no RLS
-- policies at all, so no user can read or modify it, with a SECURITY DEFINER
-- function doing the check. Rather than add a second admin table that can
-- drift out of step with the first, this migration reuses it and adds a
-- broader-named function. The table name is now historical — it is the site
-- admin list, not just the blog's.
-- =============================================================================


-- ── Admin identity ───────────────────────────────────────────────────────────

-- The owner address. Already inserted by migration 011; repeated here with
-- ON CONFLICT DO NOTHING so this migration is self-contained and can be applied
-- to a fresh database without depending on 011 having seeded it.
--
-- Exactly one administrator by design. Every additional address is another way
-- into a panel that can noindex the whole site, so the list stays at one until
-- there is a reason for a second.
INSERT INTO public.blog_admins (email, note)
VALUES ('ritvik.sharmarrs@gmail.com', 'Owner — sole site administrator')
ON CONFLICT (email) DO NOTHING;

/**
 * True when the caller's verified JWT email is a site administrator.
 *
 * Deliberately identical in mechanism to is_blog_admin(): SECURITY DEFINER so
 * it can read an otherwise unreadable table, and search_path pinned so a
 * caller who can create objects cannot shadow blog_admins with their own table
 * and authorise themselves.
 *
 * LOWER() on both sides because email case is not significant and a
 * case-mismatched address silently failing the check is a confusing way to be
 * locked out — see migration 012, which fixed exactly that.
 */
CREATE OR REPLACE FUNCTION public.is_site_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.blog_admins a
    WHERE LOWER(a.email) = LOWER(NULLIF(auth.jwt() ->> 'email', ''))
  );
$$;

REVOKE ALL ON FUNCTION public.is_site_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_site_admin() TO authenticated;


-- ── Per-route SEO overrides ──────────────────────────────────────────────────
-- One row per route. Every column is nullable: NULL means "leave the code's
-- value alone", which is what allows a single field to be overridden without
-- having to restate the rest of the page's metadata.

CREATE TABLE IF NOT EXISTS public.seo_overrides (
  route            TEXT PRIMARY KEY
                   CHECK (route ~ '^/' AND char_length(route) <= 300),
  title            TEXT CHECK (char_length(title) <= 300),
  description      TEXT CHECK (char_length(description) <= 600),
  canonical        TEXT CHECK (char_length(canonical) <= 500),
  -- NULL = inherit. Setting index=false is how a page is taken out of search
  -- without a deploy.
  robots_index     BOOLEAN,
  robots_follow    BOOLEAN,
  og_title         TEXT CHECK (char_length(og_title) <= 300),
  og_description   TEXT CHECK (char_length(og_description) <= 600),
  og_image         TEXT CHECK (char_length(og_image) <= 500),
  -- Arbitrary JSON-LD injected into the page. jsonb so malformed JSON is
  -- rejected at write time rather than shipping a broken script tag.
  json_ld          JSONB,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by       TEXT
);

COMMENT ON TABLE public.seo_overrides IS
  'Per-route metadata overlay. NULL column = use the value compiled into the app.';


-- ── Editable text blocks ─────────────────────────────────────────────────────
-- Keyed by a dotted path chosen in the code, e.g. "home.hero.headline". The
-- code always passes its own default alongside the key, so an unknown or
-- deleted key renders the shipped copy.

CREATE TABLE IF NOT EXISTS public.content_blocks (
  key         TEXT PRIMARY KEY
              CHECK (key ~ '^[a-z0-9]+(\.[a-z0-9_-]+)+$' AND char_length(key) <= 200),
  value       TEXT NOT NULL CHECK (char_length(value) <= 20000),
  -- Free-text note for the operator: what/where this block is.
  label       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

COMMENT ON TABLE public.content_blocks IS
  'Editable page copy. Missing key = the default hardcoded at the call site.';


-- ── Site files ───────────────────────────────────────────────────────────────
-- robots.txt and llms.txt, served from the database when present.

CREATE TABLE IF NOT EXISTS public.site_files (
  key         TEXT PRIMARY KEY CHECK (key IN ('robots_txt', 'llms_txt')),
  content     TEXT NOT NULL CHECK (char_length(content) <= 100000),
  -- Lets the operator revert to the generated version without deleting their
  -- draft, which is the difference between experimenting and committing.
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

COMMENT ON TABLE public.site_files IS
  'robots.txt / llms.txt bodies. Absent or enabled=false falls back to the app-generated file.';


-- ── Redirects ────────────────────────────────────────────────────────────────
-- Applied in proxy.ts. Read on every request, so the app caches these in
-- memory with a short TTL rather than querying per request.

CREATE TABLE IF NOT EXISTS public.redirects (
  source       TEXT PRIMARY KEY
               CHECK (source ~ '^/' AND char_length(source) <= 500),
  destination  TEXT NOT NULL CHECK (char_length(destination) <= 1000),
  status_code  INTEGER NOT NULL DEFAULT 308
               CHECK (status_code IN (301, 302, 307, 308)),
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   TEXT,
  -- A redirect pointing at itself is an infinite loop that takes the route
  -- down. Cheap to prevent here, expensive to debug in production.
  CHECK (source <> destination)
);

COMMENT ON TABLE public.redirects IS
  'Runtime redirects applied by proxy.ts, cached in memory with a short TTL.';


-- ── Row level security ───────────────────────────────────────────────────────
--
-- READS are public. Everything in these tables is already visible to anyone who
-- loads the page — titles, meta descriptions, body copy, robots rules — so
-- restricting SELECT would buy no privacy while forcing the render path to hold
-- a service-role key. Public read keeps the secret out of the rendering code.
--
-- WRITES require is_site_admin(). This is the boundary that matters, and it is
-- enforced here rather than in the browser: the admin UI gate only decides who
-- sees the editor.

ALTER TABLE public.seo_overrides  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_files     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redirects      ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['seo_overrides', 'content_blocks', 'site_files', 'redirects']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s: public read" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s: admin write" ON public.%I', t, t);

    EXECUTE format(
      'CREATE POLICY "%s: public read" ON public.%I FOR SELECT USING (TRUE)', t, t);

    -- FOR ALL covers INSERT, UPDATE and DELETE. Both USING and WITH CHECK are
    -- given: USING gates which existing rows may be touched, WITH CHECK gates
    -- the resulting row. Supplying only one leaves the other operation open.
    EXECUTE format(
      'CREATE POLICY "%s: admin write" ON public.%I FOR ALL '
      'USING (public.is_site_admin()) WITH CHECK (public.is_site_admin())', t, t);
  END LOOP;
END $$;


-- ── updated_at maintenance ───────────────────────────────────────────────────
-- Set in the database rather than trusted from the client, so the audit trail
-- reflects when the write happened rather than what the browser claimed.

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['seo_overrides', 'content_blocks', 'site_files', 'redirects']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%s ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_touch_%s BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t, t);
  END LOOP;
END $$;


-- ── Verify ───────────────────────────────────────────────────────────────────
-- Run after applying. Expect is_site_admin = true when signed in as the owner,
-- and false or an error for anyone else.
--
--   SELECT public.is_site_admin();
--   SELECT email FROM public.blog_admins;          -- service role only
--   SELECT tablename, policyname, cmd
--   FROM pg_policies
--   WHERE tablename IN ('seo_overrides','content_blocks','site_files','redirects')
--   ORDER BY tablename, cmd;
