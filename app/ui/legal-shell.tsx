// app/ui/legal-shell.tsx
// =============================================================================
// AI Marketing Lab — Shared frame for /privacy and /terms
// =============================================================================
// Both pages need the same readable narrow column with our typography,
// generous line-height, and a back-link. Doing it once here keeps the legal
// pages purely about their content.
// =============================================================================

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function LegalShell({
  title, updated, children,
}: {
  title:    string;
  updated:  string;
  children: React.ReactNode;
}) {
  return (
    <main
      style={{
        maxWidth: 760,
        margin:   "0 auto",
        padding:  "64px 24px 96px",
        color:    "var(--text-primary)",
        font:     "16px/1.7 var(--font-body)",
      }}
    >
      <Link
        href="/"
        style={{
          display:        "inline-flex",
          alignItems:     "center",
          gap:            6,
          textDecoration: "none",
          color:          "var(--text-secondary)",
          fontSize:       13,
          marginBottom:   24,
        }}
      >
        <ArrowLeft size={14} /> Back to AI Marketing Lab
      </Link>

      <h1
        style={{
          fontFamily:   "var(--font-display)",
          fontSize:     40,
          lineHeight:   1.15,
          letterSpacing: "-0.01em",
          margin:       "0 0 8px",
          color:        "var(--text-primary)",
        }}
      >
        {title}
      </h1>
      <p style={{ color: "var(--text-secondary)", margin: "0 0 36px", fontSize: 14 }}>
        Last updated: {updated}
      </p>

      <div className="legal-prose">{children}</div>

      <style>{`
        .legal-prose h2 {
          font-family: var(--font-display);
          font-size: 22px;
          margin: 36px 0 12px;
          color: var(--text-primary);
        }
        .legal-prose p, .legal-prose li {
          color: var(--text-secondary);
        }
        .legal-prose strong { color: var(--text-primary); font-weight: 600; }
        .legal-prose ul {
          padding-left: 22px;
          margin: 0 0 16px;
        }
        .legal-prose li { margin-bottom: 6px; }
        .legal-prose a { color: var(--brand); text-decoration: underline; }
        .legal-prose code {
          background: var(--surface-2);
          padding: 1px 6px;
          border-radius: 4px;
          font: 13px/1 var(--font-mono);
        }
      `}</style>
    </main>
  );
}
