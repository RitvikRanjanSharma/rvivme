"use client";

// app/layout.tsx — AI Marketing Lab
// ============================================================================
// Root layout. Owns <html>, <head>, <body>, and font loading. The nav / shell
// lives in ./ui/app-shell so it can be versioned and iterated on independently.
// ============================================================================

import { Inter, DM_Mono } from "next/font/google";
import { usePathname } from "next/navigation";
import { AppShell } from "./ui/app-shell";
import { CookieBanner } from "./ui/cookie-banner";
import { absoluteUrl } from "@/lib/site";
import "./globals.css";

const inter = Inter({
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
    <html lang="en-GB" className={`dark ${inter.variable} ${dmMono.variable}`} suppressHydrationWarning>
      <head>
        <title>AI Marketing Lab — SEO & GEO Intelligence Platform</title>
        <meta name="description" content="Unified SEO and GEO intelligence. Google Analytics 4, Search Console, and AI answer-engine tracking in one workspace."/>
        <meta name="theme-color" content="#080808"/>
        <link rel="canonical" href={canonical}/>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
      </head>
      <body style={{ margin:0, padding:0 }}>
        <AppShell>{children}</AppShell>
        <CookieBanner />
      </body>
    </html>
  );
}
