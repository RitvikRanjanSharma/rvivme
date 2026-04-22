"use client";

// app/layout.tsx — AI Marketing Lab
// ============================================================================
// Root layout. Owns <html>, <head>, <body>, and font loading. The nav / shell
// lives in ./ui/app-shell so it can be versioned and iterated on independently.
// ============================================================================

import { Inter, DM_Mono } from "next/font/google";
import { AppShell } from "./ui/app-shell";
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
  return (
    <html lang="en-GB" className={`dark ${inter.variable} ${dmMono.variable}`} suppressHydrationWarning>
      <head>
        <title>AI Marketing Lab — SEO & GEO Intelligence Platform</title>
        <meta name="description" content="Unified SEO and GEO intelligence. GA4, Search Console, DataForSEO, and AI citation tracking in one workspace."/>
        <meta name="theme-color" content="#080808"/>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
      </head>
      <body style={{ margin:0, padding:0 }}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
