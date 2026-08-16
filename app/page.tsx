// app/page.tsx — AI Marketing Lab (server shell)
// ============================================================================
// Exists to emit the homepage's own metadata. `metadata` is only supported in
// Server Components, and the homepage UI needs hooks (canvas, scroll, auth),
// so the interactive half lives in ./home-view.tsx. Same pattern as
// blog/[slug]/page.tsx.
//
// The homepage is the most-shared URL on the site, so the Open Graph title and
// description are set explicitly here rather than inherited: before this, a
// link to the homepage unfurled with an image but no title or description,
// because the old hand-written <head> in the root layout emitted neither.
// ============================================================================

import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import HomeView from "./home-view";

const TITLE = `${SITE_NAME} — SEO & GEO Intelligence Platform`;

export const metadata: Metadata = {
  // `absolute` opts out of the root layout's "%s — AI Marketing Lab"
  // template, which would otherwise append the brand name a second time.
  title:       { absolute: TITLE },
  description: SITE_DESCRIPTION,
  alternates:  { canonical: "/" },
  openGraph: {
    title:       TITLE,
    description: SITE_DESCRIPTION,
    url:         "/",
    type:        "website",
  },
  twitter: {
    title:       TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function Page() {
  return <HomeView />;
}
