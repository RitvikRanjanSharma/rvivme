// middleware.ts
// =============================================================================
// AI Marketing Lab — AI crawler observation
//
// Records when an answer-engine crawler fetches a page on THIS domain. Runs at
// the edge on every non-asset request, checks the User-Agent, and fires a
// non-blocking log when it matches a known AI bot.
//
// Why middleware and not a script tag: crawlers don't execute JavaScript. A
// client-side tag cannot see them at all — any product claiming to track AI
// bots that way is measuring nothing. Server-side is the only honest option.
//
// Scope, stated plainly: this observes crawlers hitting aimarketinglab.co.uk.
// Doing the same for a customer's site requires equivalent middleware on their
// own server, which is a separate (and much larger) piece of work. The
// robots.txt + readiness audit in /api/geo/crawlers is what we can offer every
// customer today with no installation.
//
// Deliberately cheap: no awaits on the hot path, no database call in the
// request lifecycle, and it fails silently. A logging feature must never be
// able to break page delivery.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { identifyCrawler } from "@/lib/ai-crawlers";

export const config = {
  // Skip Next internals, the API surface, and static assets. Crawlers fetching
  // a .png tell us nothing useful and would triple the write volume.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?|ttf|map)$).*)",
  ],
};

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  try {
    const crawler = identifyCrawler(request.headers.get("user-agent"));
    if (!crawler) return response;

    const origin = request.nextUrl.origin;

    // Fire-and-forget. Not awaited: an edge request must not wait on our own
    // logging, and a failure here is irrelevant to the visitor.
    void fetch(`${origin}/api/geo/crawler-hit`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        // Shared secret so the endpoint can't be spammed to fabricate traffic.
        "x-aiml-internal": process.env.INTERNAL_LOG_SECRET ?? "",
      },
      body: JSON.stringify({
        crawler: crawler.token,
        path:    request.nextUrl.pathname,
        at:      new Date().toISOString(),
      }),
    }).catch(() => { /* logging must never surface to the visitor */ });

  } catch {
    /* never let observation break delivery */
  }

  return response;
}
