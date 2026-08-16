// app/blog/layout.tsx
// ============================================================================
// Metadata carrier for the blog index.
//
// app/blog/page.tsx is a client component (search, category filter, newsletter
// form all need state), and Next only supports the `metadata` export in Server
// Components. A layout is the least invasive way to give the route its own
// title and description without splitting the page into a server shell.
//
// Individual posts override every field of this in their own generateMetadata
// (app/blog/[slug]/page.tsx) — metadata merges per-field from the root down,
// so the deepest segment wins.
// ============================================================================

import type { Metadata } from "next";

export const metadata: Metadata = {
  // Bare name — the root layout's template appends "— AI Marketing Lab".
  title:       "Blog",
  description:
    "Strategy analysis, technical guides and growth insights on SEO, answer-engine visibility and GEO for UK businesses.",
  alternates:  { canonical: "/blog" },
  openGraph: {
    title:       "Blog — AI Marketing Lab",
    description:
      "Strategy analysis, technical guides and growth insights on SEO, answer-engine visibility and GEO for UK businesses.",
    url:         "/blog",
    type:        "website",
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
