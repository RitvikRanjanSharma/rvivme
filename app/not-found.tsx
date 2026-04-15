"use client";

// app/not-found.tsx
// =============================================================================
// AI Marketing Labs — 404
// Editorial · Dry · On-brand
// =============================================================================

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

export default function NotFound() {
  return (
    <div style={{
      minHeight:      "100vh",
      background:     "var(--bg)",
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      padding:        "40px 32px",
      position:       "relative",
      overflow:       "hidden",
    }}>
      {/* Background number */}
      <div style={{
        position:      "absolute",
        fontSize:      "clamp(200px, 40vw, 400px)",
        fontFamily:    "var(--font-display)",
        letterSpacing: "-0.08em",
        lineHeight:    1,
        color:         "rgba(255,255,255,0.02)",
        userSelect:    "none",
        pointerEvents: "none",
        fontWeight:    400,
        top:           "50%",
        left:          "50%",
        transform:     "translate(-50%, -50%)",
        whiteSpace:    "nowrap",
      }}>
        404
      </div>

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE }}
        style={{ textAlign: "center", position: "relative", zIndex: 1, maxWidth: "560px" }}
      >
        {/* Index label */}
        <div style={{
          fontFamily:    "var(--font-mono)",
          fontSize:      "10px",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color:         "var(--text-tertiary)",
          marginBottom:  "32px",
          display:       "flex",
          alignItems:    "center",
          justifyContent: "center",
          gap:           "12px",
        }}>
          <div style={{ width: "24px", height: "1px", background: "var(--border-strong)" }} />
          Error 404
          <div style={{ width: "24px", height: "1px", background: "var(--border-strong)" }} />
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily:    "var(--font-display)",
          fontSize:      "clamp(2.4rem, 6vw, 5rem)",
          letterSpacing: "-0.05em",
          lineHeight:    0.95,
          color:         "var(--text-primary)",
          fontWeight:    400,
          marginBottom:  "24px",
        }}>
          This page does not rank.
        </h1>

        {/* Subtext */}
        <p style={{
          fontFamily:  "var(--font-body)",
          fontSize:    "15px",
          color:       "var(--text-secondary)",
          lineHeight:  1.7,
          marginBottom: "48px",
        }}>
          It does not exist in our index, in Google&apos;s index, or in any AI Overview citation. A clean 404 is better than a soft one. You&apos;re welcome.
        </p>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px", flexWrap: "wrap" }}>
          <Link href="/" style={{
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
            Return home
            <ArrowRight size={14} />
          </Link>

          <Link href="/dashboard" style={{
            display:        "inline-flex",
            alignItems:     "center",
            gap:            "8px",
            fontFamily:     "var(--font-body)",
            fontSize:       "14px",
            color:          "var(--text-secondary)",
            textDecoration: "none",
            padding:        "12px 24px",
            borderRadius:   "100px",
            border:         "1px solid var(--border-strong)",
            transition:     "color 0.16s, border-color 0.16s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--text-secondary)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)"; }}
          >
            Open dashboard
          </Link>
        </div>

        {/* Footer note */}
        <p style={{
          fontFamily:    "var(--font-mono)",
          fontSize:      "10px",
          letterSpacing: "0.08em",
          color:         "var(--text-tertiary)",
          marginTop:     "64px",
        }}>
          AI Marketing Labs · aimarketinglab.co.uk
        </p>
      </motion.div>
    </div>
  );
}
