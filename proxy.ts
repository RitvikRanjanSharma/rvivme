// proxy.ts
// =============================================================================
// AI Marketing Lab — Route Protection Proxy (Next.js 16+ file convention)
// Public:    /, /blog, /blog/*, /auth/*
// Protected: /dashboard, /keywords, /competitors, /settings
//
// Next.js 16 renamed `middleware.ts` to `proxy.ts` and allows only ONE such
// file, so this handles two concerns rather than one:
//   1. Route protection (below)
//   2. AI crawler observation (logCrawlerVisit)
// =============================================================================

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { identifyCrawler } from "@/lib/ai-crawlers";
import { getCachedRedirects, matchRedirect } from "@/lib/redirect-cache";

const PROTECTED_PREFIXES = [
  "/dashboard", "/keywords", "/competitors", "/settings",
  // Strategy authoring is a dashboard-tier feature.
  "/strategies",
  // Onboarding — anonymous visitors should be sent to /auth/login first.
  "/onboarding",
  // Alerts inbox + audit detail
  "/alerts", "/audit",
  // Strategist surfaces
  "/opportunities", "/geo", "/local",
  // Operator panel. The real gate is is_site_admin() in the database, checked
  // in app/admin/layout.tsx — this only saves an anonymous visitor from being
  // shown an authorisation error where a login prompt is the useful response.
  "/admin",
];
const AUTH_ROUTES        = ["/auth/login", "/auth/signup"];

// ── AI crawler observation ───────────────────────────────────────────────────
// Records when an answer-engine crawler fetches a page on THIS domain.
//
// Why here and not a script tag: crawlers don't execute JavaScript. A
// client-side tag cannot see them at all — any product claiming to track AI
// bots that way is measuring nothing. Server-side is the only honest option.
//
// Scope, stated plainly: this observes crawlers hitting our own domain. Doing
// the same for a customer's site needs equivalent logging on their server. The
// robots.txt + readiness audit in /api/geo/crawlers is what we can offer every
// customer today with no installation.
//
// Deliberately cheap: nothing is awaited, no database call sits in the request
// lifecycle, and it fails silently. Logging must never break page delivery.
const SKIP_LOG_PREFIXES = ["/api/", "/_next/"];

function logCrawlerVisit(request: NextRequest): void {
  try {
    const { pathname, origin } = request.nextUrl;
    if (SKIP_LOG_PREFIXES.some(p => pathname.startsWith(p))) return;

    const secret = process.env.INTERNAL_LOG_SECRET;
    if (!secret) return; // logging disabled rather than posting an empty secret

    const crawler = identifyCrawler(request.headers.get("user-agent"));
    if (!crawler) return;

    // Fire-and-forget. Not awaited: an edge request must not wait on our own
    // logging, and a failure here is irrelevant to the visitor.
    void fetch(`${origin}/api/geo/crawler-hit`, {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        // Shared secret so the endpoint can't be spammed with fake traffic.
        "x-aiml-internal": secret,
      },
      body: JSON.stringify({
        crawler: crawler.token,
        path:    pathname,
        at:      new Date().toISOString(),
      }),
    }).catch(() => { /* logging must never surface to the visitor */ });
  } catch {
    /* never let observation break delivery */
  }
}

export async function proxy(request: NextRequest) {
  // Runs first and never throws, so a crawler hit is recorded even when the
  // request is about to be redirected away from a protected route.
  logCrawlerVisit(request);

  // ── Operator redirects ─────────────────────────────────────────────────────
  // Before auth, because a redirect should apply whether or not someone is
  // signed in — a moved page has moved for everybody.
  //
  // Skipped entirely for assets and API calls. Those are the overwhelming
  // majority of requests, they are never the target of a "we moved this page"
  // rule, and skipping them keeps this off the hot path.
  const path = request.nextUrl.pathname;
  if (!path.startsWith("/_next/") && !path.startsWith("/api/") && !path.includes(".")) {
    try {
      const rules = await getCachedRedirects();
      const hit   = matchRedirect(rules, path);
      if (hit) {
        const destination = hit.destination.startsWith("http")
          ? new URL(hit.destination)
          : new URL(hit.destination, request.nextUrl.origin);
        // Query strings are carried across: dropping them would break every
        // campaign link and every ?utm_ tag pointing at the old URL.
        for (const [k, v] of request.nextUrl.searchParams) {
          if (!destination.searchParams.has(k)) destination.searchParams.append(k, v);
        }
        return NextResponse.redirect(destination, hit.status_code);
      }
    } catch {
      // A redirect lookup failing must never take down the request. Worst case
      // the old URL 404s, which is what it did before anyone added a rule.
    }
  }

  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase isn't configured, don't crash every request — just pass through.
  if (!url || !anonKey) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const cookie of cookiesToSet) {
          supabaseResponse.cookies.set(cookie.name, cookie.value, cookie.options);
        }
      },
    },
  });

  // Wrap in try/catch so a misconfigured Supabase project (e.g. wrong anon key)
  // doesn't 500 every request before the login page can even render.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  const { pathname } = request.nextUrl;

  // Redirect unauthenticated users away from protected routes
  const isProtected = PROTECTED_PREFIXES.some(p => pathname.startsWith(p));
  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth pages
  const isAuthRoute = AUTH_ROUTES.some(p => pathname.startsWith(p));
  if (isAuthRoute && user) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
