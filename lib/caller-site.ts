// lib/caller-site.ts
// =============================================================================
// AI Marketing Lab — "which site am I working on, and can I reach it?"
//
// WHY THIS EXISTS
//
// Eight routes opened with the same fifteen lines: read the caller's row from
// public.users, pull gsc_site_url, bail if it's empty. Every copy made the
// same two mistakes.
//
// MISTAKE ONE — .single() TREATS A MISSING PROFILE AS AN INTEGRATION PROBLEM
//
// .single() raises when the query matches no rows, and every copy caught that
// error and returned:
//
//     reason: "not_configured"
//     "Search Console is not connected for your workspace yet."
//
// But a missing row in public.users is not a disconnected integration. It is
// the signup-trigger bug fixed in migration 015, and the user sent to
// Settings → Integrations to reconnect Search Console will reconnect it
// successfully and see exactly the same message, because the integration was
// never the problem. An error message that sends someone to the wrong screen
// costs more than no message at all.
//
// .maybeSingle() returns null instead of raising, which lets us tell "no row"
// from "row with nothing in it" and name each correctly.
//
// MISTAKE TWO — THE SIGNUP SENTINEL COUNTS AS A REAL SITE
//
// New accounts get website_url = 'https://example.com' from the trigger. Routes
// that fell back to website_url would happily audit example.com and present the
// findings as the customer's own.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

/** What the signup trigger writes when no site was given. Never a real target. */
export const SITE_SENTINEL = "https://example.com";

export type CallerSite =
  | { ok: true;  siteUrl: string; websiteUrl: string | null }
  | { ok: false; reason: "no_profile" | "not_configured"; message: string };

type AnyClient = SupabaseClient<any, any, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any

function usable(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v || v === SITE_SENTINEL) return null;
  return v;
}

/**
 * The caller's Search Console property, or a reason we can act on.
 *
 * `no_profile` is deliberately distinct from `not_configured`: one is our bug
 * and self-heals, the other is a setup step the user has to do.
 */
export async function callerGscSite(
  supabase: AnyClient,
  userId: string,
): Promise<CallerSite> {
  const { data, error } = await supabase
    .from("users")
    .select("gsc_site_url, website_url")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return {
      ok: false, reason: "not_configured",
      message: `Couldn't read your workspace settings: ${error.message}`,
    };
  }

  const row = data as { gsc_site_url: string | null; website_url: string | null } | null;

  if (!row) {
    return {
      ok: false, reason: "no_profile",
      message: "Your account is missing its profile record, so we have nowhere to read your site from. Reload the page — the app repairs this automatically. If it persists, sign out and back in.",
    };
  }

  const siteUrl = usable(row.gsc_site_url);
  if (!siteUrl) {
    return {
      ok: false, reason: "not_configured",
      message: "Search Console isn't connected yet. Add your property under Settings → Integrations.",
    };
  }

  return { ok: true, siteUrl, websiteUrl: usable(row.website_url) };
}

/** Strip `sc-domain:` / scheme so the UI can treat it as a plain domain. */
export function deriveDomain(siteUrl: string): string {
  if (siteUrl.startsWith("sc-domain:")) return siteUrl.slice("sc-domain:".length);
  try { return new URL(siteUrl).hostname.replace(/^www\./, ""); } catch { return siteUrl; }
}
