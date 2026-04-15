"use client";

// app/page.tsx
// =============================================================================
// AI Marketing Labs — Homepage
// Particle burst intro · Depth blur particles · Scroll reveals
// =============================================================================

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useInView, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight, ArrowRight } from "lucide-react";

const EASE_EXPO  = [0.16, 1, 0.3, 1] as const;
const EASE_INOUT = [0.4, 0, 0.2, 1] as const;

const CAPABILITIES = [
  "SEO Intelligence","GEO Optimisation","Competitor Analysis",
  "AI Overview Tracking","Search Console","Traffic Forecasting",
  "Content Strategy","Keyword Research","Backlink Intelligence",
  "Rank Monitoring","GA4 Integration","6-Month Forecasting",
];

const STATS = [
  { value: "10+",  label: "Data sources"         },
  { value: "6mo",  label: "Forecast horizon"      },
  { value: "85%",  label: "Projection confidence" },
  { value: "Live", label: "GA4 traffic data"      },
];

const FEATURES = [
  {
    index: "01",
    title: "Search intelligence that actually moves.",
    body:  "Connect Google Analytics, Search Console, and DataForSEO in one workspace. Stop context-switching between twelve tabs. See what matters, when it matters.",
    href:  "/dashboard", cta: "Open dashboard",
  },
  {
    index: "02",
    title: "AI forecasting built on your real traffic.",
    body:  "Not industry benchmarks. Not estimates. Your actual GA4 sessions, trended by our growth model, projected six months forward with confidence intervals that widen honestly.",
    href:  "/dashboard", cta: "See the model",
  },
  {
    index: "03",
    title: "GEO — the search layer everyone is ignoring.",
    body:  "Generative Engine Optimisation is not SEO renamed. We track AI Overview citations, structured data gaps, and citation probability before your competitors notice.",
    href:  "/blog", cta: "Read the intelligence",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// INTRO — canvas-based particle burst
// ─────────────────────────────────────────────────────────────────────────────
function Intro({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [count,   setCount]   = useState(0);
  const [phase,   setPhase]   = useState<"counting" | "burst" | "done">("counting");
  const stateRef  = useRef<"counting" | "burst" | "done">("counting");

  // ── Phase 1: count 0→100 ───────────────────────────────────────────────────
  useEffect(() => {
    const duration = 1800;
    const start    = performance.now();
    let raf: number;

    function tick(now: number) {
      const p      = Math.min((now - start) / duration, 1);
      const eased  = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      const n      = Math.round(eased * 100);
      setCount(n);

      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        // 0.3s pause then burst
        setTimeout(() => {
          stateRef.current = "burst";
          setPhase("burst");
        }, 300);
      }
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Phase 2: particle burst on canvas ─────────────────────────────────────
  useEffect(() => {
    if (phase !== "burst") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width  = window.innerWidth;
    const H = canvas.height = window.innerHeight;

    // -- Render the intro text onto an offscreen canvas to sample pixels ------
    const off    = document.createElement("canvas");
    off.width    = W;
    off.height   = H;
    const octx   = off.getContext("2d")!;

    // Draw the counter "100" and brand name centered
    octx.fillStyle = "#ffffff";
    octx.textAlign = "center";
    octx.textBaseline = "middle";
    const counterSize = Math.min(W * 0.18, 160);
    octx.font = `400 ${counterSize}px 'DM Mono', monospace`;
    octx.fillText("100", W / 2, H / 2 - counterSize * 0.3);

    const labelSize = Math.max(10, W * 0.012);
    octx.font = `400 ${labelSize}px Inter, sans-serif`;
    octx.letterSpacing = "0.14em";
    octx.fillText("AI MARKETING LABS", W / 2, H / 2 + counterSize * 0.55);

    // Sample pixels at PIXEL_SIZE intervals
    const PIXEL_SIZE = 4;
    const imageData  = octx.getImageData(0, 0, W, H);
    const data       = imageData.data;

    type Particle = {
      x: number; y: number;      // current pos
      ox: number; oy: number;    // origin pos
      tx: number; ty: number;    // target pos (burst destination)
      vx: number; vy: number;
      size: number;
      alpha: number;
      color: string;
      phase: "burst" | "float";
      // float phase
      fx: number; fy: number;
      fvx: number; fvy: number;
      blur: number;
    };

    const particles: Particle[] = [];

    // Sample lit pixels
    for (let py = 0; py < H; py += PIXEL_SIZE) {
      for (let px = 0; px < W; px += PIXEL_SIZE) {
        const idx = (py * W + px) * 4;
        const a   = data[idx + 3];
        if (a > 60) {
          // Burst direction: explode outward + upward with randomness
          const angle = Math.random() * Math.PI * 2;
          const speed = 2 + Math.random() * 6;
          // Bias upward
          const upBias = -(Math.random() * 3 + 1);

          particles.push({
            x:  px, y:  py,
            ox: px, oy: py,
            tx: px + Math.cos(angle) * speed * 80 * (0.5 + Math.random()),
            ty: py + Math.sin(angle) * speed * 80 * (0.5 + Math.random()) + upBias * 120,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed + upBias,
            size:  PIXEL_SIZE,
            alpha: 1,
            color: `rgba(${data[idx]},${data[idx+1]},${data[idx+2]},1)`,
            phase: "burst",
            fx:   px + (Math.random() - 0.5) * W * 1.5,
            fy:   py - Math.random() * H * 1.2,
            fvx:  (Math.random() - 0.5) * 0.8,
            fvy:  -(Math.random() * 0.6 + 0.2),
            blur: Math.random(),
          });
        }
      }
    }

    let raf: number;
    let startTime: number | null = null;
    const BURST_DURATION  = 800;  // ms for burst to destination
    const FLOAT_DURATION  = 1200; // ms to fade out while floating
    const DONE_AT         = BURST_DURATION + FLOAT_DURATION;

    function animate(now: number) {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const t       = Math.min(elapsed / BURST_DURATION, 1);
      // Ease out cubic
      const et      = 1 - Math.pow(1 - t, 3);

      ctx!.clearRect(0, 0, W, H);
      // Fade background to page bg color
      const bgAlpha = Math.min(elapsed / DONE_AT, 1);
      ctx!.fillStyle = `rgba(8,8,8,${bgAlpha * 0.95})`;
      ctx!.fillRect(0, 0, W, H);

      let allDone = true;

      for (const p of particles) {
        if (p.phase === "burst") {
          // Lerp from origin to burst target
          p.x = p.ox + (p.tx - p.ox) * et;
          p.y = p.oy + (p.ty - p.oy) * et;
          p.alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;

          if (t >= 1) {
            p.phase = "float";
            p.x     = p.tx;
            p.y     = p.ty;
          }
          allDone = false;
        } else {
          // Float upward, drift sideways
          const ft      = Math.min((elapsed - BURST_DURATION) / FLOAT_DURATION, 1);
          p.x  += p.fvx;
          p.y  += p.fvy;
          p.alpha = 1 - ft;
          if (ft < 1) allDone = false;
        }

        if (p.alpha <= 0) continue;

        // Depth blur via shadow
        const blurPx = Math.round(p.blur * 8);
        ctx!.save();
        if (blurPx > 0) {
          ctx!.filter = `blur(${blurPx}px)`;
        }
        ctx!.globalAlpha = Math.max(0, p.alpha);
        ctx!.fillStyle   = p.color;
        ctx!.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
        ctx!.restore();
      }

      if (elapsed < DONE_AT) {
        raf = requestAnimationFrame(animate);
      } else {
        ctx!.clearRect(0, 0, W, H);
        stateRef.current = "done";
        setPhase("done");
        onComplete();
      }
    }

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [phase, onComplete]);

  if (phase === "done") return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "var(--bg)", overflow: "hidden" }}>
      {/* Canvas for particle burst */}
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

      {/* Counter text — visible during counting phase, hidden during burst */}
      <AnimatePresence>
        {phase === "counting" && (
          <motion.div
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            style={{
              position:       "absolute",
              inset:          0,
              display:        "flex",
              flexDirection:  "column",
              alignItems:     "center",
              justifyContent: "center",
              gap:            "16px",
              pointerEvents:  "none",
            }}
          >
            <div style={{
              fontFamily:         "var(--font-mono)",
              fontSize:           "clamp(4rem, 12vw, 10rem)",
              letterSpacing:      "-0.04em",
              lineHeight:         1,
              color:              "var(--text-primary)",
              fontWeight:         400,
              fontVariantNumeric: "tabular-nums",
            }}>
              {String(count).padStart(3, "0")}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={count > 80 ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.5, ease: EASE_EXPO }}
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar */}
      {phase === "counting" && (
        <div style={{
          position:   "absolute",
          bottom:     0,
          left:       0,
          height:     "2px",
          width:      `${count}%`,
          background: "var(--brand)",
          transition: "width 0.05s linear",
        }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPTH PARTICLE BACKGROUND — foreground sharp, background blurred
// particles drift upward with randomness
// ─────────────────────────────────────────────────────────────────────────────
function DepthParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0, H = 0, raf: number;

    type Particle = {
      x:    number;
      y:    number;
      vx:   number;
      vy:   number;
      size: number;
      depth: number; // 0 = far (blurry, dim), 1 = near (sharp, bright)
      alpha: number;
      pulse: number;
      pulseSpeed: number;
    };

    const COUNT = 80;
    const particles: Particle[] = [];

    function resize() {
      W = canvas!.width  = canvas!.offsetWidth;
      H = canvas!.height = canvas!.offsetHeight;
    }

    function spawn(forceY?: number): Particle {
      const depth = Math.random();
      return {
        x:          Math.random() * W,
        y:          forceY !== undefined ? forceY : Math.random() * H,
        // Drift upward (vy negative = up), randomise direction slightly
        vx:         (Math.random() - 0.5) * 0.4,
        vy:         -(0.2 + depth * 0.6 + Math.random() * 0.3),
        size:       depth * 2.5 + 0.5,
        depth,
        alpha:      depth * 0.5 + 0.08,
        pulse:      Math.random() * Math.PI * 2,
        pulseSpeed: 0.008 + Math.random() * 0.012,
      };
    }

    function init() {
      particles.length = 0;
      for (let i = 0; i < COUNT; i++) particles.push(spawn());
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H);

      for (const p of particles) {
        p.pulse += p.pulseSpeed;
        const a   = p.alpha * (0.7 + 0.3 * Math.sin(p.pulse));
        const blur = (1 - p.depth) * 6; // far = blurry, near = sharp

        // Connect nearby same-depth particles with faint lines
        // (only for mid-to-foreground particles, depth > 0.4)
        if (p.depth > 0.4) {
          for (const q of particles) {
            if (q === p || q.depth < 0.4) continue;
            const dx   = p.x - q.x;
            const dy   = p.y - q.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 100) {
              ctx!.beginPath();
              ctx!.moveTo(p.x, p.y);
              ctx!.lineTo(q.x, q.y);
              ctx!.strokeStyle = `rgba(37,99,235,${(1 - dist / 100) * 0.06 * p.depth})`;
              ctx!.lineWidth   = 0.5;
              ctx!.stroke();
            }
          }
        }

        ctx!.save();
        if (blur > 0.5) ctx!.filter = `blur(${blur.toFixed(1)}px)`;
        ctx!.globalAlpha = a;
        ctx!.fillStyle   = p.depth > 0.7
          ? `rgba(255,255,255,1)`     // near: white
          : `rgba(37,99,235,1)`;      // far: blue tint

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Respawn at bottom when gone off top
        if (p.y < -20) {
          const np = spawn(H + 20);
          Object.assign(p, np);
        }
        // Wrap horizontally
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
      }

      raf = requestAnimationFrame(draw);
    }

    const ro = new ResizeObserver(() => { resize(); init(); });
    ro.observe(canvas);
    resize();
    init();
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:      "absolute",
        inset:         0,
        width:         "100%",
        height:        "100%",
        pointerEvents: "none",
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
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

function Marquee() {
  const items = [...CAPABILITIES, ...CAPABILITIES];
  return (
    <div style={{ overflow: "hidden", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "14px 0", background: "var(--surface)" }}>
      <div style={{ display: "flex", width: "max-content", animation: "marquee 32s linear infinite" }}>
        {items.map((cap, i) => (
          <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: i % 2 === 0 ? "var(--text-primary)" : "var(--text-tertiary)", padding: "0 28px", whiteSpace: "nowrap" }}>
            {cap}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatCounter({ value, label, delay }: { value: string; label: string; delay: number }) {
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, ease: EASE_EXPO, delay }}
    >
      <div style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 4vw, 3.5rem)", letterSpacing: "-0.04em", lineHeight: 1, color: "var(--text-primary)", marginBottom: "10px" }}>
        {value}
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
        {label}
      </div>
    </motion.div>
  );
}

function FeatureRow({ feature }: { feature: typeof FEATURES[0] }) {
  const ref     = useRef<HTMLDivElement>(null);
  const inView  = useInView(ref, { once: true, margin: "-80px" });
  const [hov, setHov] = useState(false);

  return (
    <motion.div ref={ref}
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : {}}
      transition={{ duration: 0.5 }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "grid", gridTemplateColumns: "180px 1fr auto",
        padding: "52px 32px", borderTop: "1px solid var(--border)", alignItems: "start",
        background: hov ? "var(--muted)" : "transparent", transition: "background 0.3s",
      }}
    >
      <motion.div initial={{ opacity: 0, x: -16 }} animate={inView ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.7, ease: EASE_EXPO, delay: 0.05 }}
        style={{ fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.12em", color: "var(--text-tertiary)", paddingTop: "6px" }}
      >
        {feature.index} —
      </motion.div>

      <div style={{ maxWidth: "620px" }}>
        <motion.h3 initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.75, ease: EASE_EXPO, delay: 0.1 }}
          style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.5rem, 2.8vw, 2.2rem)", letterSpacing: "-0.04em", lineHeight: 1.05, color: "var(--text-primary)", fontWeight: 400, marginBottom: "16px" }}
        >
          {feature.title}
        </motion.h3>
        <motion.p initial={{ opacity: 0, y: 16 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.75, ease: EASE_EXPO, delay: 0.18 }}
          style={{ fontFamily: "var(--font-body)", fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: "520px" }}
        >
          {feature.body}
        </motion.p>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ duration: 0.5, delay: 0.3 }} style={{ paddingTop: "6px" }}>
        <Link href={feature.href} style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
          color: hov ? "var(--brand)" : "var(--text-secondary)", textDecoration: "none",
          transition: "color 0.2s", whiteSpace: "nowrap",
        }}>
          {feature.cta}
          <motion.span animate={{ x: hov ? 4 : 0 }} transition={{ duration: 0.2 }}>
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

  useEffect(() => {
    const seen = sessionStorage.getItem("aiml-intro-seen");
    if (seen) { setShowIntro(false); setIntroComplete(true); }
  }, []);

  const handleIntroComplete = useCallback(() => {
    sessionStorage.setItem("aiml-intro-seen", "1");
    setIntroComplete(true);
  }, []);

  const heroRef  = useRef<HTMLElement>(null);
  const { scrollY } = useScroll();
  const heroY    = useTransform(scrollY, [0, 600], [0, 80]);

  return (
    <>
      <AnimatePresence>
        {showIntro && !introComplete && (
          <Intro onComplete={handleIntroComplete} />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }}
        animate={introComplete ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.9, ease: EASE_EXPO }}
        style={{ background: "var(--bg)", minHeight: "100vh" }}
      >

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section ref={heroRef} style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "0 32px 64px", position: "relative", overflow: "hidden" }}>

          {/* Depth particle canvas */}
          <DepthParticles />

          {/* Ambient gradient */}
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(37,99,235,0.07) 0%, transparent 65%)", pointerEvents: "none", zIndex: 1 }} />

          {/* Top label */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={introComplete ? { opacity: 1 } : {}}
            transition={{ duration: 1.2, delay: 0.3 }}
            style={{ position: "absolute", top: "80px", left: "32px", right: "32px", display: "flex", justifyContent: "space-between", zIndex: 2 }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
              GEO Intelligence Platform
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em", color: "var(--text-tertiary)" }}>
              Est. 2026 · Welwyn Garden City, UK
            </span>
          </motion.div>

          {/* Headline with parallax */}
          <motion.div style={{ y: heroY, position: "relative", zIndex: 2, maxWidth: "1200px" }}>
            <motion.h1
              initial={{ opacity: 0, y: 60 }}
              animate={introComplete ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 1.1, ease: EASE_EXPO, delay: 0.15 }}
              style={{ fontFamily: "var(--font-display)", fontSize: "clamp(3.5rem, 10vw, 9.5rem)", letterSpacing: "-0.05em", lineHeight: 0.9, color: "var(--text-primary)", fontWeight: 400, marginBottom: "48px" }}
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
              <p style={{ fontFamily: "var(--font-body)", fontSize: "clamp(14px, 1.4vw, 17px)", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: "420px", margin: 0 }}>
                GA4, Search Console, and DataForSEO unified. AI forecasts on your real traffic. GEO tracking before anyone else notices.
              </p>

              <motion.div
                initial={{ opacity: 0 }}
                animate={introComplete ? { opacity: 1 } : {}}
                transition={{ duration: 0.8, delay: 0.7 }}
                style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}
              >
                <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 500, color: "#fff", background: "var(--brand)", textDecoration: "none", padding: "13px 26px", borderRadius: "100px", transition: "opacity 0.16s" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
                >
                  Open platform <ArrowUpRight size={14} />
                </Link>
                <Link href="/blog" style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 500, color: "var(--text-primary)", background: "transparent", textDecoration: "none", padding: "13px 26px", borderRadius: "100px", border: "1px solid var(--border-strong)", transition: "border-color 0.16s, background 0.16s" }}
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
            <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              style={{ width: "1px", height: "48px", background: "linear-gradient(to bottom, var(--border-strong), transparent)" }}
            />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)", writingMode: "vertical-rl" }}>
              Scroll
            </span>
          </motion.div>
        </section>

        {/* ── Marquee ───────────────────────────────────────────────────────── */}
        <Marquee />

        {/* ── Stats ─────────────────────────────────────────────────────────── */}
        <section style={{ maxWidth: "1400px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderTop: "1px solid var(--border)" }}>
            {STATS.map((stat, i) => (
              <div key={stat.label} style={{ padding: "48px 32px", borderRight: i < STATS.length - 1 ? "1px solid var(--border)" : "none" }}>
                <StatCounter value={stat.value} label={stat.label} delay={0.1 + i * 0.1} />
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ──────────────────────────────────────────────────────── */}
        <section style={{ maxWidth: "1400px", margin: "0 auto" }}>
          <FadeUp style={{ padding: "64px 32px 32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>What it does</span>
              <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
            </div>
          </FadeUp>
          {FEATURES.map(f => <FeatureRow key={f.index} feature={f} />)}
        </section>

        {/* ── CTA ───────────────────────────────────────────────────────────── */}
        <section style={{ borderTop: "1px solid var(--border)", padding: "120px 32px", textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 80% at 50% 100%, rgba(37,99,235,0.07) 0%, transparent 60%)", pointerEvents: "none" }} />
          <FadeUp>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)", display: "block", marginBottom: "32px" }}>
              Ready when you are
            </span>
          </FadeUp>
          <FadeUp delay={0.1}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.5rem, 7vw, 6.5rem)", letterSpacing: "-0.05em", lineHeight: 0.92, color: "var(--text-primary)", fontWeight: 400, marginBottom: "52px", position: "relative", zIndex: 1 }}>
              Stop guessing.<br /><span style={{ color: "var(--text-secondary)" }}>Start knowing.</span>
            </h2>
          </FadeUp>
          <FadeUp delay={0.2}>
            <Link href="/auth/signup" style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-body)", fontSize: "15px", fontWeight: 500, color: "#fff", background: "var(--brand)", textDecoration: "none", padding: "15px 36px", borderRadius: "100px", transition: "opacity 0.16s", position: "relative", zIndex: 1 }}
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
