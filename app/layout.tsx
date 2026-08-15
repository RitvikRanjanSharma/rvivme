"use client";

// app/layout.tsx — AI Marketing Lab
// ============================================================================
// Root layout. Owns <html>, <head>, <body>, and font loading. The nav / shell
// lives in ./ui/app-shell so it can be versioned and iterated on independently.
// ============================================================================

import { Poppins, DM_Mono } from "next/font/google";
import { usePathname } from "next/navigation";
import { AppShell } from "./ui/app-shell";
import { CookieBanner } from "./ui/cookie-banner";
import { absoluteUrl } from "@/lib/site";
import "./globals.css";

// Poppins across the whole interface. Geometric sans with a wide aperture,
// which is what keeps it readable at the small mono-ish label sizes this UI
// leans on. 600 is the heaviest weight loaded — 700 in a geometric face at
// display size reads as shouty rather than confident.
//
// The CSS variable is still called --font-inter because roughly forty style
// objects reference it. Renaming it would be a large diff for no behavioural
// change; --font-body and --font-display are the names anything new should use.
const poppins = Poppins({
  subsets:  ["latin"],
  weight:   ["300","400","500","600"],
  variable: "--font-inter",
  display:  "swap",
});
const dmMono = DM_Mono({
  subsets:  ["latin"],
  weight:   ["300","400","500"],
  variable: "--font-dm-mono",
  display:  "swap",
});

export { useTheme } from "./ui/app-shell";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // This layout is a client component, so it cannot export Next's `metadata`
  // object — hence the hand-written <head>. A single hardcoded canonical here
  // would be worse than none at all, because every page would claim to be the
  // homepage. Deriving it from the pathname gives each route its own, and
  // client components still render on the server, so it lands in the HTML.
  const pathname = usePathname();
  const canonical = absoluteUrl(pathname ?? "/");

  return (
    <html lang="en-GB" className={`${poppins.variable} ${dmMono.variable}`} suppressHydrationWarning>
      <head>
        <title>AI Marketing Lab — SEO & GEO Intelligence Platform</title>
        <meta name="description" content="Unified SEO and GEO intelligence. Google Analytics 4, Search Console, and AI answer-engine tracking in one workspace."/>
        {/* Tints the mobile browser chrome to match. Two tags so the phone's
            address bar follows the theme instead of being permanently the old
            near-black, which now belongs to neither palette. */}
        <meta name="theme-color" content="#EFE9E2" media="(prefers-color-scheme: light)"/>
        <meta name="theme-color" content="#0B232E" media="(prefers-color-scheme: dark)"/>
        <link rel="canonical" href={canonical}/>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        {/* Applies the stored theme BEFORE first paint.

            Light is the default, defined on :root, so a first-time visitor
            renders linen with no script involvement. But a returning visitor
            who chose dark would otherwise get a full frame of light before
            React hydrates and corrects it — a white flash on a dark theme is
            the most jarring bug a theme toggle can have.

            Deliberately inline and blocking: an async script would paint
            first, which is the exact thing this exists to prevent. It is
            small, wrapped in try/catch, and failure degrades to the default. */}
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
