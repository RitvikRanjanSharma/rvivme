"use client";

// app/page.tsx
// =============================================================================
// AI Marketing Labs — Homepage
// Aino-inspired · Editorial · Full-bleed · Purposeful motion
// =============================================================================

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight, ArrowRight } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const CAPABILITIES = [
  "SEO Intelligence",
  "GEO Optimisation",
  "Competitor Analysis",
  "AI Overview Tracking",
  "Search Console Data",
  "Traffic Forecasting",
  "Content Strategy",
  "Keyword Research",
  "Backlink Intelligence",
  "Rank Monitoring",
];

const STATS = [
  { value: "10+",  label: "Data sources integrated"      },
  { value: "6mo",  label: "Traffic forecast horizon"     },
  { value: "85%",  label: "Confidence in AI projections" },
  { value: "Real", label: "Time Google Analytics data"   },
];

const FEATURES = [
  {
    index: "01",
    title: "Search intelligence that actually moves.",
    body:  "Connect Google Analytics, Search Console, and DataForSEO in one workspace. Stop context-switching between tools. See what matters, when it matters.",
    href:  "/dashboard",
    cta:   "Open dashboard",
  },
  {
    index: "02",
    title: "AI forecasting built on your real traffic.",
    body:  "Not industry benchmarks. Not estimates. Your actual GA4 sessions, trended by our growth model, projected six months forward with confidence intervals that widen honestly.",
    href:  "/dashboard",
    cta:   "See the model",
  },
  {
    index: "03",
    title: "GEO — the search layer everyone ignores.",
    body:  "Generative Engine Optimisation is not SEO renamed. It is a different discipline. We track AI Overview citations, structured data gaps, and citation probability so you can act before your competitors notice.",
    href:  "/blog",
    cta:   "Read the guide",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const EASE = [0.16, 1, 0.3, 1] as const;

function FadeUp({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Marquee ticker
// ─────────────────────────────────────────────────────────────────────────────
function Marquee() {
  const items = [...CAPABILITIES, ...CAPABILITIES];
  return (
    <div style={{
      overflow:   "hidden",
      borderTop:  "1px solid var(--border)",
      borderBottom: "1px solid var(--border)",
      padding:    "14px 0",
      background: "var(--surface)",
    }}>
      <div style={{
        display:   "flex",
        gap:       "0",
        width:     "max-content",
        animation: "marquee 28s linear infinite",
      }}>
        {items.map((cap, i) => (
          <span
            key={i}
            style={{
              fontFamily:    "var(--font-mono)",
              fontSize:      "11px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color:         i % 2 === 0 ? "var(--text-primary)" : "var(--text-tertiary)",
              padding:       "0 28px",
              whiteSpace:    "nowrap",
            }}
          >
            {cap}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats row
// ─────────────────────────────────────────────────────────────────────────────
function StatsRow() {
  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      borderTop:           "1px solid var(--border)",
    }}>
      {STATS.map((stat, i) => (
        <FadeUp key={stat.label} delay={0.1 + i * 0.08}>
          <div style={{
            padding:     "40px 32px",
            borderRight: i < STATS.length - 1 ? "1px solid var(--border)" : "none",
          }}>
            <div style={{
              fontFamily:    "var(--font-display)",
              fontSize:      "clamp(2rem, 4vw, 3.5rem)",
              letterSpacing: "-0.04em",
              lineHeight:    1,
              color:         "var(--text-primary)",
              marginBottom:  "10px",
            }}>
              {stat.value}
            </div>
            <div style={{
              fontFamily: "var(--font-body)",
              fontSize:   "13px",
              color:      "var(--text-secondary)",
              lineHeight: 1.5,
            }}>
              {stat.label}
            </div>
          </div>
        </FadeUp>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature section
// ─────────────────────────────────────────────────────────────────────────────
function FeatureSection({ feature, i }: { feature: typeof FEATURES[0]; i: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : {}}
      transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
      style={{
        display:       "grid",
        gridTemplateColumns: "200px 1fr",
        gap:           "0",
        padding:       "60px 32px",
        borderTop:     "1px solid var(--border)",
        alignItems:    "start",
        transition:    "background 0.3s",
        background:    hovered ? "var(--muted)" : "transparent",
        cursor:        "default",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Index */}
      <div style={{
        fontFamily:    "var(--font-mono)",
        fontSize:      "11px",
        letterSpacing: "0.12em",
        color:         "var(--text-tertiary)",
        paddingTop:    "6px",
      }}>
        {feature.index} —
      </div>

      {/* Content */}
      <div style={{ maxWidth: "680px" }}>
        <motion.h3
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
          style={{
            fontFamily:    "var(--font-display)",
            fontSize:      "clamp(1.6rem, 3vw, 2.4rem)",
            letterSpacing: "-0.04em",
            lineHeight:    1.05,
            color:         "var(--text-primary)",
            fontWeight:    400,
            marginBottom:  "20px",
          }}
        >
          {feature.title}
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: EASE, delay: 0.22 }}
          style={{
            fontFamily:  "var(--font-body)",
            fontSize:    "15px",
            color:       "var(--text-secondary)",
            lineHeight:  1.8,
            marginBottom: "28px",
            maxWidth:    "560px",
          }}
        >
          {feature.body}
        </motion.p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5, ease: EASE, delay: 0.3 }}
        >
          <Link
            href={feature.href}
            style={{
              display:        "inline-flex",
              alignItems:     "center",
              gap:            "6px",
              fontFamily:     "var(--font-body)",
              fontSize:       "13px",
              fontWeight:     500,
              color:          "var(--text-primary)",
              textDecoration: "none",
              borderBottom:   "1px solid var(--border-strong)",
              paddingBottom:  "2px",
              transition:     "border-color 0.16s, color 0.16s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--brand)";
              (e.currentTarget as HTMLElement).style.color = "var(--brand)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
              (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
            }}
          >
            {feature.cta}
            <ArrowRight size={13} />
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section style={{
        minHeight:      "100vh",
        display:        "flex",
        flexDirection:  "column",
        justifyContent: "flex-end",
        padding:        "0 32px 60px",
        position:       "relative",
        overflow:       "hidden",
      }}>
        {/* Ambient background */}
        <div style={{
          position:   "absolute",
          inset:      0,
          background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(37,99,235,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Top label */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={mounted ? { opacity: 1 } : {}}
          transition={{ duration: 1, delay: 0.2 }}
          style={{
            position:   "absolute",
            top:        "80px",
            left:       "32px",
            right:      "32px",
            display:    "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{
            fontFamily:    "var(--font-mono)",
            fontSize:      "10px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color:         "var(--text-tertiary)",
          }}>
            AI Marketing Labs — GEO Intelligence Platform
          </span>
          <span style={{
            fontFamily:    "var(--font-mono)",
            fontSize:      "10px",
            letterSpacing: "0.1em",
            color:         "var(--text-tertiary)",
          }}>
            Est. 2026 · Welwyn Garden City, UK
          </span>
        </motion.div>

        {/* Main headline */}
        <div style={{ maxWidth: "1200px", position: "relative", zIndex: 1 }}>
          <motion.div
            initial={{ opacity: 0, y: 48 }}
            animate={mounted ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 1, ease: EASE, delay: 0.1 }}
          >
            <h1 style={{
              fontFamily:    "var(--font-display)",
              fontSize:      "clamp(3.5rem, 10vw, 9rem)",
              letterSpacing: "-0.05em",
              lineHeight:    0.9,
              color:         "var(--text-primary)",
              fontWeight:    400,
              marginBottom:  "40px",
            }}>
              Search<br />
              intelligence<br />
              <span style={{ color: "var(--text-secondary)" }}>for those</span><br />
              who act.
            </h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={mounted ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: EASE, delay: 0.4 }}
            style={{
              display:    "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              flexWrap:   "wrap",
              gap:        "24px",
            }}
          >
            <p style={{
              fontFamily: "var(--font-body)",
              fontSize:   "clamp(14px, 1.5vw, 17px)",
              color:      "var(--text-secondary)",
              lineHeight: 1.7,
              maxWidth:   "420px",
              margin:     0,
            }}>
              GA4, Search Console, and DataForSEO unified. AI-generated forecasts on your real traffic. GEO tracking before your competitors know it exists.
            </p>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <Link href="/dashboard" style={{
                display:        "inline-flex",
                alignItems:     "center",
                gap:            "8px",
                fontFamily:     "var(--font-body)",
                fontSize:       "14px",
                fontWeight:     500,
                color:          "#fff",
                background:     "var(--brand)",
                textDecoration: "none",
                padding:        "12px 24px",
                borderRadius:   "100px",
                transition:     "opacity 0.16s",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
              >
                Open platform
                <ArrowUpRight size={14} />
              </Link>
              <Link href="/blog" style={{
                display:        "inline-flex",
                alignItems:     "center",
                gap:            "8px",
                fontFamily:     "var(--font-body)",
                fontSize:       "14px",
                fontWeight:     500,
                color:          "var(--text-primary)",
                background:     "transparent",
                textDecoration: "none",
                padding:        "12px 24px",
                borderRadius:   "100px",
                border:         "1px solid var(--border-strong)",
                transition:     "border-color 0.16s, background 0.16s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--text-secondary)";
                (e.currentTarget as HTMLElement).style.background = "var(--muted)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
              >
                Read intelligence
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={mounted ? { opacity: 1 } : {}}
          transition={{ duration: 1, delay: 1.2 }}
          style={{
            position:  "absolute",
            bottom:    "32px",
            right:     "32px",
            display:   "flex",
            flexDirection: "column",
            alignItems: "center",
            gap:        "8px",
          }}
        >
          <div style={{
            width:        "1px",
            height:       "48px",
            background:   "linear-gradient(to bottom, var(--border-strong), transparent)",
          }} />
          <span style={{
            fontFamily:    "var(--font-mono)",
            fontSize:      "9px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color:         "var(--text-tertiary)",
            writingMode:   "vertical-rl",
          }}>
            Scroll
          </span>
        </motion.div>
      </section>

      {/* ── Marquee ─────────────────────────────────────────────────────────── */}
      <Marquee />

      {/* ── Stats ───────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <StatsRow />
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: "1400px", margin: "0 auto", padding: "0 0 0 0" }}>
        <FadeUp>
          <div style={{
            padding:       "60px 32px 40px",
            display:       "flex",
            alignItems:    "center",
            gap:           "16px",
          }}>
            <span style={{
              fontFamily:    "var(--font-mono)",
              fontSize:      "10px",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color:         "var(--text-tertiary)",
            }}>
              What it does
            </span>
            <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
          </div>
        </FadeUp>

        {FEATURES.map((feature, i) => (
          <FeatureSection key={feature.index} feature={feature} i={i} />
        ))}
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <section style={{
        borderTop:   "1px solid var(--border)",
        padding:     "120px 32px",
        textAlign:   "center",
        position:    "relative",
        overflow:    "hidden",
      }}>
        <div style={{
          position:   "absolute",
          inset:      0,
          background: "radial-gradient(ellipse 60% 80% at 50% 100%, rgba(37,99,235,0.06) 0%, transparent 60%)",
          pointerEvents: "none",
        }} />

        <FadeUp>
          <span style={{
            fontFamily:    "var(--font-mono)",
            fontSize:      "10px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color:         "var(--text-tertiary)",
            display:       "block",
            marginBottom:  "32px",
          }}>
            Ready when you are
          </span>
        </FadeUp>

        <FadeUp delay={0.1}>
          <h2 style={{
            fontFamily:    "var(--font-display)",
            fontSize:      "clamp(2.5rem, 7vw, 6rem)",
            letterSpacing: "-0.05em",
            lineHeight:    0.95,
            color:         "var(--text-primary)",
            fontWeight:    400,
            marginBottom:  "48px",
            maxWidth:      "800px",
            margin:        "0 auto 48px",
          }}>
            Stop guessing.<br />
            Start knowing.
          </h2>
        </FadeUp>

        <FadeUp delay={0.2}>
          <Link href="/auth/signup" style={{
            display:        "inline-flex",
            alignItems:     "center",
            gap:            "8px",
            fontFamily:     "var(--font-body)",
            fontSize:       "15px",
            fontWeight:     500,
            color:          "#fff",
            background:     "var(--brand)",
            textDecoration: "none",
            padding:        "14px 32px",
            borderRadius:   "100px",
            transition:     "opacity 0.16s",
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
          >
            Get started free
            <ArrowUpRight size={15} />
          </Link>
        </FadeUp>
      </section>

    </div>
  );
}
