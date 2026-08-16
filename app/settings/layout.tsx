// app/settings/layout.tsx
// ============================================================================
// Metadata carrier for /settings.
//
// The page itself is a client component, and Next only supports the `metadata`
// export in Server Components, so the title lives here. This is a browser-tab
// and bookmark label rather than an SEO tag — the route is disallowed in
// app/robots.ts and sits behind a session — but before this every one of these
// pages shared the single hardcoded title from the root layout, so a user with
// several tabs open could not tell them apart.
// ============================================================================

import type { Metadata } from "next";

// Bare name — the root layout's template appends "— AI Marketing Lab".
export const metadata: Metadata = { title: "Settings" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
