-- =============================================================================
-- AI Marketing Lab — SEO Foundations
-- =============================================================================
-- This migration adds the missing core tables an automated SEO tool needs to
-- run day-to-day for real users:
--
--   1. keyword_rankings_history  — daily/weekly position snapshots so we can
--                                   show rank trend lines instead of just the
--                                   current position.
--   2. site_audits + audit_findings — results from the technical-SEO crawler
--                                   (PSI core web vitals + on-page checks).
--   3. alerts + notifications     — rank drops, traffic drops, broken pages,
--                                   dispatched per user with read state for
--                                   the in-app bell + email digests.
--   4. api_usage_quotas           — per-user daily counters for paid APIs
--                                   (DataForSEO, Anthropic, PSI). Enforced
--                                   server-side via lib/quota.ts.
--   5. cache_entries              — namespaced KV cache for expensive lookups
--                                   so we don't hit DataForSEO twice for the
--                                   same query inside a TTL window.
--
-- Multi-project (per-site) is intentionally not added here — the existing
-- schema is single-site per user. We'll layer that in a later migration when
-- we need it; everything below is keyed off user_id so the upgrade path is
-- "add project_id NULLable, backfill, then make NOT NULL".
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. keyword_rankings_history
-- ---------------------------------------------------------------------------
-- A single row per (user, keyword, captured_on_date). The cron snapshot writer
-- in /api/cron/daily-rank-snapshot upserts one row per tracked keyword each
-- day, pulling current position from the existing tracked_keywords + GSC
-- data. The dashboard reads the last N days to draw a trend sparkline.
--
-- We store position as INTEGER (1-100). Anything below 100 is recorded as 101
-- so chart code can show "out of top 100" without dealing with NULLs.
CREATE TABLE IF NOT EXISTS public.keyword_rankings_history (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL
                               REFERENCES public.users (id) ON DELETE CASCADE,
  keyword         TEXT         NOT NULL CHECK (char_length(keyword) BETWEEN 1 AND 200),
  domain          TEXT         NOT NULL,
  position        INTEGER      NOT NULL CHECK (position BETWEEN 1 AND 101),
  search_volume   INTEGER      CHECK (search_volume >= 0),
  url             TEXT,
  source          TEXT         NOT NULL DEFAULT 'gsc'
                               CHECK (source IN ('gsc','dataforseo','manual')),
  captured_on     DATE         NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (user_id, keyword, captured_on)
);

ALTER TABLE public.keyword_rankings_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "krh: select own"  ON public.keyword_rankings_history;
DROP POLICY IF EXISTS "krh: insert own"  ON public.keyword_rankings_history;
DROP POLICY IF EXISTS "krh: delete own"  ON public.keyword_rankings_history;

CREATE POLICY "krh: select own"
  ON public.keyword_rankings_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "krh: insert own"
  ON public.keyword_rankings_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "krh: delete own"
  ON public.keyword_rankings_history FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_krh_user_keyword_date
  ON public.keyword_rankings_history (user_id, keyword, captured_on DESC);
CREATE INDEX IF NOT EXISTS idx_krh_user_date
  ON public.keyword_rankings_history (user_id, captured_on DESC);

REVOKE ALL ON public.keyword_rankings_history FROM anon;
GRANT SELECT, INSERT, DELETE ON public.keyword_rankings_history TO authenticated;


