-- 011_blog_admin_rls.sql
-- =============================================================================
-- AI Marketing Lab — restrict blog authoring to admins
--
-- THE HOLE THIS CLOSES
--
-- The policies in 002_blog.sql required only `auth.uid() = author_id`. That
-- reads like a restriction, but it isn't one: any visitor who signs up gets an
-- auth.uid(), and can therefore INSERT a row naming themselves as author with
-- status = 'published'. Their content then appears on the public blog.
--
-- The "Blog Admin" gate added later runs in a client component. It hides the
-- editor UI; it does not stop anyone calling the Supabase REST API directly
-- with their own anon-key session. The database was the only thing that could
-- enforce this, and it wasn't.
--
-- Admins live in a table rather than being hardcoded into the policy, so
-- granting access later is an INSERT instead of a migration.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.blog_admins (
  email      TEXT PRIMARY KEY,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.blog_admins ENABLE ROW LEVEL SECURITY;

-- No policies: the table is readable only by the service role and by the
-- SECURITY DEFINER function below. Users must not be able to enumerate admins,
-- and must certainly not be able to add themselves.

INSERT INTO public.blog_admins (email, note)
VALUES ('ritvik.sharmarrs@gmail.com', 'Owner')
ON CONFLICT (email) DO NOTHING;

/**
 * True when the caller's verified JWT email is on the admin list.
 *
 * SECURITY DEFINER so the check can read blog_admins even though the caller
 * cannot. search_path is pinned — without it, a caller who can create objects
 * could shadow `blog_admins` with their own table and authorise themselves.
 */
CREATE OR REPLACE FUNCTION public.is_blog_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.blog_admins a
    WHERE a.email = LOWER(NULLIF(auth.jwt() ->> 'email', ''))
  );
$$;

REVOKE ALL ON FUNCTION public.is_blog_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blog_admin() TO authenticated;

-- ── Replace the write policies ───────────────────────────────────────────────
-- Authorship is still required, so an admin cannot write posts attributed to
-- someone else. Admin status is now required on top of it.

DROP POLICY IF EXISTS "posts: author insert"       ON public.blog_posts;
DROP POLICY IF EXISTS "posts: author update"       ON public.blog_posts;
DROP POLICY IF EXISTS "posts: author delete draft" ON public.blog_posts;

CREATE POLICY "posts: admin insert"
  ON public.blog_posts FOR INSERT
  WITH CHECK (auth.uid() = author_id AND public.is_blog_admin());

CREATE POLICY "posts: admin update"
  ON public.blog_posts FOR UPDATE
  USING      (auth.uid() = author_id AND public.is_blog_admin())
  WITH CHECK (auth.uid() = author_id AND public.is_blog_admin());

CREATE POLICY "posts: admin delete draft"
  ON public.blog_posts FOR DELETE
  USING (auth.uid() = author_id AND public.is_blog_admin() AND status = 'draft');

-- Tags were writable by any authenticated user, which is a smaller version of
-- the same problem: tags render publicly on the blog.
DROP POLICY IF EXISTS "tags: authenticated insert" ON public.tags;

CREATE POLICY "tags: admin insert"
  ON public.tags FOR INSERT
  WITH CHECK (public.is_blog_admin());

COMMENT ON TABLE public.blog_admins IS
  'Emails permitted to author blog posts. Read only via is_blog_admin().';
