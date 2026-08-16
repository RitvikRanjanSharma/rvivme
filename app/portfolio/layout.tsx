// app/portfolio/layout.tsx
// ============================================================================
// Metadata carrier for /portfolio, which is a placeholder with no real content
// yet.
//
// robots is set to noindex, nofollow deliberately. An empty page that Google
// has indexed is worse than no page at all: it is a thin-content signal
// against the domain, and anyone who finds it via search lands on nothing.
// `follow: false` additionally tells crawlers not to pass equity through the
// links on it.
//
// The nav link was removed at the same time (app/ui/app-shell.tsx) so visitors
// aren't sent here either. Both should be reversed together once there are
// real case studies to show — see the note in app/portfolio/page.tsx.
//
// Note that robots.ts also disallows /portfolio. The two do different jobs:
// robots.txt stops the crawl, this stops indexing if the URL is reached some
// other way (an inbound link, a shared URL). Belt and braces, because a
// disallowed URL can still be indexed from external links alone.
// ============================================================================

import type { Metadata } from "next";

export const metadata: Metadata = {
  // Bare name — the root layout's template appends "— AI Marketing Lab".
  title:       "Portfolio",
  description: "Selected client work from AI Marketing Lab.",
  robots:      { index: false, follow: false },
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
