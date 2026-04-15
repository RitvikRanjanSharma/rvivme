import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/app/ui/app-shell";
import "./globals.css";

const inter = Inter({
  subsets:  ["latin"],
  variable: "--font-inter",
  display:  "swap",
});

export const metadata: Metadata = {
  title:       "AI Marketing Labs | GEO Intelligence Platform",
  description: "GA4, Search Console, and DataForSEO unified. AI-generated forecasts on your real traffic. GEO tracking before your competitors know it exists.",
  metadataBase: new URL("https://www.aimarketinglab.co.uk"),
  openGraph: {
    title:       "AI Marketing Labs",
    description: "Search intelligence for those who act.",
    url:         "https://www.aimarketinglab.co.uk",
    siteName:    "AI Marketing Labs",
    locale:      "en_GB",
    type:        "website",
  },
};

const GA4_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-GB"
      className={inter.variable}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
    >
      <head>
        <meta name="google-site-verification" content="rq8BL-8Oo_DThKjjASQBZNlEd6IzxcY4GjqVbGzCv5g" />
        {GA4_ID && (
          <>
            {/* eslint-disable-next-line @next/next/no-sync-scripts */}
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`} />
            <script
              id="ga4-init"
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA4_ID}');`,
              }}
            />
          </>
        )}
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
