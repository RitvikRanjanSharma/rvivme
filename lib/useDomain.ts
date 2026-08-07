"use client";

// lib/useDomain.ts
// =============================================================================
// AI Marketing Lab — useDomain hook
// Reads website_url from public.users. Returns "" when the user hasn't set
// one yet (and pages should render an empty-state, NOT silently substitute
// our own domain — that used to make new dashboards look populated with
// fake data from aimarketinglab.co.uk, which is dishonest).
// =============================================================================

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

function clean(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").trim();
}

export function useDomain() {
  const [domain,  setDomain]  = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    // Hydrate from localStorage cache (set by settings save) for instant paint.
    const cached = typeof window !== "undefined" && localStorage.getItem("aiml-domain");
    if (cached) { setDomain(cached); setLoading(false); }

    async function fetchDomain() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setDomain(""); setLoading(false); return; }

        const { data, error: dbErr } = await supabase
          .from("users").select("website_url").eq("id", user.id).single();
        const row = data as { website_url: string } | null;

        if (dbErr || !row?.website_url || row.website_url === "https://example.com") {
          setDomain("");
          if (typeof window !== "undefined") localStorage.removeItem("aiml-domain");
        } else {
          const d = clean(row.website_url);
          setDomain(d);
          if (typeof window !== "undefined") localStorage.setItem("aiml-domain", d);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setDomain("");
      } finally {
        setLoading(false);
      }
    }
    fetchDomain();
  }, []);

  return { domain, loading, error };
}
