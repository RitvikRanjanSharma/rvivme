"use client";

// app/ui/hero-section.tsx
// =============================================================================
// AI Marketing Lab — Hero section (portfolio/demo variant)
//
// Standalone hero component: eyebrow, H1, subheadline, single primary CTA
// with microcopy, honest trust line, and a self-contained "product screenshot"
// SVG mock of the Keyword Intelligence view. No external image assets, no
// stock imagery — the mock is inline SVG so it renders instantly and picks up
// the current theme via CSS variables.
//
// Layout:
//   Desktop (≥1024px): split — text left (max ~560px), product mock right.
//   Tablet (≥640px):   still side-by-side, product mock scales down.
//   Mobile (<640px):   stacked; product mock is cropped to just the table
//                      card so the hero stays scannable in one thumb-scroll.
//
// Design tokens used:
//   --bg, --surface, --card, --border, --border-strong,
//   --text-primary, --text-secondary, --text-tertiary,
//   --brand, --brand-rgb, --brand-glow,
//   --font-display, --font-body, --font-mono,
//   --signal-green, --signal-amber
// =============================================================================

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, TrendingUp, Zap } from "lucide-react";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function HeroSection() {
  return (
    <section
      style={{
        position: "relative",
        background: "var(--bg)",
        overflow:   "hidden",
        padding:    "clamp(64px, 12vh, 140px) clamp(20px, 4vw, 32px) clamp(72px, 14vh, 160px)",
      }}
    >
      {/* Ambient brand glow behind the whole section — subtle, no gradient noise */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset:    0,
          background:
            "radial-gradient(ellipse 70% 60% at 65% 0%, rgba(var(--brand-rgb),0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position:            "relative",
          zIndex:              1,
          maxWidth:            "1400px",
          margin:              "0 auto",
          display:             "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap:                 "clamp(48px, 6vw, 72px)",
          alignItems:          "center",
        }}
        className="aiml-hero-grid"
      >
        {/* ── Left: copy column ─────────────────────────────────────────── */}
        <div style={{ maxWidth: "560px" }}>
          {/* Eyebrow / logo subtitle */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            style={{
              fontFamily:     "var(--font-mono)",
              fontSize:       "11px",
              letterSpacing:  "0.14em",
              textTransform:  "uppercase",
              color:          "var(--text-tertiary)",
              marginBottom:   "20px",
            }}
          >
            AI Marketing Lab — SEO &amp; Content Strategy Platform
          </motion.div>

          {/* H1 — kept verbatim. Non-breaking spaces around the ampersand
              prevent an orphan "&" at line ends on narrow viewports. */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.08 }}
            style={{
              fontFamily:    "var(--font-display)",
              fontSize:      "clamp(2.25rem, 5.2vw, 4.25rem)",
              lineHeight:    1.02,
              letterSpacing: "-0.035em",
              fontWeight:    400,
              color:         "var(--text-primary)",
              margin:        "0 0 22px",
            }}
          >
            Rank faster with AI‑powered SEO{" "}&{" "}content strategy.
          </motion.h1>

          {/* Subheadline — the tightened version. The original is available
              as a swap in a comment below in case you want to A/B it. */}
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.16 }}
            style={{
              fontFamily: "var(--font-body)",
              fontSize:   "clamp(15px, 1.35vw, 18px)",
              lineHeight: 1.6,
              color:      "var(--text-secondary)",
              margin:     "0 0 32px",
              maxWidth:   "540px",
            }}
          >
            {/* Longer original (28 words):
                AI Marketing Lab turns your analytics and search data into clear
                content strategies, keyword insights, and draft copy tailored to
                your site and market. */}
            AI Marketing Lab turns your analytics and search data into content strategies,
            keyword insights, and draft copy tailored to your site.
          </motion.p>

          {/* CTA + microcopy stack */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.24 }}
            style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "28px" }}
          >
            <Link
              href="/dashboard"
              style={{
                display:        "inline-flex",
                alignItems:     "center",
                justifyContent: "center",
                gap:            "8px",
                alignSelf:      "flex-start",
                fontFamily:     "var(--font-body)",
                fontSize:       "15px",
                fontWeight:     500,
                color:          "#fff",
                background:     "var(--brand-strong)",
                textDecoration: "none",
                padding:        "14px 28px",
                borderRadius:   "100px",
                boxShadow:      "0 8px 24px rgba(var(--brand-rgb),0.25)",
                transition:     "transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 32px rgba(var(--brand-rgb),0.35)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(var(--brand-rgb),0.25)";
              }}
            >
              Try the demo
              <ArrowUpRight size={15} strokeWidth={2.25} />
            </Link>
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize:   "13px",
                color:      "var(--text-tertiary)",
                lineHeight: 1.5,
              }}
            >
              See AI Marketing Lab in action in under 2 minutes.
            </span>
          </motion.div>

          {/* Trust / proof line — portfolio-honest, no fake logos */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, ease: EASE, delay: 0.36 }}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          "10px",
              paddingTop:   "20px",
              borderTop:    "1px solid var(--border)",
              fontFamily:   "var(--font-mono)",
              fontSize:     "11px",
              letterSpacing:"0.06em",
              color:        "var(--text-tertiary)",
              maxWidth:     "540px",
            }}
          >
            <span
              aria-hidden
              style={{
                display:      "inline-block",
                width:        "6px",
                height:       "6px",
                borderRadius: "50%",
                background:   "var(--signal-green)",
                boxShadow:    "0 0 8px var(--signal-green)",
              }}
            />
            A portfolio project by Ritvik Sharma — connects to real Google Search Console and GA4 data, not a mockup.
          </motion.div>
        </div>

        {/* ── Right: product mock ───────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0,  scale: 1    }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.2 }}
          style={{ position: "relative", width: "100%", maxWidth: "620px", justifySelf: "end" }}
          className="aiml-hero-visual"
        >
          <ProductMock />
        </motion.div>
      </div>

      {/* Responsive grid + mobile crop rules. Kept inline so the component is
          fully self-contained and drops in without touching global CSS. */}
      <style>{`
        @media (min-width: 1024px) {
          .aiml-hero-grid {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr) !important;
          }
        }
        @media (max-width: 1023px) {
          .aiml-hero-visual { justify-self: start !important; margin-top: 8px; }
        }
        @media (max-width: 639px) {
          /* On mobile, hide the "strategy checklist" hint layer so the hero
             fits above the fold and reads as a single product card. */
          .aiml-hero-visual .aiml-checklist-layer { display: none !important; }
        }
      `}</style>
    </section>
  );
}