-- ---------------------------------------------------------------------------
-- 2. site_audits + audit_findings
-- ---------------------------------------------------------------------------
-- One site_audits row = one crawl run. The summary is denormalised onto the
-- row (overall_score + counts) so the dashboard can render the latest audit
-- without joining findings. Individual issues live in audit_findings, keyed
-- by the audit they belong to.
CREATE TABLE IF NOT EXISTS public.site_audits (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID         NOT NULL
                                  REFERENCES public.users (id) ON DELETE CASCADE,
  domain             TEXT         NOT NULL,
  status             TEXT         NOT NULL DEFAULT 'running'
                                  CHECK (status IN ('running','completed','failed')),
  -- 0-100 weighted score; NULL while running.
  overall_score      INTEGER      CHECK (overall_score BETWEEN 0 AND 100),
  pages_crawled      INTEGER      NOT NULL DEFAULT 0,
  -- Denormalised counts for fast dashboard render
  errors_count       INTEGER      NOT NULL DEFAULT 0,
  warnings_count     INTEGER      NOT NULL DEFAULT 0,
  notices_count      INTEGER      NOT NULL DEFAULT 0,
  -- PageSpeed / Core Web Vitals (mobile)
  performance_score  INTEGER      CHECK (performance_score BETWEEN 0 AND 100),
  accessibility_score INTEGER     CHECK (accessibility_score BETWEEN 0 AND 100),
  best_practices_score INTEGER    CHECK (best_practices_score BETWEEN 0 AND 100),
  seo_score          INTEGER      CHECK (seo_score BETWEEN 0 AND 100),
  lcp_ms             INTEGER,
  cls                NUMERIC(6,3),
  inp_ms             INTEGER,
  -- Free-form metadata: crawl config, PSI raw response summary, etc.
  meta               JSONB,
  error_message      TEXT,
  started_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.site_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_audits: select own" ON public.site_audits;
DROP POLICY IF EXISTS "site_audits: insert own" ON public.site_audits;
DROP POLICY IF EXISTS "site_audits: update own" ON public.site_audits;
DROP POLICY IF EXISTS "site_audits: delete own" ON public.site_audits;

CREATE POLICY "site_audits: select own"
  ON public.site_audits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "site_audits: insert own"
  ON public.site_audits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "site_audits: update own"
  ON public.site_audits FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "site_audits: delete own"
  ON public.site_audits FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_site_audits_user_started
  ON public.site_audits (user_id, started_at DESC);

REVOKE ALL ON public.site_audits FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_audits TO authenticated;


CREATE TABLE IF NOT EXISTS public.audit_findings (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id      UUID         NOT NULL
                             REFERENCES public.site_audits (id) ON DELETE CASCADE,
  user_id       UUID         NOT NULL
                             REFERENCES public.users (id) ON DELETE CASCADE,
  -- Stable string code so the UI can group findings by issue type
  -- (e.g. 'missing_meta_description', 'broken_link', 'no_h1', 'cwv_lcp').
  rule          TEXT         NOT NULL,
  severity      TEXT         NOT NULL CHECK (severity IN ('error','warning','notice')),
  category      TEXT         NOT NULL CHECK (category IN
                              ('on_page','technical','performance','accessibility','best_practice','content','schema')),
  page_url      TEXT,
  message       TEXT         NOT NULL,
  -- Optional structured detail: { selector, expected, actual, snippet, ... }
  detail        JSONB,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_findings: select own" ON public.audit_findings;
DROP POLICY IF EXISTS "audit_findings: insert own" ON public.audit_findings;
DROP POLICY IF EXISTS "audit_findings: delete own" ON public.audit_findings;

CREATE POLICY "audit_findings: select own"
  ON public.audit_findings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "audit_findings: insert own"
  ON public.audit_findings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "audit_findings: delete own"
  ON public.audit_findings FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_audit_findings_audit
  ON public.audit_findings (audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_findings_user_severity
  ON public.audit_findings (user_id, severity);

REVOKE ALL ON public.audit_findings FROM anon;
GRANT SELECT, INSERT, DELETE ON public.audit_findings TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. alerts (rules) + notifications (deliveries)
-- ---------------------------------------------------------------------------
-- alerts          = "rules" — what should fire and how loud (severity).
-- notifications   = the actual events the user sees in the bell / inbox.
-- We split them so a single rule (e.g. "rank dropped by >5") can produce many
-- notifications over time without re-creating the rule each time.
--
-- For the v1 launch we ship with a small set of built-in rule types that the
-- cron jobs in /api/cron/check-alerts evaluate. Users don't need to create
-- alerts manually — the onboarding flow seeds the defaults.
CREATE TABLE IF NOT EXISTS public.alerts (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         NOT NULL
                             REFERENCES public.users (id) ON DELETE CASCADE,
  rule_type     TEXT         NOT NULL CHECK (rule_type IN
                              ('rank_drop','rank_gain','traffic_drop','traffic_spike',
                               'new_keyword','lost_keyword','audit_critical',
                               'broken_page','manual')),
  threshold     NUMERIC,
  enabled       BOOLEAN      NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN      NOT NULL DEFAULT TRUE,
  -- last_evaluated_at lets cron jobs skip rules they recently checked
  last_evaluated_at TIMESTAMPTZ,
  meta          JSONB,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (user_id, rule_type)
);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alerts: select own" ON public.alerts;
DROP POLICY IF EXISTS "alerts: insert own" ON public.alerts;
DROP POLICY IF EXISTS "alerts: update own" ON public.alerts;
DROP POLICY IF EXISTS "alerts: delete own" ON public.alerts;

CREATE POLICY "alerts: select own"
  ON public.alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "alerts: insert own"
  ON public.alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alerts: update own"
  ON public.alerts FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alerts: delete own"
  ON public.alerts FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_alerts_updated_at ON public.alerts;
CREATE TRIGGER trg_alerts_updated_at
  BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

REVOKE ALL ON public.alerts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;


CREATE TABLE IF NOT EXISTS public.notifications (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         NOT NULL
                             REFERENCES public.users (id) ON DELETE CASCADE,
  -- NULL when manually-created (e.g. a system message from us)
  alert_id      UUID         REFERENCES public.alerts (id) ON DELETE SET NULL,
  severity      TEXT         NOT NULL DEFAULT 'info'
                             CHECK (severity IN ('info','success','warning','error')),
  title         TEXT         NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  body          TEXT,
  -- /alerts page renders deep links like { href: "/keywords?q=foo" }
  link_href     TEXT,
  read_at       TIMESTAMPTZ,
  emailed_at    TIMESTAMPTZ,
  meta          JSONB,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications: select own" ON public.notifications;
DROP POLICY IF EXISTS "notifications: insert own" ON public.notifications;
DROP POLICY IF EXISTS "notifications: update own" ON public.notifications;
DROP POLICY IF EXISTS "notifications: delete own" ON public.notifications;

CREATE POLICY "notifications: select own"
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifications: insert own"
  ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notifications: update own"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notifications: delete own"
  ON public.notifications FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, read_at, created_at DESC);

REVOKE ALL ON public.notifications FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;


-- ---------------------------------------------------------------------------
-- 4. api_usage_quotas
-- ---------------------------------------------------------------------------
-- Per-user, per-provider, per-UTC-day counter. Incremented from lib/quota.ts
-- before each paid API call. The "free" tier ships with sensible defaults
-- (see lib/quota.ts) so we can soft-launch without burning credits if a user
-- hammers the keyword tool.
CREATE TABLE IF NOT EXISTS public.api_usage_quotas (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL
                           REFERENCES public.users (id) ON DELETE CASCADE,
  provider    TEXT         NOT NULL CHECK (provider IN
                            ('dataforseo','anthropic','psi','ga4','gsc','trends')),
  endpoint    TEXT,
  -- ISO date in UTC — e.g. '2026-05-05'
  day         DATE         NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  count       INTEGER      NOT NULL DEFAULT 0 CHECK (count >= 0),
  cost_units  NUMERIC(10,4) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, day)
);

ALTER TABLE public.api_usage_quotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auq: select own"  ON public.api_usage_quotas;
DROP POLICY IF EXISTS "auq: insert own"  ON public.api_usage_quotas;
DROP POLICY IF EXISTS "auq: update own"  ON public.api_usage_quotas;

CREATE POLICY "auq: select own"
  ON public.api_usage_quotas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "auq: insert own"
  ON public.api_usage_quotas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "auq: update own"
  ON public.api_usage_quotas FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_auq_user_provider_day
  ON public.api_usage_quotas (user_id, provider, day DESC);

REVOKE ALL ON public.api_usage_quotas FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.api_usage_quotas TO authenticated;


-- ---------------------------------------------------------------------------
-- 5. cache_entries
-- ---------------------------------------------------------------------------
-- Generic KV cache scoped to (user, namespace, key). Values are stored as
-- JSONB. lib/cache.ts wraps this with a TTL so callers can do:
--
--   const data = await cache.getOrFetch("dfs:keywords", `${domain}:${kw}`,
--                                       60 * 60, () => fetchFromDFS(...));
--
-- We don't enforce TTL with a constraint — expired rows are filtered in the
-- application layer and a daily cron sweep deletes anything past expires_at.
CREATE TABLE IF NOT EXISTS public.cache_entries (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = global cache row (e.g. shared SERP results); otherwise scoped to
  -- a single user. We always namespace dynamic-content caches by user.
  user_id     UUID         REFERENCES public.users (id) ON DELETE CASCADE,
  namespace   TEXT         NOT NULL CHECK (char_length(namespace) BETWEEN 1 AND 80),
  cache_key   TEXT         NOT NULL CHECK (char_length(cache_key) BETWEEN 1 AND 500),
  value       JSONB        NOT NULL,
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Composite uniqueness: one cache row per (user, namespace, key)
  UNIQUE (user_id, namespace, cache_key)
);

ALTER TABLE public.cache_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cache: select own"  ON public.cache_entries;
DROP POLICY IF EXISTS "cache: insert own"  ON public.cache_entries;
DROP POLICY IF EXISTS "cache: update own"  ON public.cache_entries;
DROP POLICY IF EXISTS "cache: delete own"  ON public.cache_entries;

-- Users can read/write their own scoped cache rows. Global rows (user_id IS
-- NULL) are read-only from the client; the server uses the service role for
-- those, which bypasses RLS.
CREATE POLICY "cache: select own"
  ON public.cache_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cache: insert own"
  ON public.cache_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cache: update own"
  ON public.cache_entries FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cache: delete own"
  ON public.cache_entries FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_cache_lookup
  ON public.cache_entries (user_id, namespace, cache_key);
CREATE INDEX IF NOT EXISTS idx_cache_expires_at
  ON public.cache_entries (expires_at);

REVOKE ALL ON public.cache_entries FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cache_entries TO authenticated;


-- ---------------------------------------------------------------------------
-- 6. Helper: notification unread count (used by the dashboard bell)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unread_notification_count(p_user UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
    FROM public.notifications
   WHERE user_id = p_user AND read_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.unread_notification_count(UUID) TO authenticated;


-- ---------------------------------------------------------------------------
-- 7. Comments
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.keyword_rankings_history
  IS 'Daily snapshot of each tracked keyword position. Written by /api/cron/daily-rank-snapshot.';
COMMENT ON TABLE public.site_audits
  IS 'One row per crawl run. Latest row per user_id powers the audit dashboard.';
COMMENT ON TABLE public.audit_findings
  IS 'Individual issues found during a crawl. severity in (error, warning, notice).';
COMMENT ON TABLE public.alerts
  IS 'User-configurable alert rules. Cron job /api/cron/check-alerts evaluates these daily.';
COMMENT ON TABLE public.notifications
  IS 'In-app notifications + email outbox state. Created when an alert fires.';
COMMENT ON TABLE public.api_usage_quotas
  IS 'Per-user, per-provider, per-UTC-day counter. Used by lib/quota.ts to enforce daily caps.';
COMMENT ON TABLE public.cache_entries
  IS 'Generic KV cache (Postgres-backed). lib/cache.ts wraps this with TTL.';
