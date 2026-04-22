// lib/supabase-server.ts
// =============================================================================
// AI Marketing Lab — Server-side Supabase client
// =============================================================================
// For use in Route Handlers and Server Actions. Reads the Supabase session from
// Next.js cookies so RLS can see the authenticated user. The browser client in
// lib/supabase.ts cannot do this — it has no access to server cookies.
//
// In Next.js 16, cookies() is async. We build the client lazily inside each
// route so the cookie store is resolved at request time.
// =============================================================================

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase";

export async function getServerSupabase() {
  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY in the server environment."
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        // Route Handlers can set cookies; the try/catch covers Server Component
        // calls where set() is disallowed.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* read-only context — safe to ignore */
        }
      },
    },
  });
}

/**
 * Convenience helper — returns { supabase, user } or null when there is no
 * authenticated session. Use in route handlers that must 401 unauthenticated
 * callers.
 */
export async function getCallerOrNull() {
  const supabase = await getServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { supabase, user };
}
