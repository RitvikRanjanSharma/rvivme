// lib/supabase.ts
// =============================================================================
// AI Marketing Labs — Supabase Client
// Browser-safe singleton. Import this anywhere in the app.
// =============================================================================

import { createBrowserClient } from "@supabase/ssr";

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
    };
  };
};

// Singleton browser client — safe to import in Client Components and Server Actions
let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getSupabase() {
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}

// Named export for convenience
export const supabase = getSupabase();