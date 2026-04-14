// lib/useDomain.ts
// =============================================================================
// AIMarketingLabs — useDomain hook
// Reads the authenticated user's website_url from Supabase public.users table.
// Falls back to aimarketinglabs.co.uk during development / before auth is set up.
// =============================================================================

"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const FALLBACK_DOMAIN = "aimarketinglabs.co.uk";

function cleanDomain(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .trim();
}

export function useDomain() {
  const [domain,  setDomain]  = useState<string>(FALLBACK_DOMAIN);
  const [loading, setLoading] = useState<boolean>(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    async function fetchDomain() {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setDomain(FALLBACK_DOMAIN);
          setLoading(false);
          return;
        }

        const { data, error: dbError } = await supabase
          .from("users")
          .select("website_url")
          .eq("id", user.id)
          .single();

        if (dbError || !data?.website_url) {
          setDomain(FALLBACK_DOMAIN);
        } else {
          setDomain(cleanDomain(data.website_url));
        }
      } catch (err: any) {
        setError(err.message);
        setDomain(FALLBACK_DOMAIN);
      } finally {
        setLoading(false);
      }
    }

    fetchDomain();
  }, []);

  return { domain, loading, error };
}
