// lib/useDomain.ts
// =============================================================================
// AIMarketingLabs — useDomain hook
// Reads the authenticated user's website_url from Supabase public.users table.
// Falls back to aimarketinglab.co.uk during development / before auth is set up.
// =============================================================================

"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const FALLBACK_DOMAIN = "aimarketinglab.co.uk";

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

      const record = data as { website_url: string } | null;

      if (dbError || !record?.website_url) {
        setDomain(FALLBACK_DOMAIN);
      } else {
        setDomain(cleanDomain(record.website_url));
      }
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unable to resolve domain");
        setDomain(FALLBACK_DOMAIN);
      } finally {
        setLoading(false);
      }
    }

    fetchDomain();
  }, []);

  return { domain, loading, error };
}
