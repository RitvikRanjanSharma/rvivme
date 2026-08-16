// app/blog/layout.tsx
// ============================================================================
// Metadata carrier for the blog index.
//
// app/blog/page.tsx is a client component (search, category filter, newsletter
// form all need state), and Next only supports metadata in Server Components.
// A layout is the least invasive way to give the route its own title and
// description without splitting the page into a server shell.
//
// Individual posts override every field of this in their own generateMetadata
// (app/blog/[slug]/page.tsx) — metadata merges per-field from the root down,
// so the deepest segment wins.
// ============================================================================

import type { Metadata } from "next";
import { resolveSeo } from "@/lib/seo-metadata";

const DESCRIPTION =
  "Strategy analysis, technical guides and growth insights on SEO, answer-engine visibility and GEO for UK businesses.";

export async function generateMetadata(): Promise<Metadata> {
  return resolveSeo({
    route:       "/blog",
    // Bare name — the root layout's template appends "— AI Marketing Lab".
    title:       "Blog",
    description: DESCRIPTION,
    canonical:   "/blog",
    ogType:      "website",
  });
}

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
