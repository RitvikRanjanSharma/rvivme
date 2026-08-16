// app/robots.ts
// =============================================================================
// AI Marketing Lab — robots.txt
//
// Allows the public marketing and blog pages; blocks the application, auth and
// API routes, which are behind a session and useless to a crawler.
//
// The disallow list previously named only four app routes, so the strategist
// surfaces added later (/opportunities, /geo, /local, /audit, /strategies,
// /alerts, /onboarding) were crawlable. They redirect anonymous visitors to
// the login page, so what a crawler actually indexed was a duplicate of
// /auth/login under a dozen different URLs. This keeps the list in step with
// the protected prefixes in proxy.ts.
//
// /portfolio is blocked while it is an empty placeholder. It also carries a
// noindex, which does a different job: robots.txt stops the crawl, noindex
// stops indexing when the URL is reached another way — a disallowed URL can
// still be indexed on the strength of external links alone.
// =============================================================================

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/blog",
          "/blog/",
        ],
        disallow: [
          // Application surfaces — all session-gated in proxy.ts.
          "/dashboard",
          "/keywords",
          "/competitors",
          "/settings",
          "/strategies",
          "/opportunities",
          "/geo",
          "/local",
          "/audit",
          "/alerts",
          "/onboarding",
          // Placeholder, pending real content.
          "/portfolio",
          // Auth and internals.
          "/auth",
          "/api",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