// ─── Inline "product screenshot" mock ────────────────────────────────────────
// A stylised card that mirrors the app's Keyword Intelligence view. Fully SVG-
// free — plain HTML/CSS so it themes automatically via CSS vars.
function ProductMock() {
  return (
    <div style={{ position: "relative" }}>
      {/* Layered "strategy checklist" behind the main card. Purely decorative
          — hidden on mobile via the aiml-checklist-layer class. */}
      <div
        className="aiml-checklist-layer"
        aria-hidden
        style={{
          position:     "absolute",
          top:          "24px",
          right:        "-16px",
          width:        "62%",
          padding:      "18px 20px",
          background:   "var(--card)",
          border:       "1px solid var(--border)",
          borderRadius: "14px",
          boxShadow:    "0 12px 32px rgba(0,0,0,0.18)",
          transform:    "rotate(2deg)",
          opacity:      0.85,
        }}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.14em", color: "var(--text-tertiary)", marginBottom: "10px", textTransform: "uppercase" }}>
          Active strategy · SEO-Q4
        </div>
        {[
          { done: true,  text: "Publish 3 landing pages" },
          { done: true,  text: "Fix Core Web Vitals" },
          { done: false, text: "Target 5 rising keywords" },
        ].map((it, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0", fontFamily: "var(--font-body)", fontSize: "12px", color: it.done ? "var(--text-tertiary)" : "var(--text-secondary)", textDecoration: it.done ? "line-through" : "none" }}>
            <span style={{
              width: "12px", height: "12px", borderRadius: "3px",
              border: `1px solid ${it.done ? "var(--signal-green)" : "var(--border-strong)"}`,
              background: it.done ? "var(--signal-green)" : "transparent",
              flexShrink: 0,
            }} />
            {it.text}
          </div>
        ))}
      </div>

      {/* Main product card — the keyword table */}
      <div
        style={{
          position:     "relative",
          zIndex:       1,
          background:   "var(--surface)",
          border:       "1px solid var(--border)",
          borderRadius: "16px",
          overflow:     "hidden",
          boxShadow:    "0 24px 60px rgba(0,0,0,0.28), 0 0 40px rgba(var(--brand-rgb),0.10)",
        }}
      >
        {/* Card header — window chrome-ish, with app label */}
        <div
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            padding:        "12px 16px",
            borderBottom:   "1px solid var(--border)",
            background:     "var(--card)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
            keywords · aimarketinglab.co.uk
          </div>
          <div style={{ width: 30 }} />
        </div>

        {/* Card body */}
        <div style={{ padding: "20px" }}>
          {/* Title + "ideas from" tag */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: "18px", letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
                Keyword Intelligence
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px", letterSpacing: "0.08em" }}>
                LAST 28 DAYS · UK
              </div>
            </div>
            <span
              style={{
                display:      "inline-flex",
                alignItems:   "center",
                gap:          "5px",
                fontFamily:   "var(--font-mono)",
                fontSize:     "10px",
                letterSpacing:"0.08em",
                color:        "var(--brand)",
                background:   "rgba(var(--brand-rgb),0.10)",
                border:       "1px solid rgba(var(--brand-rgb),0.28)",
                borderRadius: "100px",
                padding:      "4px 10px",
              }}
            >
              <Zap size={10} strokeWidth={2.25} />
              IDEAS FROM GOOGLE TRENDS
            </span>
          </div>

          {/* Table */}
          <div style={{ border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden" }}>
            <div
              style={{
                display:              "grid",
                gridTemplateColumns:  "1.7fr 60px 70px 60px",
                gap:                  "8px",
                padding:              "10px 14px",
                background:           "var(--card)",
                fontFamily:           "var(--font-mono)",
                fontSize:             "9px",
                letterSpacing:        "0.1em",
                color:                "var(--text-tertiary)",
                textTransform:        "uppercase",
                borderBottom:         "1px solid var(--border)",
              }}
            >
              <div>Keyword</div>
              <div style={{ textAlign: "right" }}>Pos.</div>
              <div style={{ textAlign: "right" }}>Impr.</div>
              <div style={{ textAlign: "right" }}>Trend</div>
            </div>

            {MOCK_ROWS.map((r, i) => (
              <div
                key={r.term}
                style={{
                  display:             "grid",
                  gridTemplateColumns: "1.7fr 60px 70px 60px",
                  gap:                 "8px",
                  padding:             "12px 14px",
                  alignItems:          "center",
                  borderBottom:        i < MOCK_ROWS.length - 1 ? "1px solid var(--border)" : "none",
                  background:          r.highlight ? "rgba(var(--brand-rgb),0.05)" : "transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                  <span style={{
                    fontFamily:  "var(--font-body)",
                    fontSize:    "13px",
                    fontWeight:  500,
                    color:       "var(--text-primary)",
                    overflow:    "hidden",
                    textOverflow:"ellipsis",
                    whiteSpace:  "nowrap",
                  }}>
                    {r.term}
                  </span>
                  {r.rising && (
                    <span style={{
                      fontFamily:   "var(--font-mono)",
                      fontSize:     "8px",
                      letterSpacing:"0.1em",
                      color:        "var(--signal-green)",
                      background:   "rgba(0, 200, 83, 0.12)",
                      border:       "1px solid rgba(0, 200, 83, 0.28)",
                      borderRadius: "4px",
                      padding:      "2px 5px",
                      flexShrink:   0,
                    }}>
                      RISING
                    </span>
                  )}
                </div>
                <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "12px", color: r.pos <= 3 ? "var(--signal-green)" : r.pos <= 10 ? "var(--brand)" : "var(--text-secondary)" }}>
                  #{r.pos}
                </div>
                <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-secondary)" }}>
                  {r.impr.toLocaleString()}
                </div>
                <div style={{ textAlign: "right" }}>
                  <TrendingUp size={12} color={r.rising ? "var(--signal-green)" : "var(--text-tertiary)"} />
                </div>
              </div>
            ))}
          </div>

          {/* Footer stat strip */}
          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            {[
              { label: "TRACKED",   value: "128"  },
              { label: "AVG POS.",  value: "14.2" },
              { label: "TOP 10",    value: "31"   },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1,
                padding: "10px 12px",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
              }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "18px", letterSpacing: "-0.02em", color: "var(--text-primary)", lineHeight: 1 }}>
                  {s.value}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "8.5px", letterSpacing: "0.12em", color: "var(--text-tertiary)", marginTop: "4px" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Mock table data — realistic-looking but clearly demo. Never numbers we'd
// pretend are real customer data.
const MOCK_ROWS: Array<{ term: string; pos: number; impr: number; rising?: boolean; highlight?: boolean }> = [
  { term: "ai content strategy",       pos: 3,  impr: 4820, rising: true, highlight: true },
  { term: "seo automation tools",      pos: 7,  impr: 2140 },
  { term: "google search console api", pos: 12, impr: 1680 },
  { term: "keyword research free",     pos: 5,  impr: 3210, rising: true },
  { term: "geo optimisation guide",    pos: 22, impr: 890  },
];
