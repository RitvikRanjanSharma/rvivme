// app/portfolio/layout.tsx
// ============================================================================
// Metadata carrier for /portfolio, which is a placeholder with no real content
// yet.
//
// Indexable as of the profile going live. It was noindex while it was an empty
// placeholder — an indexed blank page is a thin-content signal against the
// domain and sends searchers nowhere — and that reasoning stopped applying the
// moment it had real content.
//
// All three switches were flipped together: this metadata, the robots.ts
// disallow, and the nav link. Leaving any one behind is how a page ends up
// linked but uncrawlable, or crawlable but unreachable.
// ============================================================================

import type { Metadata } from "next";
import { resolveSeo } from "@/lib/seo-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return resolveSeo({
    route:       "/portfolio",
    title:       "Ritvik R. Sharma",
    description: "Ritvik R. Sharma — SEO and digital marketing specialist, and the builder of AI Marketing Lab.",
    canonical:   "/portfolio",
  });
}

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
