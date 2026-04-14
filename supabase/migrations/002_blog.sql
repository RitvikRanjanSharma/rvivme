-- =============================================================================
-- AI Marketing Labs — Blog System Schema
-- Run AFTER the main schema.sql (depends on public.users existing)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.post_status AS ENUM (
  'draft', 'scheduled', 'published', 'archived'
);

CREATE TYPE public.post_category AS ENUM (
  'seo_strategy',
  'geo_optimisation',
  'technical_seo',
  'content_marketing',
  'business_insights',
  'platform_updates',
  'case_studies',
  'industry_news'
);

-- ---------------------------------------------------------------------------
-- 2. blog_posts
-- ---------------------------------------------------------------------------
CREATE TABLE public.blog_posts (
  id                  UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id           UUID                   NOT NULL
                                             REFERENCES public.users (id)
                                             ON DELETE SET NULL,

  -- Content
  title               TEXT                   NOT NULL
                                             CHECK (char_length(title) BETWEEN 3 AND 200),
  slug                TEXT                   NOT NULL UNIQUE
                                             CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  excerpt             TEXT                   NOT NULL
                                             CHECK (char_length(excerpt) BETWEEN 10 AND 500),
  content             TEXT                   NOT NULL,
  cover_image_url     TEXT,
  read_time_minutes   SMALLINT               NOT NULL DEFAULT 5
                                             CHECK (read_time_minutes BETWEEN 1 AND 120),

  -- Taxonomy
  category            public.post_category   NOT NULL DEFAULT 'seo_strategy',

  -- SEO meta fields
  meta_title          TEXT                   CHECK (char_length(meta_title) <= 70),
  meta_description    TEXT                   CHECK (char_length(meta_description) <= 160),
  focus_keyword       TEXT,
  secondary_keywords  TEXT[]                 DEFAULT '{}',
  canonical_url       TEXT,

  -- Author display fields (denormalised for public rendering without join)
  author_name         TEXT                   NOT NULL DEFAULT 'AI Marketing Labs Editorial',
  author_bio          TEXT,
  author_avatar_url   TEXT,

  -- Status & scheduling
  status              public.post_status     NOT NULL DEFAULT 'draft',
  published_at        TIMESTAMPTZ,
  scheduled_for       TIMESTAMPTZ,

  -- Engagement
  view_count          INTEGER                NOT NULL DEFAULT 0,
  featured            BOOLEAN                NOT NULL DEFAULT FALSE,

  -- Timestamps
  created_at          TIMESTAMPTZ            NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ            NOT NULL DEFAULT now()
);

-- Auto-compute read time trigger
CREATE OR REPLACE FUNCTION public.compute_read_time()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Average reading speed: 238 words per minute
  NEW.read_time_minutes := GREATEST(1, ROUND(
    array_length(regexp_split_to_array(trim(NEW.content), '\s+'), 1)::numeric / 238
  ));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_blog_read_time
  BEFORE INSERT OR UPDATE OF content ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.compute_read_time();

