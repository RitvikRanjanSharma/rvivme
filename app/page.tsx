"use client";

// app/page.tsx
// =============================================================================
// AI Marketing Labs — Homepage
// Intro sequence · Animated background · Scroll-triggered reveals
// =============================================================================

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useInView, useScroll, useTransform, useSpring } from "framer-motion";
import { ArrowUpRight, ArrowRight } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const EASE_EXPO  = [0.16, 1, 0.3, 1] as const;
const EASE_INOUT = [0.4, 0, 0.2, 1] as const;

const CAPABILITIES = [
  "SEO Intelligence", "GEO Optimisation", "Competitor Analysis",
  "AI Overview Tracking", "Search Console", "Traffic Forecasting",
  "Content Strategy", "Keyword Research", "Backlink Intelligence",
  "Rank Monitoring", "GA4 Integration", "6-Month Forecasting",
];

const STATS = [
  { value: "10+",  label: "Data sources"          },
  { value: "6mo",  label: "Forecast horizon"       },
  { value: "85%",  label: "Projection confidence"  },
  { value: "Live", label: "GA4 traffic data"       },
];

const FEATURES = [
  {
    index: "01",
    title: "Search intelligence that actually moves.",
    body:  "Connect Google Analytics, Search Console, and DataForSEO in one workspace. Stop context-switching between twelve tabs. See what matters, when it matters.",
    href:  "/dashboard",
    cta:   "Open dashboard",
  },
  {
    index: "02",
    title: "AI forecasting built on your real traffic.",
    body:  "Not industry benchmarks. Not estimates. Your actual GA4 sessions, trended by our growth model, projected six months forward with confidence intervals that widen honestly over time.",
    href:  "/dashboard",
    cta:   "See the model",
  },
  {
    index: "03",
    title: "GEO — the search layer everyone is ignoring.",
    body:  "Generative Engine Optimisation is not SEO renamed. It is a different discipline. We track AI Overview citations, structured data gaps, and citation probability before your competitors notice.",
    href:  "/blog",
    cta:   "Read the intelligence",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Intro sequence — counts up then reveals homepage
// ─────────────────────────────────────────────────────────────────────────────
function Intro({ onComplete }: { onComplete: () => void }) {
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<"counting" | "revealing" | "done">("counting");

  useEffect(() => {
    // Count 0 → 100 over ~1.8s with eased timing
    const total   = 100;
    const duration = 1800;
    const start    = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out expo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCount(Math.round(eased * total));
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        setTimeout(() => setPhase("revealing"), 300);
        setTimeout(() => { setPhase("done"); onComplete(); }, 1000);
      }
    }

    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onComplete]);

  if (phase === "done") return null;

  return (
    <motion.div
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: EASE_INOUT }}
      style={{
        position:       "fixed",
        inset:          0,
        zIndex:         1000,
        background:     "var(--bg)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        flexDirection:  "column",
        gap:            "24px",
      }}
    >
      {/* Counter */}
      <motion.div
        animate={phase === "revealing" ? { y: -20, opacity: 0 } : { y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE_EXPO }}
        style={{
          fontFamily:    "var(--font-mono)",
          fontSize:      "clamp(4rem, 12vw, 10rem)",
          letterSpacing: "-0.04em",
          lineHeight:    1,
          color:         "var(--text-primary)",
          fontWeight:    400,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {String(count).padStart(3, "0")}
      </motion.div>

      {/* Brand name reveals at end */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={count > 80 ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={{ duration: 0.6, ease: EASE_EXPO }}
        style={{
          fontFamily:    "var(--font-body)",
          fontSize:      "13px",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color:         "var(--text-tertiary)",
        }}
      >
        AI Marketing Labs
      </motion.div>

      {/* Progress line */}
      <div style={{
        position: "absolute",
        bottom:   0,
        left:     0,
        height:   "2px",
        width:    `${count}%`,
        background: "var(--brand)",
        transition: "width 0.05s linear",
      }} />
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated background — floating data points
// ─────────────────────────────────────────────────────────────────────────────
function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let W = 0, H = 0;

    type Particle = {
      x: number; y: number; vx: number; vy: number;
      size: number; opacity: number; pulse: number;
    };

    const particles: Particle[] = [];
    const COUNT = 60;

    function resize() {
      W = canvas!.width  = window.innerWidth;
      H = canvas!.height = window.innerHeight;
    }

    function init() {
      particles.length = 0;
      for (let i = 0; i < COUNT; i++) {
        particles.push({
          x:       Math.random() * W,
          y:       Math.random() * H,
          vx:      (Math.random() - 0.5) * 0.3,
          vy:      (Math.random() - 0.5) * 0.3,
          size:    Math.random() * 1.5 + 0.5,
          opacity: Math.random() * 0.4 + 0.05,
          pulse:   Math.random() * Math.PI * 2,
        });
      }
    }

    function draw(t: number) {
      ctx!.clearRect(0, 0, W, H);

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx   = particles[i].x - particles[j].x;
          const dy   = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx!.beginPath();
            ctx!.moveTo(particles[i].x, particles[i].y);
            ctx!.lineTo(particles[j].x, particles[j].y);
            ctx!.strokeStyle = `rgba(37, 99, 235, ${(1 - dist / 120) * 0.08})`;
            ctx!.lineWidth = 0.5;
            ctx!.stroke();
          }
        }
      }

      // Draw particles
      particles.forEach((p) => {
        p.pulse += 0.015;
        const pulsedOpacity = p.opacity * (0.6 + 0.4 * Math.sin(p.pulse));

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(37, 99, 235, ${pulsedOpacity})`;
        ctx!.fill();

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Wrap
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;
      });

      animId = requestAnimationFrame(draw);
    }

    resize();
    init();
    animId = requestAnimationFrame(draw);

    window.addEventListener("resize", () => { resize(); init(); });
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", () => {});
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:      "absolute",
        inset:         0,
        pointerEvents: "none",
        opacity:       0.6,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scroll-triggered fade up
// ─────────────────────────────────────────────────────────────────────────────
function FadeUp({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties }) {
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.85, ease: EASE_EXPO, delay }}
      style={style}
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Marquee
// ─────────────────────────────────────────────────────────────────────────────
function Marquee() {
  const items = [...CAPABILITIES, ...CAPABILITIES];
  return (
    <div style={{ overflow: "hidden", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "14px 0", background: "var(--surface)" }}>
      <div style={{ display: "flex", width: "max-content", animation: "marquee 32s linear infinite" }}>
        {items.map((cap, i) => (
          <span key={i} style={{
            fontFamily:    "var(--font-mono)",
            fontSize:      "11px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color:         i % 2 === 0 ? "var(--text-primary)" : "var(--text-tertiary)",
            padding:       "0 28px",
            whiteSpace:    "nowrap",
          }}>
            {cap}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated stat counter
// ─────────────────────────────────────────────────────────────────────────────
function StatCounter({ value, label, delay }: { value: string; label: string; delay: number }) {
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.div ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, ease: EASE_EXPO, delay }}
    >
      <div style={{
        fontFamily:    "var(--font-display)",
        fontSize:      "clamp(2rem, 4vw, 3.5rem)",
        letterSpacing: "-0.04em",
        lineHeight:    1,
        color:         "var(--text-primary)",
        marginBottom:  "10px",
      }}>
        {value}
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
        {label}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature row with magnetic hover
// ─────────────────────────────────────────────────────────────────────────────
function FeatureRow({ feature }: { feature: typeof FEATURES[0] }) {
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div ref={ref}
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : {}}
      transition={{ duration: 0.5, ease: EASE_EXPO }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:             "grid",
        gridTemplateColumns: "180px 1fr auto",
        gap:                 "0",
        padding:             "52px 32px",
        borderTop:           "1px solid var(--border)",
        alignItems:          "start",
        background:          hovered ? "var(--muted)" : "transparent",
        transition:          "background 0.3s",
        cursor:              "default",
      }}
    >
      {/* Index */}
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.7, ease: EASE_EXPO, delay: 0.05 }}
        style={{ fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.12em", color: "var(--text-tertiary)", paddingTop: "6px" }}
      >
        {feature.index} —
      </motion.div>

      {/* Content */}
      <div style={{ maxWidth: "620px" }}>
        <motion.h3
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.75, ease: EASE_EXPO, delay: 0.1 }}
          style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.5rem, 2.8vw, 2.2rem)", letterSpacing: "-0.04em", lineHeight: 1.05, color: "var(--text-primary)", fontWeight: 400, marginBottom: "16px" }}
        >
          {feature.title}
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.75, ease: EASE_EXPO, delay: 0.18 }}
          style={{ fontFamily: "var(--font-body)", fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: "520px" }}
        >
          {feature.body}
        </motion.p>
      </div>

      {/* CTA arrow */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.5, ease: EASE_EXPO, delay: 0.3 }}
        style={{ paddingTop: "6px" }}
      >
        <Link href={feature.href} style={{
          display:        "inline-flex",
          alignItems:     "center",
          gap:            "6px",
          fontFamily:     "var(--font-body)",
          fontSize:       "13px",
          fontWeight:     500,
          color:          hovered ? "var(--brand)" : "var(--text-secondary)",
          textDecoration: "none",
          transition:     "color 0.2s, gap 0.2s",
          whiteSpace:     "nowrap",
        }}>
          {feature.cta}
          <motion.span animate={{ x: hovered ? 4 : 0 }} transition={{ duration: 0.2 }}>
            <ArrowRight size={13} />
          </motion.span>
        </Link>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [introComplete, setIntroComplete] = useState(false);
  const [showIntro,     setShowIntro]     = useState(true);

  // Skip intro if visited before in this session
  useEffect(() => {
    const seen = sessionStorage.getItem("aiml-intro-seen");
    if (seen) {
      setShowIntro(false);
      setIntroComplete(true);
    }
  }, []);

  const handleIntroComplete = useCallback(() => {
    sessionStorage.setItem("aiml-intro-seen", "1");
    setIntroComplete(true);
  }, []);

  // Parallax on hero headline
  const heroRef = useRef<HTMLElement>(null);
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 600], [0, 80]);

  return (
    <>
      {/* Intro overlay */}
      <AnimatePresence>
        {showIntro && !introComplete && (
          <Intro onComplete={handleIntroComplete} />
        )}
      </AnimatePresence>

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={introComplete ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.8, ease: EASE_EXPO }}
        style={{ background: "var(--bg)", minHeight: "100vh" }}
      >
        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section ref={heroRef} style={{
          minHeight:     "100vh",
          display:       "flex",
          flexDirection: "column",
          justifyContent:"flex-end",
          padding:       "0 32px 64px",
          position:      "relative",
          overflow:      "hidden",
        }}>
          {/* Animated canvas background */}
          <AnimatedBackground />

          {/* Ambient gradient */}
          <div style={{
            position:      "absolute",
            inset:         0,
            background:    "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(37,99,235,0.07) 0%, transparent 65%)",
            pointerEvents: "none",
            zIndex:        1,
          }} />

          {/* Top metadata */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={introComplete ? { opacity: 1 } : {}}
            transition={{ duration: 1.2, delay: 0.3 }}
            style={{
              position:  "absolute",
              top:       "80px",
              left:      "32px",
              right:     "32px",
              display:   "flex",
              justifyContent: "space-between",
              zIndex:    2,
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
              GEO Intelligence Platform
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em", color: "var(--text-tertiary)" }}>
              Est. 2026 · Welwyn Garden City, UK
            </span>
          </motion.div>

          {/* Main headline — parallax */}
          <motion.div style={{ y: heroY, position: "relative", zIndex: 2, maxWidth: "1200px" }}>
            <motion.h1
              initial={{ opacity: 0, y: 60 }}
              animate={introComplete ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 1.1, ease: EASE_EXPO, delay: 0.15 }}
              style={{
                fontFamily:    "var(--font-display)",
                fontSize:      "clamp(3.5rem, 10vw, 9.5rem)",
                letterSpacing: "-0.05em",
                lineHeight:    0.9,
                color:         "var(--text-primary)",
                fontWeight:    400,
                marginBottom:  "48px",
              }}
            >
              Search<br />
              intelligence<br />
              <span style={{ color: "var(--text-secondary)" }}>for those</span><br />
              who act.
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={introComplete ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.9, ease: EASE_EXPO, delay: 0.45 }}
              style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "24px" }}
            >
              <p style={{
                fontFamily: "var(--font-body)",
                fontSize:   "clamp(14px, 1.4vw, 17px)",
                color:      "var(--text-secondary)",
                lineHeight: 1.7,
                maxWidth:   "420px",
                margin:     0,
              }}>
                GA4, Search Console, and DataForSEO unified. AI forecasts on your real traffic. GEO tracking before anyone else notices.
              </p>

              <motion.div
                initial={{ opacity: 0 }}
                animate={introComplete ? { opacity: 1 } : {}}
                transition={{ duration: 0.8, delay: 0.7 }}
                style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}
              >
                <Link href="/dashboard" style={{
                  display: "inline-flex", alignItems: "center", gap: "8px",
                  fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 500,
                  color: "#fff", background: "var(--brand)", textDecoration: "none",
                  padding: "13px 26px", borderRadius: "100px", transition: "opacity 0.16s",
                }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
                >
                  Open platform <ArrowUpRight size={14} />
                </Link>
                <Link href="/blog" style={{
                  display: "inline-flex", alignItems: "center", gap: "8px",
                  fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 500,
                  color: "var(--text-primary)", background: "transparent", textDecoration: "none",
                  padding: "13px 26px", borderRadius: "100px", border: "1px solid var(--border-strong)",
                  transition: "border-color 0.16s, background 0.16s",
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.background = "var(--muted)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  Read intelligence
                </Link>
              </motion.div>
            </motion.div>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={introComplete ? { opacity: 1 } : {}}
            transition={{ duration: 1, delay: 1.1 }}
            style={{ position: "absolute", bottom: "32px", right: "32px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", zIndex: 2 }}
          >
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              style={{ width: "1px", height: "48px", background: "linear-gradient(to bottom, var(--border-strong), transparent)" }}
            />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)", writingMode: "vertical-rl" }}>
              Scroll
            </span>
          </motion.div>
        </section>

        {/* ── Marquee ─────────────────────────────────────────────────────── */}
        <Marquee />

        {/* ── Stats ───────────────────────────────────────────────────────── */}
        <section style={{ maxWidth: "1400px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderTop: "1px solid var(--border)" }}>
            {STATS.map((stat, i) => (
              <div key={stat.label} style={{ padding: "48px 32px", borderRight: i < STATS.length - 1 ? "1px solid var(--border)" : "none" }}>
                <StatCounter value={stat.value} label={stat.label} delay={0.1 + i * 0.1} />
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ────────────────────────────────────────────────────── */}
        <section style={{ maxWidth: "1400px", margin: "0 auto" }}>
          <FadeUp style={{ padding: "64px 32px 32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
                What it does
              </span>
              <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
            </div>
          </FadeUp>
          {FEATURES.map(feature => (
            <FeatureRow key={feature.index} feature={feature} />
          ))}
        </section>

        {/* ── CTA ─────────────────────────────────────────────────────────── */}
        <section style={{
          borderTop:   "1px solid var(--border)",
          padding:     "120px 32px",
          textAlign:   "center",
          position:    "relative",
          overflow:    "hidden",
        }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 80% at 50% 100%, rgba(37,99,235,0.07) 0%, transparent 60%)", pointerEvents: "none" }} />

          <FadeUp>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)", display: "block", marginBottom: "32px" }}>
              Ready when you are
            </span>
          </FadeUp>

          <FadeUp delay={0.1}>
            <h2 style={{
              fontFamily:    "var(--font-display)",
              fontSize:      "clamp(2.5rem, 7vw, 6.5rem)",
              letterSpacing: "-0.05em",
              lineHeight:    0.92,
              color:         "var(--text-primary)",
              fontWeight:    400,
              marginBottom:  "52px",
              position:      "relative",
              zIndex:        1,
            }}>
              Stop guessing.<br />
              <span style={{ color: "var(--text-secondary)" }}>Start knowing.</span>
            </h2>
          </FadeUp>

          <FadeUp delay={0.2}>
            <Link href="/auth/signup" style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              fontFamily: "var(--font-body)", fontSize: "15px", fontWeight: 500,
              color: "#fff", background: "var(--brand)", textDecoration: "none",
              padding: "15px 36px", borderRadius: "100px", transition: "opacity 0.16s",
              position: "relative", zIndex: 1,
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
            >
              Get started free <ArrowUpRight size={15} />
            </Link>
          </FadeUp>
        </section>
      </motion.div>
    </>
  );
}
