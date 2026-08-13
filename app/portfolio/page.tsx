"use client";

// app/portfolio/page.tsx
// =============================================================================
// AI Marketing Lab — Portfolio (placeholder)
// Intentionally blank for now: renders the page chrome, heading and a calm
// "in progress" state so the /portfolio route and its nav link resolve to
// something deliberate rather than a 404.
//
// To fill this in later, replace the <EmptyState/> block with a project grid.
// The surrounding header/typography already matches the blog and home pages.
// =============================================================================

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowUpRight, Hammer } from "lucide-react";

const EASE_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function PortfolioPage() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>

      {/* Header — mirrors the blog index header treatment */}
      <div
        className="aiml-post-header"
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "60px 24px 40px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(var(--brand-rgb),0.06) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ maxWidth: "1200px", margin: "0 auto", position: "relative" }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE_EXPO }}
          >
            <span style={{
              display: "inline-block",
              fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 600,
              color: "var(--brand)", letterSpacing: "0.14em", textTransform: "uppercase",
              padding: "4px 12px", border: "1px solid rgba(var(--brand-rgb),0.25)",
              borderRadius: "100px", background: "rgba(var(--brand-rgb),0.07)",
              marginBottom: "20px",
            }}>
              Portfolio
            </span>

            <h1
              className="aiml-post-title"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2rem, 4.5vw, 3.6rem)",
                letterSpacing: "-0.05em", lineHeight: 0.98,
                fontWeight: 400, color: "var(--text-primary)",
                marginBottom: "18px",
              }}
            >
              Selected work.
            </h1>

            <p
              className="aiml-post-excerpt"
              style={{
                fontFamily: "var(--font-body)", fontSize: "17px",
                color: "var(--text-reading)", lineHeight: 1.7,
                maxWidth: "620px", margin: 0,
              }}
            >
              Case studies and projects, coming soon.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Empty state */}
      <div className="aiml-blog-pad" style={{ maxWidth: "1200px", margin: "0 auto", padding: "56px 24px 96px" }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE_EXPO, delay: 0.12 }}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", textAlign: "center", gap: "14px",
            padding: "72px 24px",
            background: "var(--surface)",
            border: "1px dashed var(--border)",
            borderRadius: "16px",
          }}
        >
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px",
            background: "rgba(var(--brand-rgb),0.08)",
            border: "1px solid rgba(var(--brand-rgb),0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Hammer size={18} color="var(--brand)" />
          </div>

          <div style={{
            fontFamily: "var(--font-body)", fontSize: "16px",
            fontWeight: 500, color: "var(--text-primary)",
          }}>
            Nothing here yet
          </div>

          <p style={{
            fontFamily: "var(--font-body)", fontSize: "14px",
            color: "var(--text-secondary)", lineHeight: 1.7,
            maxWidth: "420px", margin: 0,
          }}>
            This page is a placeholder. Project write-ups will land here as they&rsquo;re
            published.
          </p>

          <Link
            href="/blog"
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
              color: "var(--brand)", textDecoration: "none",
              padding: "10px 18px", borderRadius: "100px",
              border: "1px solid rgba(var(--brand-rgb),0.28)",
              marginTop: "4px",
              transition: "background var(--dur-fast)",
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(var(--brand-rgb),0.08)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
          >
            Read the blog meanwhile <ArrowUpRight size={13} />
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
