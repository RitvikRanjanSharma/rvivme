-- =============================================================================
-- AI Marketing Lab — Post view-count increment (SECURITY DEFINER RPC)
-- =============================================================================
-- The blog/[slug] page needs to bump `blog_posts.view_count` when any visitor
-- (anon OR authenticated) reads a published post. RLS on blog_posts only
-- allows the author to UPDATE their own posts, so the client-side `.update()`
-- previously failed silently. This migration adds a SECURITY DEFINER function
-- that anon and authenticated roles may call via supabase.rpc().
--
-- The function is tightly scoped: it only increments view_count, only on
-- published posts, and only by 1 per call.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.increment_post_view(p_post_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.blog_posts
     SET view_count = view_count + 1
   WHERE id = p_post_id
     AND status = 'published';
END;
$$;

REVOKE ALL    ON FUNCTION public.increment_post_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_post_view(UUID) TO   anon, authenticated;
