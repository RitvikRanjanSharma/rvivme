"use client";

// app/ui/audit-walkthrough.tsx
// ============================================================================
// How to read the audit — four small steps, once.
//
// WHY THIS ONE IS A DIALOG WHEN THE OTHERS ARE NOT
//
// Everywhere else in this app the teaching is a single dismissible line,
// because a tour that arrives before the user has a question is a tour they
// skip. The audit result is the exception: it is the densest screen in the
// product, and the reader has just asked a question by running it. The
// explanation now has something to attach to.
//
// It still does not behave like a typical tour. No overlay, no dimmed
// background, no focus trap, no anchor arrows pointing at elements that move
// when the page reflows. It is a small card in the corner that steps through
// what each part of the result means, and the page stays fully usable behind
// it — someone who would rather just read the findings can, without dismissing
// anything first.
//
// TRIGGERED BY A RESULT, NOT BY ARRIVAL
//
// Shown only once an audit has actually completed. Explaining how to read a
// score to someone looking at an empty page is the mistake this is designed
// to avoid: the words "the number in the circle" mean nothing until there is
// a circle.
// ============================================================================

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight } from "lucide-react";

const KEY = "aiml-walkthrough-audit";

const STEPS: { title: string; body: string }[] = [
  {
    title: "The score is a starting point, not a grade",
    body:  "It reflects what we found on the pages we crawled — your homepage plus the pages it links to. A low score on a small site usually means a handful of repeated issues, not a broken website.",
  },
  {
    title: "Red first, then amber",
    body:  "Errors stop pages being found or indexed at all. Warnings cost you visibility but nothing is broken. Notices are worth doing when you have time. Work top down and you are working in the right order.",
  },
  {
    title: "Open a finding to see your own content",
    body:  "Each one shows the actual title, description or heading we read from your page, with its length. That is there so you can check we are right before you change anything.",
  },
  {
    title: "Then take the fix",
    body:  "Some fixes are exact code with a copy button. Where the answer needs writing rather than pasting, “Write the fix for me” gives you options based on that page’s real content. Read them before publishing — you know your business better than we do.",
  },
];

export function AuditWalkthrough({ ready }: { ready: boolean }) {
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!ready) return;
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      // Private browsing throws on localStorage. Showing this every time is a
      // better failure than the page crashing around it.
      setShow(true);
    }
  }, [ready]);

  function close() {
    try { localStorage.setItem(KEY, "1"); } catch { /* noop */ }
    setShow(false);
  }

  const last = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          // Fixed to the corner rather than anchored to an element. Anchored
          // coach marks drift the moment the page reflows — and this page
          // reflows constantly as findings expand and audits re-run.
          style={{
            position: "fixed", right: 20, bottom: 20, zIndex: 60,
            width: "min(340px, calc(100vw - 40px))",
            background: "var(--card)", border: "1px solid var(--border-strong)",
            borderRadius: 14, padding: "16px 18px",
            boxShadow: "var(--shadow-card-hover)",
          }}
          role="dialog"
          aria-label="How to read your audit"
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.12em",
              textTransform: "uppercase", color: "var(--text-tertiary)",
            }}>
              Reading your audit · {step + 1} of {STEPS.length}
            </span>
            <button
              onClick={close}
              aria-label="Close"
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                color: "var(--text-tertiary)", display: "inline-flex", padding: 2,
              }}
            >
              <X size={14} />
            </button>
          </div>

          <div style={{
            fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 500,
            color: "var(--text-primary)", lineHeight: 1.4, marginBottom: 6,
          }}>
            {STEPS[step].title}
          </div>
          <p style={{
            fontFamily: "var(--font-body)", fontSize: 13,
            color: "var(--text-reading)", lineHeight: 1.6, margin: "0 0 14px",
          }}>
            {STEPS[step].body}
          </p>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {STEPS.map((_, i) => (
                <span key={i} style={{
                  width: i === step ? 14 : 5, height: 5, borderRadius: 3,
                  background: i === step ? "var(--brand-strong)" : "var(--border-strong)",
                  transition: "width var(--dur-fast), background var(--dur-fast)",
                }} />
              ))}
            </div>
            <button
              onClick={() => (last ? close() : setStep(s => s + 1))}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 500,
                color: "#fff", background: "var(--brand-strong)",
                border: "none", borderRadius: "var(--radius-pill)",
                padding: "7px 16px", cursor: "pointer",
              }}
            >
              {last ? "Got it" : <>Next <ArrowRight size={13} /></>}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
