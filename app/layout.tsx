import type { Metadata } from "next";
import { AppShell } from "@/app/ui/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Marketing Labs | GEO Intelligence Platform",
  description: "AI-assisted SEO, GEO, competitor intelligence, and content operations in one workspace.",
};

const GA4_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <meta name="google-site-verification" content="rq8BL-8Oo_DThKjjASQBZNlEd6IzxcY4GjqVbGzCv5g" />
        {GA4_ID && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${GA4_ID}', {
                    page_path: window.location.pathname,
                  });
                `,
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
