// app/api/competitors/measure/route.ts
// =============================================================================
// AI Marketing Lab — measure one site, for real
//
// Returns only things observed by fetching the site: homepage content, robots
// rules, sitemap size. See lib/competitor-compare.ts for why the estimated
// metrics this replaces were worse than nothing.
//
// ONE DOMAIN PER CALL, ON PURPOSE
//
// The old page loaded every competitor's metrics in a single request. With six
// competitors that is eighteen sequential outbound fetches behind one spinner,
// and one slow origin stalls the entire table. Per-domain calls let the client
// fan out, fill each row as it lands, and attach a failure to the row it
// belongs to rather than to a banner over the whole page.
//
// The comparison itself is NOT done here. compareSites() is a pure function
// over two measurements, so the client runs it after both land — otherwise
// every competitor request would have to re-measure the user's own site, which
// is N identical fetches of the same homepage to produce one baseline.
//
// SECURITY: this makes an outbound request to a caller-supplied URL. The
// control is hostIsPublic() from lib/site-fetch — the same one the site audit
// and the crawler view use.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import { hostIsPublic } from "@/lib/site-fetch";
import { measureSite, toOrigin } from "@/lib/competitor-compare";

export const dynamic     = "force-dynamic";
// Homepage + robots + up to a few sitemap fetches at 9s each.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const caller = await getCallerOrNull();
    if (!caller) {
      return NextResponse.json({ success: false, reason: "unauthenticated" }, { status: 401 });
    }

    const body   = await request.json().catch(() => ({}));
    const raw    = String(body?.domain ?? "");
    const origin = toOrigin(raw);

    if (!origin) {
      return NextResponse.json({
        success: false, reason: "invalid_url",
        message: `"${raw}" isn't a domain we can fetch. Try it as example.co.uk`,
      });
    }
    if (!hostIsPublic(new URL(origin).hostname)) {
      return NextResponse.json({
        success: false, reason: "non_public_host",
        message: "That hostname isn't publicly reachable, so there is nothing to measure.",
      });
    }

    const measure = await measureSite(origin);

    return NextResponse.json({
      success:   true,
      reachable: measure.reachable,
      measure,
      // Named explicitly so a failed row can say what went wrong rather than
      // rendering an empty line the reader has to interpret.
      message:   measure.reachable ? null : (measure.error ?? "We couldn't fetch that site."),
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[competitors/measure]", message);
    return NextResponse.json({ success: false, reason: "api_error", message });
  }
}
