// app/robots.txt/route.ts
// =============================================================================
// AI Marketing Lab — robots.txt
//
// A Route Handler rather than Next's app/robots.ts metadata convention, and the
// reason is fidelity. The metadata convention takes a structured object and
// generates the file, which is fine for a fixed policy but wrong once an
// operator can write the file themselves: serving their text would mean parsing
// robots.txt and regenerating it, so any difference between what they typed and
// what is served becomes a bug that is nearly invisible. Here their text is
// served byte for byte.
//
// The GENERATED file below stays in code and is the source of truth for what
// should be blocked. If the overrides table is empty, unreachable, or the row
// is deleted, the site must still keep crawlers out of the application. A
// robots.txt that fell back to permitting everything would quietly expose every
// app route to indexing — the opposite of a safe default.
//
// The disallow list previously named only four app routes, so the strategist
// surfaces added later (/opportunities, /geo, /local, /audit, /strategies,
// /alerts, /onboarding) were crawlable. They bounce anonymous visitors to the
// login page, so what a crawler could index was a dozen URLs all duplicating
// /auth/login. This list tracks the protected prefixes in proxy.ts.
//
// /portfolio was blocked while it was an empty placeholder. It now carries a
// real profile, so it is crawlable and indexable again — flipped here, in the
// page metadata and in the nav together.
// =============================================================================

import { SITE_URL } from "@/lib/site";
import { getSiteFile } from "@/lib/site-content";

export const revalidate = 300;

const DISALLOW = [
  // Application surfaces — all session-gated in proxy.ts.
  "/dashboard", "/keywords", "/competitors", "/settings",
  "/strategies", "/opportunities", "/geo", "/local",
  "/audit", "/alerts", "/onboarding",
  // Operator-only.
  "/admin",
  // Auth and internals.
  "/auth", "/api",
];

/** Exported so /admin can offer it as the starting point for an edit. */
export function generatedRobots(): string {
  return [
    "User-agent: *",
    "Allow: /",
    "Allow: /blog",
    "Allow: /portfolio",
    ...DISALLOW.map(p => `Disallow: ${p}`),
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    "",
  ].join("\n");
}

export async function GET() {
  const custom = await getSiteFile("robots_txt");
  const body   = custom ?? generatedRobots();

  return new Response(body, {
    headers: {
      "Content-Type":  "text/plain; charset=utf-8",
      // Short cache: a robots.txt change is usually made because something is
      // being indexed that shouldn't be, and waiting an hour for it to take
      // effect is the wrong trade.
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=60",
    },
  });
}
