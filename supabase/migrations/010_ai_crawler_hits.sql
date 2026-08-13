-- 010_ai_crawler_hits.sql
-- =============================================================================
-- AI Marketing Lab — observed AI crawler visits
--
-- Populated by middleware.ts when an answer-engine bot fetches a page on this
-- domain. This is the only reliable way to observe crawlers: they don't run
-- JavaScript, so client-side tracking cannot see them.
--
-- Rows are site-wide rather than per-user — the crawler visited the domain,
-- not a particular account. Reads go through a server route, so the table is
-- service-role only.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_crawler_hits (
  id         BIGSERIAL   PRIMARY KEY,
  crawler    TEXT        NOT NULL,
  path       TEXT        NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The only query pattern is "recent hits, grouped by crawler".
CREATE INDEX IF NOT EXISTS idx_crawler_hits_time
  ON public.ai_crawler_hits (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawler_hits_crawler_time
  ON public.ai_crawler_hits (crawler, occurred_at DESC);

ALTER TABLE public.ai_crawler_hits ENABLE ROW LEVEL SECURITY;

-- No policies: anon and authenticated are denied outright. Writes come from
-- middleware via a secret-guarded route using the service role; reads go
-- through a server route that aggregates before returning anything.

COMMENT ON TABLE public.ai_crawler_hits IS
  'AI crawler visits observed by middleware. Service-role access only.';
