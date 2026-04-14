// =============================================================================
// FILE 1: app/auth/callback/route.ts
// Handles the OAuth redirect from Supabase after Google login
// =============================================================================

// app/auth/callback/route.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code     = searchParams.get("code");
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  if (code) {
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
      }
    );
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${redirect}`);
}


// =============================================================================
// FILE 2: app/auth/signout/route.ts
// Server-side sign out — clears the session cookie then redirects to login
// =============================================================================

// app/auth/signout/route.ts
// import { createServerClient } from "@supabase/ssr";
// import { cookies } from "next/headers";
// import { NextResponse } from "next/server";
//
// export async function POST(request: Request) {
//   const cookieStore = await cookies();
//   const supabase = createServerClient(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
//     {
//       cookies: {
//         getAll: () => cookieStore.getAll(),
//         setAll: (cookiesToSet) => {
//           cookiesToSet.forEach(({ name, value, options }) =>
//             cookieStore.set(name, value, options)
//           );
//         },
//       },
//     }
//   );
//   await supabase.auth.signOut();
//   return NextResponse.redirect(new URL("/auth/login", request.url));
// }
