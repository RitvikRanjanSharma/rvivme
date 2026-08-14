// app/opengraph-image.tsx
// =============================================================================
// AI Marketing Lab — default social preview card
//
// Previously every share of this site — LinkedIn, Slack, WhatsApp, X — rendered
// with no image, because the og:image referenced a /og-default.png that was
// never created. Generating it here means there is no binary asset to forget to
// commit, and no drift between the card and the brand.
//
// Next serves this automatically as the og:image for the site, and blog posts
// with their own image still override it.
// =============================================================================

import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

export const alt = "AI Marketing Lab — SEO and answer-engine intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#EFE9E2",   // Pale Linen — matches the default theme
          padding: "72px",
          // A hint of the brand gradient so the card is recognisable at
          // thumbnail size, where the text is unreadable anyway.
          backgroundImage:
            "radial-gradient(ellipse 70% 60% at 15% 0%, rgba(184,109,72,0.30) 0%, transparent 62%)",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#6B7280",
          }}
        >
          {SITE_NAME}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 82,
            lineHeight: 1.05,
            letterSpacing: "-0.04em",
            color: "#2D3642",   // Deep Slate
            maxWidth: "900px",
          }}
        >
          Rank faster with AI-driven SEO &amp; content strategy.
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 24,
            color: "#6B7280",
          }}
        >
          <span>Search Console · GA4 · Answer engines</span>
          <span>aimarketinglab.co.uk</span>
        </div>
      </div>
    ),
    size,
  );
}
