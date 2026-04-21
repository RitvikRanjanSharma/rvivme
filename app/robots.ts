// app/robots.ts
// =============================================================================
// AI Marketing Lab — robots.txt
// Allows Google to crawl public pages, blocks dashboard and auth routes
// =============================================================================

import type { MetadataRoute } from "next";

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
          "/dashboard",
          "/keywords",
          "/competitors",
          "/settings",
          "/auth",
          "/api",
        ],
      },
    ],
    sitemap: "https://www.aimarketinglab.co.uk/sitemap.xml",
  };
}