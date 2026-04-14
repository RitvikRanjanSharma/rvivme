-- =============================================================================
-- AI Marketing Labs — God Mode Database Schema v1.0
-- Supabase PostgreSQL · Strict RLS · Full Audit Trail
-- Run in: Supabase Dashboard → SQL Editor
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.subscription_tier AS ENUM (
  'free', 'starter', 'professional', 'enterprise'
);

CREATE TYPE public.data_provider AS ENUM (
  'dataforseo', 'ahrefs', 'semrush', 'google_sc', 'google_analytics'
);

CREATE TYPE public.strategy_status AS ENUM (
  'pending', 'active', 'completed', 'dismissed'
);

CREATE TYPE public.theme_mode AS ENUM ('dark', 'light');

-- ---------------------------------------------------------------------------
-- 2. users  (mirrors auth.users 1:1)
-- ---------------------------------------------------------------------------
CREATE TABLE public.users (
  id                  UUID                     PRIMARY KEY
                                               REFERENCES auth.users (id)
                                               ON DELETE CASCADE,
  company_name        TEXT                     NOT NULL
                                               CHECK (char_length(company_name) BETWEEN 1 AND 200),
  website_url         TEXT                     NOT NULL
                                               CHECK (website_url ~* '^https?://'),
  primary_color_hex   CHAR(7)                  NOT NULL DEFAULT '#3b82f6'
                                               CHECK (primary_color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  subscription_tier   public.subscription_tier NOT NULL DEFAULT 'free',
  ga4_connected       BOOLEAN                  NOT NULL DEFAULT FALSE,
  gsc_connected       BOOLEAN                  NOT NULL DEFAULT FALSE,
  logo_url            TEXT,
  avatar_url          TEXT,
  theme_mode          public.theme_mode        NOT NULL DEFAULT 'dark',
  onboarding_complete BOOLEAN                  NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ              NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ              NOT NULL DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users: select own"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users: update own"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users: no direct insert"
  ON public.users FOR INSERT
  WITH CHECK (false);

CREATE POLICY "users: no direct delete"
  ON public.users FOR DELETE
  USING (false);

-- ---------------------------------------------------------------------------
-- 3. competitors
-- ---------------------------------------------------------------------------
CREATE TABLE public.competitors (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID         NOT NULL
                                 REFERENCES public.users (id) ON DELETE CASCADE,
  competitor_url    TEXT         NOT NULL
                                 CHECK (competitor_url ~* '^https?://'),
  domain            TEXT         GENERATED ALWAYS AS (
                                   regexp_replace(
                                     regexp_replace(competitor_url, '^https?://', ''),
                                     '^www\.', ''
                                   )
                                 ) STORED,
  discovered_via_ai BOOLEAN      NOT NULL DEFAULT FALSE,
  domain_authority  SMALLINT     CHECK (domain_authority BETWEEN 0 AND 100),
  monthly_traffic   INTEGER      CHECK (monthly_traffic >= 0),
  last_crawled_at   TIMESTAMPTZ,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  notes             TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (user_id, competitor_url)
);

ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "competitors: select own"
  ON public.competitors FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "competitors: insert own"
  ON public.competitors FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "competitors: update own"
  ON public.competitors FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "competitors: delete own"
  ON public.competitors FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_competitors_user_id ON public.competitors (user_id);
CREATE INDEX idx_competitors_domain  ON public.competitors (domain);

-- ---------------------------------------------------------------------------
-- 4. growth_predictions
-- ---------------------------------------------------------------------------
CREATE TABLE public.growth_predictions (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL
                                  REFERENCES public.users (id) ON DELETE CASCADE,
  month             DATE          NOT NULL,
  projected_traffic INTEGER       NOT NULL CHECK (projected_traffic >= 0),
  actual_traffic    INTEGER       CHECK (actual_traffic >= 0),
  confidence_score  NUMERIC(4,3)  NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  model_version     TEXT          NOT NULL DEFAULT 'v1.0',
  is_forecast       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

ALTER TABLE public.growth_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "predictions: select own"
  ON public.growth_predictions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "predictions: insert own"
  ON public.growth_predictions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "predictions: update own"
  ON public.growth_predictions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "predictions: delete own"
  ON public.growth_predictions FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_predictions_user_month
  ON public.growth_predictions (user_id, month DESC);

-- ---------------------------------------------------------------------------
-- 5. data_provider_logs  (per-user API cost + error audit)
-- ---------------------------------------------------------------------------
CREATE TABLE public.data_provider_logs (
  id          UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID                  NOT NULL
                                    REFERENCES public.users (id) ON DELETE CASCADE,
  provider    public.data_provider  NOT NULL,
  endpoint    TEXT                  NOT NULL,
  cost_units  NUMERIC(10, 4)        NOT NULL DEFAULT 0,
  status_code SMALLINT,
  error_msg   TEXT,
  called_at   TIMESTAMPTZ           NOT NULL DEFAULT now()
);

ALTER TABLE public.data_provider_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logs: select own"
  ON public.data_provider_logs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "logs: insert own"
  ON public.data_provider_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "logs: no update"
  ON public.data_provider_logs FOR UPDATE USING (false);

CREATE POLICY "logs: no delete"
  ON public.data_provider_logs FOR DELETE USING (false);

CREATE INDEX idx_logs_user_provider ON public.data_provider_logs (user_id, provider);
CREATE INDEX idx_logs_called_at     ON public.data_provider_logs (called_at DESC);

-- ---------------------------------------------------------------------------
-- 6. ai_strategies
-- ---------------------------------------------------------------------------
CREATE TABLE public.ai_strategies (
  id            UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID                    NOT NULL
                                        REFERENCES public.users (id) ON DELETE CASCADE,
  title         TEXT                    NOT NULL,
  rationale     TEXT                    NOT NULL,
  impact_score  NUMERIC(3, 1)           NOT NULL CHECK (impact_score BETWEEN 0 AND 10),
  effort_score  NUMERIC(3, 1)           NOT NULL CHECK (effort_score BETWEEN 0 AND 10),
  status        public.strategy_status  NOT NULL DEFAULT 'pending',
  generated_at  TIMESTAMPTZ             NOT NULL DEFAULT now(),
  actioned_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ             NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "strategies: select own"
  ON public.ai_strategies FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "strategies: insert own"
  ON public.ai_strategies FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "strategies: update own"
  ON public.ai_strategies FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "strategies: delete own"
  ON public.ai_strategies FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_strategies_user_status
  ON public.ai_strategies (user_id, status);

-- ---------------------------------------------------------------------------
-- 7. Triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_competitors_updated_at
  BEFORE UPDATE ON public.competitors
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, company_name, website_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'company_name', 'Unnamed Organisation'),
    COALESCE(NEW.raw_user_meta_data ->> 'website_url',  'https://example.com')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- 8. Privilege grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.users              FROM anon;
REVOKE ALL ON public.competitors        FROM anon;
REVOKE ALL ON public.growth_predictions FROM anon;
REVOKE ALL ON public.data_provider_logs FROM anon;
REVOKE ALL ON public.ai_strategies      FROM anon;

GRANT SELECT, UPDATE
  ON public.users TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.competitors        TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.growth_predictions TO authenticated;

GRANT SELECT, INSERT
  ON public.data_provider_logs TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.ai_strategies      TO authenticated;
