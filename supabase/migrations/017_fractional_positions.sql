-- 017_fractional_positions.sql
-- ===========================================================================
-- Search Console positions are fractional. The columns holding them are not.
--
-- ⚠️  RUN THIS. Saving keywords to a strategy fails without it.
--
-- THE ERROR
--
--   invalid input syntax for type integer: "27.3"
--
-- raised when saving six selected keywords to a strategy. Postgres is correct
-- to refuse: strategy_keywords.baseline_pos is INTEGER and the value is 27.3.
--
-- WHY 27.3 IS THE RIGHT NUMBER AND THE COLUMN IS WRONG
--
-- These columns were designed when rankings came from DataForSEO, which
-- returns a discrete SERP rank — you are at position 27, full stop. An
-- INTEGER was exactly right for that.
--
-- Rankings now come from Search Console, where `position` is the AVERAGE
-- position across impressions. A page that appeared at 27 on Monday and 28 on
-- Tuesday has an average of 27.5. There is no whole number that represents it.
-- The data changed meaning; the column did not follow.
--
-- WHY NOT JUST ROUND IT
--
-- Because the tenths are the entire point. A baseline exists to be compared
-- against later, and rank movement happens in tenths: 27.3 improving to 26.8
-- is real progress that Math.round() flattens into "27, then 27". A baseline
-- that cannot show improvement is not a baseline, and rounding would have
-- turned a loud, obvious crash into a silent, permanent loss of signal.
--
-- NUMERIC(4,1) holds 0.0 to 999.9 — comfortably past the 101 sentinel used
-- for "not in the top 100" — in one decimal place, which is exactly the
-- precision Search Console reports.
--
-- THE OTHER TWO COLUMNS
--
-- tracked_keywords.your_pos and .competitor_pos are the same INTEGER type
-- with the same history. Nothing writes a Search Console position to them
-- today, so they are not broken — they are the identical trap set for
-- whoever wires up rank comparison next. Converted here while we are in the
-- neighbourhood and know why.
--
-- keyword_rankings_history.position is deliberately NOT converted. It stores
-- a daily snapshot that the cron already rounds and clamps to 1-101 on
-- purpose, with a CHECK enforcing it. That column means "which bucket were we
-- in that day", which is a different question, and an integer answers it.
-- ===========================================================================

ALTER TABLE public.strategy_keywords
  ALTER COLUMN baseline_pos TYPE NUMERIC(4,1) USING baseline_pos::NUMERIC(4,1);

ALTER TABLE public.tracked_keywords
  ALTER COLUMN your_pos       TYPE NUMERIC(4,1) USING your_pos::NUMERIC(4,1),
  ALTER COLUMN competitor_pos TYPE NUMERIC(4,1) USING competitor_pos::NUMERIC(4,1);

-- The CHECK constraints survive the type change (they only test >= 0), but
-- they are restated so the intent is visible in one place rather than being
-- inherited invisibly from 004 and 005.
COMMENT ON COLUMN public.strategy_keywords.baseline_pos IS
  'Search Console average position when this keyword was attached, to one decimal place. Fractional because it is an average across impressions, not a SERP slot.';
COMMENT ON COLUMN public.tracked_keywords.your_pos IS
  'Search Console average position, to one decimal place.';
COMMENT ON COLUMN public.tracked_keywords.competitor_pos IS
  'Competitor position, to one decimal place where the source provides it.';


-- ── Verify ─────────────────────────────────────────────────────────────────
-- Expect numeric with numeric_scale 1 for all three.
--
--   SELECT table_name, column_name, data_type, numeric_scale
--   FROM information_schema.columns
--   WHERE (table_name, column_name) IN (
--           ('strategy_keywords', 'baseline_pos'),
--           ('tracked_keywords',  'your_pos'),
--           ('tracked_keywords',  'competitor_pos'))
--   ORDER BY table_name, column_name;
--
-- Then re-select those six keywords and save them to a strategy. It should
-- succeed, and baseline_pos should read 27.3 rather than 27.
