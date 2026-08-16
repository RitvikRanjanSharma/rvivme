-- 013_drop_ai_content.sql
-- ===========================================================================
-- Drop public.ai_content — left over from the removed Content-generation
-- feature (commit 0ba6daa, "remove the Content page").
--
-- ⚠️  THIS HAS NOT BEEN RUN. It is checked in for you to review and execute
--     yourself in the Supabase SQL editor. It destroys data permanently and
--     there is no undo, so read STEP 1 before running STEP 2.
--
-- Why it is safe to drop:
--   * No code path reads or writes it. The only remaining reference is a type
--     definition in lib/supabase.ts (see STEP 3), not a query.
--   * The feature it backed was removed from the product deliberately — it
--     did not fit the strategist positioning.
--
-- Why it is worth dropping rather than leaving:
--   * It has a foreign key onto public.users with ON DELETE CASCADE, so it
--     participates in account deletion and in the retention promises made in
--     the privacy notice, for data nothing can display.
--   * An unused table with a users FK is the kind of thing that quietly
--     acquires rows again later and nobody notices.
-- ===========================================================================


-- ── STEP 1 — check it is actually empty ────────────────────────────────────
-- Run this on its own FIRST. If it returns 0, STEP 2 is uncontroversial.
-- If it returns anything above 0, stop and decide whether that content needs
-- exporting before you destroy it.
--
--     SELECT count(*) AS rows_that_will_be_lost FROM public.ai_content;
--
-- Optional — see what is in there before deciding:
--
--     SELECT id, user_id, content_type, title, status, created_at
--     FROM public.ai_content
--     ORDER BY created_at DESC
--     LIMIT 50;


-- ── STEP 2 — the drop ──────────────────────────────────────────────────────
-- Uncomment the statement below to run it. It is left commented so that this
-- file cannot destroy the table by being applied accidentally as part of a
-- migration run.
--
-- RESTRICT rather than CASCADE is deliberate: if anything unexpected depends
-- on this table, the statement should fail loudly rather than quietly remove
-- that dependency too.

-- DROP TABLE IF EXISTS public.ai_content RESTRICT;


-- ── STEP 3 — after running, tidy the code ──────────────────────────────────
-- Remove the now-dead `ai_content` block from the Database type in
-- lib/supabase.ts (around line 163). It is types only — nothing queries it —
-- so the app keeps working either way, but leaving it implies a table that no
-- longer exists.
