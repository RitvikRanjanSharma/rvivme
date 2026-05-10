// lib/cron.ts
// =============================================================================
// AI Marketing Lab — Cron route helpers
// =============================================================================
// Vercel Cron sends GET requests with an Authorization: Bearer <CRON_SECRET>
// header to whichever paths are listed in vercel.json. We expose a tiny
// helper that:
//   1. Verifies the secret so a public hit can't trigger heavy jobs.
//   2. Builds a service-role Supabase client that bypasses RLS — cron jobs
//      run in a server-only context, not on behalf of any user.
//
// SUPABASE_SERVICE_ROLE_KEY must be set in the Vercel env. If it's missing
// the helpers throw, which surfaces as a 500 in the cron logs — preferable
// to silently doing nothing.
// =============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase";

export function verifyCron(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  // Vercel's built-in cron uses Authorization: Bearer <secret>. We also accept
  // ?secret= for manual triggering during development.
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const querySecret = req.nextUrl.searchParams.get("secret") ?? "";

  if (!expected) {
    // No secret configured. Allow in dev; reject in production.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET not set in environment" },
        { status: 500 },
      );
    }
    return null;
  }

  if (bearer !== expected && querySecret !== expected) {
    return NextResponse.json(
      { success: false, error: "unauthorized" },
      { status: 401 },
    );
  }
  return null;
}

export function getServiceSupabase(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "getServiceSupabase requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
