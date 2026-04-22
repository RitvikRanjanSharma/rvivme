-- =============================================================================
-- AI Marketing Lab — Tracked Keywords
-- Lets users persist competitor-gap and opportunity keywords from the Keyword
-- Intelligence → Competitor Keywords tab, so they survive page reloads and
-- can be exported for downstream use.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tracked_keywords (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID         NOT NULL
                                 REFERENCES public.users (id) ON DELETE CASCADE,
  keyword           TEXT         NOT NULL CHECK (char_length(keyword) BETWEEN 1 AND 200),
  source            TEXT         NOT NULL CHECK (source IN ('gap', 'opportunity', 'manual', 'ranking', 'idea')),
  competitor_domain TEXT,
  volume            INTEGER      CHECK (volume >= 0),
  difficulty        SMALLINT     CHECK (difficulty BETWEEN 0 AND 100),
  cpc               NUMERIC(7,2) CHECK (cpc >= 0),
  intent            TEXT,
  competitor_pos    INTEGER      CHECK (competitor_pos >= 0),
  your_pos          INTEGER      CHECK (your_pos >= 0),
  notes             TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (user_id, keyword, competitor_domain)
);

ALTER TABLE public.tracked_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tracked_keywords: select own"
  ON public.tracked_keywords FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "tracked_keywords: insert own"
  ON public.tracked_keywords FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tracked_keywords: update own"
  ON public.tracked_keywords FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tracked_keywords: delete own"
  ON public.tracked_keywords FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_tracked_keywords_user_source
  ON public.tracked_keywords (user_id, source);

CREATE INDEX idx_tracked_keywords_competitor
  ON public.tracked_keywords (user_id, competitor_domain);

CREATE TRIGGER trg_tracked_keywords_updated_at
  BEFORE UPDATE ON public.tracked_keywords
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

REVOKE ALL ON public.tracked_keywords FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.tracked_keywords TO authenticated;