CREATE TRIGGER trg_blog_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Set published_at automatically when status transitions to 'published'
CREATE OR REPLACE FUNCTION public.handle_post_publish()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status != 'published' THEN
    NEW.published_at := COALESCE(NEW.published_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_post_publish
  BEFORE UPDATE OF status ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.handle_post_publish();

-- RLS
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- Public can read published posts
CREATE POLICY "posts: public read published"
  ON public.blog_posts FOR SELECT
  USING (status = 'published');

-- Authenticated authors can read all their own posts (including drafts)
CREATE POLICY "posts: author reads own"
  ON public.blog_posts FOR SELECT
  USING (auth.uid() = author_id);

-- Authors can insert their own posts
CREATE POLICY "posts: author insert"
  ON public.blog_posts FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- Authors can update their own posts
CREATE POLICY "posts: author update"
  ON public.blog_posts FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- Authors can delete their own drafts only (not published posts)
CREATE POLICY "posts: author delete draft"
  ON public.blog_posts FOR DELETE
  USING (auth.uid() = author_id AND status = 'draft');

-- Indexes
CREATE INDEX idx_posts_status_published  ON public.blog_posts (status, published_at DESC)
  WHERE status = 'published';
CREATE INDEX idx_posts_author            ON public.blog_posts (author_id);
CREATE INDEX idx_posts_category          ON public.blog_posts (category);
CREATE INDEX idx_posts_slug              ON public.blog_posts (slug);
CREATE INDEX idx_posts_featured          ON public.blog_posts (featured) WHERE featured = TRUE;
CREATE INDEX idx_posts_focus_keyword     ON public.blog_posts (focus_keyword);

-- ---------------------------------------------------------------------------
-- 3. tags
-- ---------------------------------------------------------------------------
CREATE TABLE public.tags (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT  NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 50),
  slug       TEXT  NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags: public read"
  ON public.tags FOR SELECT USING (TRUE);

CREATE POLICY "tags: authenticated insert"
  ON public.tags FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 4. post_tags (junction)
-- ---------------------------------------------------------------------------
CREATE TABLE public.post_tags (
  post_id UUID NOT NULL REFERENCES public.blog_posts (id) ON DELETE CASCADE,
  tag_id  UUID NOT NULL REFERENCES public.tags          (id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

ALTER TABLE public.post_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_tags: public read"
  ON public.post_tags FOR SELECT USING (TRUE);

CREATE POLICY "post_tags: author manage"
  ON public.post_tags FOR ALL
  USING (
    auth.uid() = (SELECT author_id FROM public.blog_posts WHERE id = post_id)
  );

CREATE INDEX idx_post_tags_post ON public.post_tags (post_id);
CREATE INDEX idx_post_tags_tag  ON public.post_tags (tag_id);

-- ---------------------------------------------------------------------------
-- 5. newsletter_subscribers
-- ---------------------------------------------------------------------------
CREATE TABLE public.newsletter_subscribers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT        NOT NULL UNIQUE
                           CHECK (email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'),
  confirmed    BOOLEAN     NOT NULL DEFAULT FALSE,
  confirm_token TEXT       UNIQUE,
  source       TEXT        NOT NULL DEFAULT 'blog',  -- 'blog' | 'homepage' | 'post'
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE
);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Only service_role can read subscribers (admin use)
CREATE POLICY "subscribers: no public read"
  ON public.newsletter_subscribers FOR SELECT USING (FALSE);

-- Anyone can subscribe (INSERT)
CREATE POLICY "subscribers: public insert"
  ON public.newsletter_subscribers FOR INSERT WITH CHECK (TRUE);

CREATE INDEX idx_subscribers_email  ON public.newsletter_subscribers (email);
CREATE INDEX idx_subscribers_active ON public.newsletter_subscribers (is_active) WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- 6. post_view_events  (lightweight analytics, append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE public.post_view_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID        NOT NULL REFERENCES public.blog_posts (id) ON DELETE CASCADE,
  viewer_ip  TEXT,                        -- hashed at application layer before insert
  referrer   TEXT,
  user_agent TEXT,
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.post_view_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "views: public insert"
  ON public.post_view_events FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "views: author reads own"
  ON public.post_view_events FOR SELECT
  USING (
    auth.uid() = (SELECT author_id FROM public.blog_posts WHERE id = post_id)
  );

CREATE INDEX idx_view_events_post    ON public.post_view_events (post_id);
CREATE INDEX idx_view_events_time    ON public.post_view_events (viewed_at DESC);

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------
GRANT SELECT                          ON public.blog_posts            TO anon;
GRANT SELECT                          ON public.tags                  TO anon;
GRANT SELECT                          ON public.post_tags             TO anon;
GRANT INSERT                          ON public.newsletter_subscribers TO anon;
GRANT INSERT                          ON public.post_view_events      TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE  ON public.blog_posts            TO authenticated;
GRANT SELECT, INSERT                  ON public.tags                  TO authenticated;
GRANT SELECT, INSERT, DELETE          ON public.post_tags             TO authenticated;
GRANT SELECT                          ON public.post_view_events      TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Seed: initial tags
-- ---------------------------------------------------------------------------
INSERT INTO public.tags (name, slug) VALUES
  ('SEO',                  'seo'),
  ('GEO',                  'geo'),
  ('Technical SEO',        'technical-seo'),
  ('Content Strategy',     'content-strategy'),
  ('Link Building',        'link-building'),
  ('Keyword Research',     'keyword-research'),
  ('Core Web Vitals',      'core-web-vitals'),
  ('AI Search',            'ai-search'),
  ('Google',               'google'),
  ('Hatfield UK',          'hatfield-uk'),
  ('Business Strategy',    'business-strategy'),
  ('Case Study',           'case-study'),
  ('RVIVME',               'rvivme'),
  ('DataForSEO',           'dataforseo'),
  ('Competitor Analysis',  'competitor-analysis')
ON CONFLICT (slug) DO NOTHING;
