-- 012_blog_admin_case_insensitive.sql
-- =============================================================================
-- AI Marketing Lab — make the admin check robust to case
--
-- 011 lowercased the JWT side of the comparison but not the stored side:
--
--   WHERE a.email = LOWER(auth.jwt() ->> 'email')
--
-- So a row inserted as 'Ritvik.Sharma@gmail.com' silently never matches. The
-- seed in 011 was lowercase and therefore fine, but every future admin is
-- added by hand in the SQL editor, and a capital letter would lock that person
-- out with no error message anywhere — the policy simply denies the write.
--
-- A comparison that depends on the caller remembering to lowercase is a
-- comparison waiting to fail, so both sides are normalised here.
-- =============================================================================

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
    WHERE LOWER(TRIM(a.email)) = LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')))
      AND COALESCE(auth.jwt() ->> 'email', '') <> ''
  );
$$;

REVOKE ALL ON FUNCTION public.is_blog_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blog_admin() TO authenticated;

-- Normalise anything already stored, so existing rows benefit too.
UPDATE public.blog_admins SET email = LOWER(TRIM(email)) WHERE email <> LOWER(TRIM(email));
