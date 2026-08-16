// app/page.tsx — AI Marketing Lab (server shell)
// ============================================================================
// Exists to emit the homepage's own metadata and to load the editable copy.
// `metadata` is only supported in Server Components, and the homepage UI needs
// hooks (canvas, scroll, auth), so the interactive half lives in ./home-view.
// Same pattern as blog/[slug]/page.tsx.
//
// The metadata now resolves through lib/seo-metadata, which lays any override
// set in /admin over the defaults below. The defaults stay here rather than
// moving into the database: they are what ships, what renders if the database
// is empty or unreachable, and what the file should say when you read it.
// ============================================================================

import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import { resolveSeo, resolveJsonLd } from "@/lib/seo-metadata";
import { getContentBlocks } from "@/lib/site-content";
import HomeView from "./home-view";

const ROUTE = "/";
const TITLE = `${SITE_NAME} — SEO & GEO Intelligence Platform`;

export async function generateMetadata(): Promise<Metadata> {
  return resolveSeo({
    route:         ROUTE,
    title:         TITLE,
    // The homepage title is the brand line itself, so it must not have
    // "— AI Marketing Lab" appended by the root layout's template.
    titleAbsolute: true,
    description:   SITE_DESCRIPTION,
    canonical:     "/",
    ogType:        "website",
  });
}

export default async function Page() {
  const [blocks, jsonLd] = await Promise.all([
    getContentBlocks(),
    resolveJsonLd(ROUTE),
  ]);

  return (
    <>
      {/* Operator-supplied structured data. Already escaped in resolveJsonLd so
          a value containing "</script>" cannot break out of the tag. */}
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      )}
      <HomeView blocks={blocks} />
    </>
  );
}
