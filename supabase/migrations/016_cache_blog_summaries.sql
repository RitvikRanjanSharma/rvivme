-- 016_cache_blog_summaries.sql
-- ===========================================================================
-- Store the AI summary of a post instead of regenerating it on every click.
--
-- ⚠️  RUN THIS. It removes the only unauthenticated, unmetered path to our
--     Anthropic key.
--
-- THE PROBLEM
--
-- /api/blog/summary is public by design — blog readers press "AI summary"
-- without an account, which is correct. But it called Anthropic on every miss,
-- and its only protection was a Map in module scope with a one-hour TTL.
--
-- On Vercel that cache lives inside one serverless instance. Traffic spread
-- across instances misses it, a cold start empties it, and an hour later it
-- expires anyway — so the same published post, whose text has not changed,
-- gets summarised again and again. There is no session to meter against and
-- no quota row to count.
--
-- THE SHAPE OF THE FIX
--
-- A published post's summary is a pure function of its text. So we store it,
-- alongside a hash of the text it was generated from. On a request we compare
-- hashes: same text, serve the stored summary and call nobody; different text,
-- generate once and store the new one.
--
-- That turns "one model call per reader per hour per instance" into "one model
-- call per edit". The number of edits is small and under our control, which is
-- the property the in-process cache never had.
--
-- WHY A HASH RATHER THAN updated_at
--
-- updated_at moves when anything on the row changes — a category, a cover
-- image, an SEO title. None of those alter the article, and each would throw
-- away a perfectly good summary and pay for an identical replacement. The hash
-- covers exactly the text the summary was made from and nothing else.
-- ===========================================================================

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS ai_summary       TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary_hash  TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary_at    TIMESTAMPTZ;

COMMENT ON COLUMN public.blog_posts.ai_summary IS
  'Cached ~120-word summary for the reader-facing "AI summary" button.';
COMMENT ON COLUMN public.blog_posts.ai_summary_hash IS
  'Hash of the article text this summary was generated from. A mismatch means the post was edited and the summary must be regenerated.';
COMMENT ON COLUMN public.blog_posts.ai_summary_at IS
  'When the cached summary was generated.';


-- ── Writing the summary back ───────────────────────────────────────────────
--
-- The reader is anonymous, and RLS on blog_posts rightly forbids anonymous
-- writes. So the write goes through a SECURITY DEFINER function narrow enough
-- that being able to call it grants nothing else:
--
--   * it can only ever touch the three ai_summary columns
--   * it only matches PUBLISHED posts, so drafts cannot be probed or altered
--   * it takes a slug, not an id, and cannot be pointed at another table
--
-- The worst an abusive caller can do is write a wrong summary onto a published
-- post. That is worth watching, but it is a far smaller surface than the
-- alternative — leaving the model call unmetered — and an admin can overwrite
-- it from /admin.

CREATE OR REPLACE FUNCTION public.set_post_summary(
  p_slug    TEXT,
  p_summary TEXT,
  p_hash    TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Bound the input so this cannot be used to park arbitrary data in the row.
  IF p_summary IS NULL OR char_length(p_summary) > 4000 THEN
    RETURN FALSE;
  END IF;
  IF p_hash IS NULL OR char_length(p_hash) > 128 THEN
    RETURN FALSE;
  END IF;

  UPDATE public.blog_posts
     SET ai_summary      = p_summary,
         ai_summary_hash = p_hash,
         ai_summary_at   = now()
   WHERE slug   = p_slug
     AND status = 'published';

  -- FOUND is false when the slug matched nothing. Returned rather than
  -- swallowed, because a write that quietly matched zero rows is the exact
  -- failure mode that cost us a week on public.users.
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.set_post_summary(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_post_summary(TEXT, TEXT, TEXT) TO anon, authenticated;


-- ── Verify ─────────────────────────────────────────────────────────────────
-- After a reader has opened a post and pressed "AI summary" once, expect a row
-- here. A second press should not change ai_summary_at.
--
--   SELECT slug, ai_summary_at, left(ai_summary, 60) AS preview
--   FROM public.blog_posts
--   WHERE ai_summary IS NOT NULL
--   ORDER BY ai_summary_at DESC;
