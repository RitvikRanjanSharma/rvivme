-- =============================================================================
-- AI Marketing Lab — Strategies v2
-- Extends ai_strategies so it can be activated, attached to keywords, and
-- tracked with a checklist + baseline metrics. Adds the ai_content table used
-- by the /content AI authoring tool so drafts survive reloads.
-- =============================================================================

-- --------------------------------------------------------------------------
-- 1. ai_strategies extensions
-- --------------------------------------------------------------------------
-- New columns capture the richer payload the AI now emits (category,
-- timeframe), plus activation metadata so the dashboard can show "your active
-- strategy" and the detail page can compute GSC/GA4 deltas vs. the baseline
-- that existed when the strategy was activated.
ALTER TABLE public.ai_strategies
  ADD COLUMN IF NOT EXISTS domain            TEXT,
  ADD COLUMN IF NOT EXISTS category          TEXT,
  ADD COLUMN IF NOT EXISTS timeframe         TEXT,
  ADD COLUMN IF NOT EXISTS acronym           TEXT,
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS baseline_metrics  JSONB,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT now();

-- Only one active strategy per user. Enforced with a partial unique index so
-- archived/completed strategies don't conflict.
CREATE UNIQUE INDEX IF NOT EXISTS idx_strategies_one_active_per_user
  ON public.ai_strategies (user_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_strategies_acronym
  ON public.ai_strategies (user_id, acronym);

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS trg_ai_strategies_updated_at ON public.ai_strategies;
CREATE TRIGGER trg_ai_strategies_updated_at
  BEFORE UPDATE ON public.ai_strategies
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- --------------------------------------------------------------------------
-- 2. strategy_checklist
-- --------------------------------------------------------------------------
-- AI-generated implementation steps for a given strategy. The user ticks
-- items off as they complete them; the combined completion rate drives the
-- "checklist" side of the progress bar.
CREATE TABLE IF NOT EXISTS public.strategy_checklist (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id       UUID        NOT NULL
                                REFERENCES public.ai_strategies (id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL
                                REFERENCES public.users (id) ON DELETE CASCADE,
  position          INTEGER     NOT NULL DEFAULT 0,
  title             TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  description       TEXT,
  action_type       TEXT        CHECK (action_type IN
                                  ('blog','article','landing','social','email','meta','internal_link',
                                   'outreach','tech','custom')),
  action_payload    JSONB,
  is_completed      BOOLEAN     NOT NULL DEFAULT FALSE,
  completed_at      TIMESTAMPTZ,
  linked_content_id UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.strategy_checklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "strategy_checklist: select own" ON public.strategy_checklist;
DROP POLICY IF EXISTS "strategy_checklist: insert own" ON public.strategy_checklist;
DROP POLICY IF EXISTS "strategy_checklist: update own" ON public.strategy_checklist;
DROP POLICY IF EXISTS "strategy_checklist: delete own" ON public.strategy_checklist;

CREATE POLICY "strategy_checklist: select own"
  ON public.strategy_checklist FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "strategy_checklist: insert own"
  ON public.strategy_checklist FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "strategy_checklist: update own"
  ON public.strategy_checklist FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "strategy_checklist: delete own"
  ON public.strategy_checklist FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_strategy_checklist_strategy
  ON public.strategy_checklist (strategy_id, position);

DROP TRIGGER IF EXISTS trg_strategy_checklist_updated_at ON public.strategy_checklist;
CREATE TRIGGER trg_strategy_checklist_updated_at
  BEFORE UPDATE ON public.strategy_checklist
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

REVOKE ALL ON public.strategy_checklist FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_checklist TO authenticated;

-- --------------------------------------------------------------------------
-- 3. strategy_keywords
-- --------------------------------------------------------------------------
-- Bidirectional link between a strategy and the keywords that feed it. Stores
-- volume/difficulty so the detail page can render without re-querying
-- DataForSEO. The junction also records each keyword's baseline position so
-- the GSC delta is accurate even if the keyword is later removed from the
-- user's general tracking list.
CREATE TABLE IF NOT EXISTS public.strategy_keywords (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id    UUID         NOT NULL
                              REFERENCES public.ai_strategies (id) ON DELETE CASCADE,
  user_id        UUID         NOT NULL
                              REFERENCES public.users (id) ON DELETE CASCADE,
  keyword        TEXT         NOT NULL CHECK (char_length(keyword) BETWEEN 1 AND 200),
  volume         INTEGER      CHECK (volume >= 0),
  difficulty     SMALLINT     CHECK (difficulty BETWEEN 0 AND 100),
  intent         TEXT,
  source         TEXT         CHECK (source IN ('gap','opportunity','manual','ai','ranking')),
  baseline_pos   INTEGER      CHECK (baseline_pos >= 0),
  added_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (strategy_id, keyword)
);

ALTER TABLE public.strategy_keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "strategy_keywords: select own" ON public.strategy_keywords;
DROP POLICY IF EXISTS "strategy_keywords: insert own" ON public.strategy_keywords;
DROP POLICY IF EXISTS "strategy_keywords: update own" ON public.strategy_keywords;
DROP POLICY IF EXISTS "strategy_keywords: delete own" ON public.strategy_keywords;

CREATE POLICY "strategy_keywords: select own"
  ON public.strategy_keywords FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "strategy_keywords: insert own"
  ON public.strategy_keywords FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "strategy_keywords: update own"
  ON public.strategy_keywords FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "strategy_keywords: delete own"
  ON public.strategy_keywords FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_strategy_keywords_strategy
  ON public.strategy_keywords (strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_keywords_user
  ON public.strategy_keywords (user_id);

REVOKE ALL ON public.strategy_keywords FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_keywords TO authenticated;

-- --------------------------------------------------------------------------
-- 4. ai_content
-- --------------------------------------------------------------------------
-- AI-authored drafts from the Content tool. Not the same as blog_posts —
-- these are always drafts until the user hits "Publish to blog", which inserts
-- a row into blog_posts and marks the ai_content row `published_to` that
-- blog_posts.id. Keeping the two separate lets users iterate on drafts
-- without polluting the blog feed.
CREATE TABLE IF NOT EXISTS public.ai_content (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID         NOT NULL
                                 REFERENCES public.users (id) ON DELETE CASCADE,
  strategy_id       UUID
                                 REFERENCES public.ai_strategies (id) ON DELETE SET NULL,
  content_type      TEXT         NOT NULL
                                 CHECK (content_type IN ('blog','article','landing','social','email')),
  title             TEXT         NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  slug              TEXT,
  excerpt           TEXT,
  body_markdown     TEXT         NOT NULL,
  meta_description  TEXT,
  target_keywords   TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  word_count        INTEGER      NOT NULL DEFAULT 0,
  read_time_minutes INTEGER      NOT NULL DEFAULT 0,
  status            TEXT         NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft','published','archived')),
  published_to      UUID,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_content: select own" ON public.ai_content;
DROP POLICY IF EXISTS "ai_content: insert own" ON public.ai_content;
DROP POLICY IF EXISTS "ai_content: update own" ON public.ai_content;
DROP POLICY IF EXISTS "ai_content: delete own" ON public.ai_content;

CREATE POLICY "ai_content: select own"
  ON public.ai_content FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ai_content: insert own"
  ON public.ai_content FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ai_content: update own"
  ON public.ai_content FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ai_content: delete own"
  ON public.ai_content FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_content_user_status
  ON public.ai_content (user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_content_strategy
  ON public.ai_content (strategy_id);

DROP TRIGGER IF EXISTS trg_ai_content_updated_at ON public.ai_content;
CREATE TRIGGER trg_ai_content_updated_at
  BEFORE UPDATE ON public.ai_content
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

REVOKE ALL ON public.ai_content FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_content TO authenticated;
