// app/portfolio/layout.tsx
// ============================================================================
// Metadata carrier for /portfolio, which is a placeholder with no real content
// yet.
//
// Defaults to noindex, nofollow deliberately. An empty page that Google has
// indexed is worse than no page at all: it is a thin-content signal against the
// domain, and anyone who finds it via search lands on nothing. `follow: false`
// additionally stops equity passing through its links.
//
// Because this now resolves through /admin, the noindex can be lifted from the
// panel the moment there are case studies to show — without a deploy. The nav
// link (app/ui/app-shell.tsx) and the robots.ts disallow both still need
// removing by hand at that point.
// ============================================================================

import type { Metadata } from "next";
import { resolveSeo } from "@/lib/seo-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return resolveSeo({
    route:       "/portfolio",
    title:       "Portfolio",
    description: "Selected client work from AI Marketing Lab.",
    canonical:   "/portfolio",
    index:       false,
    follow:      false,
  });
}

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
