// lib/site-admin.ts
// =============================================================================
// AI Marketing Lab — server-side admin gate
//
// THE DISTINCTION THAT MATTERS
//
// lib/admin.ts holds a NEXT_PUBLIC_ list of admin emails. That runs in the
// browser and decides who is shown the editor. It is not a security boundary
// and must never be treated as one — anyone can read a NEXT_PUBLIC_ value, and
// anyone can call the Supabase REST API directly with their own session and
// skip our UI entirely.
//
// The real boundary is public.is_site_admin() in the database, enforced by RLS
// on every write. This module is the third layer: a server-side check so admin
// PAGES refuse to render for a non-admin, rather than rendering an editor whose
// saves then fail. Three layers, each doing a different job:
//
//   browser list  → who sees the link            (cosmetic)
//   this module   → who can open the page        (server, blocks the UI)
//   RLS policy    → who can change data          (authoritative)
//
// Only the third actually protects anything. The other two exist so the
// experience is coherent, and so a mistake in either cannot grant access.
// =============================================================================

import { getServerSupabase } from "@/lib/supabase-server";

export type AdminCheck =
  | { ok: true;  email: string }
  | { ok: false; reason: "unauthenticated" | "not_admin" | "unavailable" };

/**
 * Ask the DATABASE whether the current session is an administrator.
 *
 * Deliberately calls is_site_admin() rather than comparing the session email
 * against an env var. The database is what enforces writes, so asking it
 * directly means the page gate and the write gate can never disagree — if this
 * returns true, the caller's writes will actually succeed, and if it returns
 * false, showing them an editor would only produce confusing failures.
 */
export async function requireSiteAdmin(): Promise<AdminCheck> {
  let supabase;
  try {
    supabase = await getServerSupabase();
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false, reason: "unauthenticated" };

  const { data, error: rpcError } = await supabase.rpc("is_site_admin");

  // A failure here is NOT treated as permission. If we cannot establish that
  // the caller is an admin, they are not one — the safe default for an
  // authorisation check is always denial.
  if (rpcError) return { ok: false, reason: "unavailable" };
  if (data !== true) return { ok: false, reason: "not_admin" };

  return { ok: true, email: user.email ?? "" };
}

/**
 * For Server Actions: throw rather than return, so a forgotten check cannot
 * silently proceed to the write.
 *
 * The message is intentionally identical for every denial. Telling an
 * unauthorised caller whether the address exists, or whether it merely lacks
 * admin rights, discloses something they should not learn from probing.
 */
export async function assertSiteAdmin(): Promise<string> {
  const check = await requireSiteAdmin();
  if (!check.ok) throw new Error("Not authorised.");
  return check.email;
}
