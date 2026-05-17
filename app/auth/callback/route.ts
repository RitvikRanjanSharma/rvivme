// app/auth/callback/route.ts
// =============================================================================
// AI Marketing Lab — OAuth / magic-link callback
// =============================================================================
// Handles the redirect from Supabase Auth after a sign-in. Two responsibilities:
//
//   1. Exchange the auth code for a session cookie.
//   2. Decide whether to send the user to /onboarding (first-time login) or
//      to the requested redirect (everything else).
//
// We intentionally don't trust client-side flags for the routing decision —
// public.users.onboarding_complete is the source of truth. New users are
// created with onboarding_complete = FALSE by the handle_new_auth_user
// trigger in migration 001.
// =============================================================================

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code     = searchParams.get("code");
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    },
  );

  await supabase.auth.exchangeCodeForSession(code);

  // Look up the user's onboarding state. If we can't read it (e.g. the row
  // hasn't been created yet by the trigger), default to onboarding to be safe.
  const { data: { user } } = await supabase.auth.getUser();
  let target = redirect;
  if (user) {
    const rowRes = await supabase
      .from("users")
      .select("onboarding_complete")
      .eq("id", user.id)
      .maybeSingle();
    const row = rowRes.data as { onboarding_complete?: boolean } | null;

    const completed = row?.onboarding_complete === true;
    if (!completed) target = "/onboarding";
  }

  return NextResponse.redirect(`${origin}${target}`);
}
