// app/layout.tsx — AI Marketing Lab
// ============================================================================
// Root layout. Owns <html>, <body>, font loading, and the site-wide metadata
// defaults. The nav / shell lives in ./ui/app-shell so it can be versioned and
// iterated on independently.
//
// WHY THIS IS A SERVER COMPONENT (it used to be "use client")
//
// It was a client component for exactly one reason: usePathname(), used to
// derive a per-route canonical URL. That single hook had a large cost, because
// Next only supports the `metadata` export in Server Components — so the head
// had to be hand-written in JSX, and a hand-written head cannot vary by route.
// Every client-rendered page therefore served the same <title> and meta
// description, and none of them had og:title or og:description at all.
//
// Worse, the hand-written <title> did not replace the metadata API, it
// coexisted with it: pages that DID export metadata (privacy, terms, blog
// posts) emitted their own correct title plus this one, and blog posts emitted
// two canonicals. Removing the hand-written head fixes those duplicates as
// well as the missing per-page tags.
//
// Canonicals now come from each page's `alternates.canonical`, set on the
// routes search engines are actually allowed to index (see app/robots.ts).
// Application routes are disallowed there, so a canonical on them had no
// effect and is not missed.
// ============================================================================

import type { Metadata, Viewport } from "next";
import { Poppins, DM_Mono } from "next/font/google";
import { AppShell } from "./ui/app-shell";
import { CookieBanner } from "./ui/cookie-banner";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

// Poppins across the whole interface. Geometric sans with a wide aperture,
// which is what keeps it readable at the small mono-ish label sizes this UI
// leans on.
//
// The CSS variable is still called --font-inter because roughly forty style
// objects reference it. Renaming it would be a large diff for no behavioural
// change; --font-body and --font-display are the names anything new should use.
const poppins = Poppins({
  subsets:  ["latin"],
  // 700 is loaded because the app actually uses it in 19 places. It wasn't,
  // and that is the cause of the dark/light text mismatch: with the real face
  // missing, the browser SYNTHESISES bold by smearing the 600 weight sideways,
  // which widens every glyph and opens up the tracking. The distortion is far
  // more visible as light-on-dark, because the smeared pixels bloom against a
  // dark background — so the same heading looked heavier and wider in dark
  // mode on almost every page. Nothing theme-specific in the CSS; a missing
  // font file.
  weight:   ["300","400","500","600","700"],
  variable: "--font-inter",
  display:  "swap",
});
const dmMono = DM_Mono({
  subsets:  ["latin"],
  weight:   ["300","400","500"],
  variable: "--font-dm-mono",
  display:  "swap",
});

// metadataBase lets pages express canonical and Open Graph URLs as paths
// ("/blog") instead of repeating the origin. It must be absolute, and it must
// be the www host — the apex serves a parking certificate. See lib/site.ts.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    // `default` covers anything without its own title — notably 404s, which
    // render inside this layout and cannot export metadata of their own.
    default:  `${SITE_NAME} — SEO & GEO Intelligence Platform`,
    // Every page that sets a plain string title gets the brand appended, so
    // "Site audit" becomes "Site audit — AI Marketing Lab" without each route
    // having to remember to write it.
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    locale:   "en_GB",
    type:     "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

// themeColor tints the mobile browser chrome to match the palette. Two entries
// so the phone's address bar follows the theme instead of being permanently
// the old near-black, which now belongs to neither palette.
//
// This lives in `viewport`, not `metadata` — Next moved it, and leaving it in
// metadata logs a deprecation warning while emitting nothing.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EFE9E2" },
    { media: "(prefers-color-scheme: dark)",  color: "#0B232E" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${poppins.variable} ${dmMono.variable}`} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        {/* Applies the stored theme BEFORE first paint.

            Light is the default, defined on :root, so a first-time visitor
            renders linen with no script involvement. But a returning visitor
            who chose dark would otherwise get a full frame of light before
            React hydrates and corrects it — a white flash on a dark theme is
            the most jarring bug a theme toggle can have.

            Deliberately inline and blocking: an async script would paint
            first, which is the exact thing this exists to prevent. It is
            small, wrapped in try/catch, and failure degrades to the default.

            Still valid in a Server Component — this is a static string, not a
            client behaviour, and it must run before React does. */}
        <script
          dangerouslySetInnerHTML={{ __html: `
            (function(){try{
              var m = localStorage.getItem('aiml-mode') || localStorage.getItem('rvivme-theme');
              if (m === 'dark') document.documentElement.classList.add('dark');
              // Same revision check the provider runs, repeated here because
              // this executes first — otherwise the old colour paints once
              // before React clears it.
              if (localStorage.getItem('aiml-brand-rev') !== '2') {
                localStorage.removeItem('aiml-brand');
                localStorage.removeItem('rvivme-brand');
                localStorage.setItem('aiml-brand-rev', '2');
              } else {
                var b = localStorage.getItem('aiml-brand') || localStorage.getItem('rvivme-brand');
                if (b) document.documentElement.style.setProperty('--brand', b);
              }
            }catch(e){}})();
          ` }}
        />
      </head>
      <body style={{ margin:0, padding:0 }}>
        <AppShell>{children}</AppShell>
        <CookieBanner />
      </body>
    </html>
  );
}
