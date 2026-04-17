"use client";

// lib/useDomain.ts
// =============================================================================
// AI Marketing Labs — useDomain hook
// Reads website_url from Supabase public.users
// Falls back to aimarketinglab.co.uk
// =============================================================================

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const FALLBACK = "aimarketinglab.co.uk";

function clean(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").trim();
}

export function useDomain() {
  const [domain,  setDomain]  = useState<string>(FALLBACK);
  const [loading, setLoading] = useState<boolean>(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    // Check localStorage cache first (set by settings save)
    const cached = typeof window !== "undefined" && localStorage.getItem("aiml-domain");
    if (cached) { setDomain(cached); setLoading(false); }

    async function fetch() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setDomain(FALLBACK); setLoading(false); return; }

        const { data, error: dbErr } = await supabase
        .from("users").select("website_url").eq("id", user.id).single();
            const row = data as { website_url: string } | null;

            if (dbErr || !row?.website_url) {
              setDomain(FALLBACK);
            } else {
              const d = clean(row.website_url);
          setDomain(d);
          if (typeof window !== "undefined") localStorage.setItem("aiml-domain", d);
        }
      } catch (e: any) {
        setError(e.message);
        setDomain(FALLBACK);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  return { domain, loading, error };
}
