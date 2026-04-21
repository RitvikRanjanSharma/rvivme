// lib/supabase.ts
// =============================================================================
// AI Marketing Lab — Supabase Client
// Browser-safe singleton. Import this anywhere in the app.
// Resilient: if env vars are missing the module still loads so UI can render
// a useful error instead of a white screen.
// =============================================================================

import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!isSupabaseConfigured && typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.warn(
    "[AI Marketing Lab] Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
    "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, then restart the dev server."
  );
}

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id:                  string;
          company_name:        string;
          website_url:         string;
          primary_color_hex:   string;
          subscription_tier:   "free" | "starter" | "professional" | "enterprise";
          ga4_connected:       boolean;
          gsc_connected:       boolean;
          logo_url:            string | null;
          avatar_url:          string | null;
          theme_mode:          "dark" | "light";
          onboarding_complete: boolean;
          created_at:          string;
          updated_at:          string;
        };
        Insert: Partial<Database["public"]["Tables"]["users"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["users"]["Row"]>;
      };
      competitors: {
        Row: {
          id:               string;
          user_id:          string;
          competitor_url:   string;
          domain:           string;
          discovered_via_ai:boolean;
          domain_authority: number | null;
          monthly_traffic:  number | null;
          last_crawled_at:  string | null;
          is_active:        boolean;
          notes:            string | null;
          created_at:       string;
          updated_at:       string;
        };
        Insert: Partial<Database["public"]["Tables"]["competitors"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["competitors"]["Row"]>;
      };
      growth_predictions: {
        Row: {
          id:                string;
          user_id:           string;
          month:             string;
          projected_traffic: number;
          actual_traffic:    number | null;
          confidence_score:  number;
          model_version:     string;
          is_forecast:       boolean;
          created_at:        string;
        };
        Insert: Partial<Database["public"]["Tables"]["growth_predictions"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["growth_predictions"]["Row"]>;
      };
      data_provider_logs: {
        Row: {
          id:          string;
          user_id:     string;
          provider:    "dataforseo" | "semrush" | "google_sc" | "google_analytics";
          endpoint:    string;
          cost_units:  number;
          status_code: number | null;
          error_msg:   string | null;
          called_at:   string;
        };
        Insert: Partial<Database["public"]["Tables"]["data_provider_logs"]["Row"]>;
        Update: never;
      };
      ai_strategies: {
        Row: {
          id:           string;
          user_id:      string;
          title:        string;
          rationale:    string;
          impact_score: number;
          effort_score: number;
          status:       "pending" | "active" | "completed" | "dismissed";
          generated_at: string;
          actioned_at:  string | null;
          created_at:   string;
        };
        Insert: Partial<Database["public"]["Tables"]["ai_strategies"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["ai_strategies"]["Row"]>;
      };
      blog_posts: {
        Row: {
          id: string;
          author_id: string;
          title: string;
          slug: string;
          excerpt: string;
          content: string;
          cover_image_url: string | null;
          read_time_minutes: number;
          category:
            | "seo_strategy"
            | "geo_optimisation"
            | "technical_seo"
            | "content_marketing"
            | "business_insights"
            | "platform_updates"
            | "case_studies"
            | "industry_news";
          meta_title: string | null;
          meta_description: string | null;
          focus_keyword: string | null;
          secondary_keywords: string[] | null;
          canonical_url: string | null;
          author_name: string;
          author_bio: string | null;
          author_avatar_url: string | null;
          status: "draft" | "scheduled" | "published" | "archived";
          published_at: string | null;
          scheduled_for: string | null;
          view_count: number;
          featured: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["blog_posts"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["blog_posts"]["Row"]>;
      };
      newsletter_subscribers: {
        Row: {
          id: string;
          email: string;
          confirmed: boolean;
          confirm_token: string | null;
          source: string;
          subscribed_at: string;
          unsubscribed_at: string | null;
          is_active: boolean;
        };
        Insert: {
          email: string;
          source?: string;
          confirmed?: boolean;
          confirm_token?: string | null;
          subscribed_at?: string;
          unsubscribed_at?: string | null;
          is_active?: boolean;
          id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["newsletter_subscribers"]["Row"]>;
      };
    };
  };
};

// Singleton browser client — safe to import in Client Components and Server Actions
let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getSupabase() {
  if (!client) {
    client = createBrowserClient<Database>(
      SUPABASE_URL      ?? "http://localhost:54321",
      SUPABASE_ANON_KEY ?? "public-anon-key-placeholder"
    );
  }
  return client;
}

// Named export for convenience
export const supabase = getSupabase();
