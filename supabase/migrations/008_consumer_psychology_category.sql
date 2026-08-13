-- 008_consumer_psychology_category.sql
-- =============================================================================
-- AI Marketing Lab — add "consumer_psychology" to the blog post category enum.
--
-- post_category is a Postgres ENUM (see 002_blog.sql), so a new option has to
-- be added with ALTER TYPE rather than just changing the TypeScript union.
--
-- Notes:
--   * ADD VALUE IF NOT EXISTS makes this safe to re-run.
--   * ALTER TYPE ... ADD VALUE cannot run inside a transaction block in older
--     Postgres versions. Supabase's migration runner wraps statements in a
--     transaction, so if this errors with "ALTER TYPE ... cannot run inside a
--     transaction block", run this one statement manually in the SQL editor.
--   * Placed after 'business_insights' for a sensible ordering in dropdowns;
--     BEFORE/AFTER only affects enum sort order, not validity.
-- =============================================================================

ALTER TYPE public.post_category
  ADD VALUE IF NOT EXISTS 'consumer_psychology' AFTER 'business_insights';
