"use client";

// app/page.tsx
// =============================================================================
// AI Marketing Labs — Homepage
// 60fps particle system: counter → burst → converge to headline → idle parallax
// =============================================================================

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useInView, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight, ArrowRight } from "lucide-react";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

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
  { index: "01", title: "Search intelligence that actually moves.", body: "Connect Google Analytics, Search Console, and DataForSEO in one workspace. Stop context-switching between twelve tabs.", href: "/dashboard", cta: "Open dashboard" },
  { index: "02", title: "AI forecasting built on your real traffic.", body: "Not benchmarks. Not estimates. Your actual GA4 sessions, projected six months forward with confidence intervals that widen honestly.", href: "/dashboard", cta: "See the model" },
  { index: "03", title: "GEO — the search layer everyone is ignoring.", body: "We track AI Overview citations, structured data gaps, and citation probability before your competitors notice.", href: "/blog", cta: "Read the intelligence" },
];

// ─────────────────────────────────────────────────────────────────────────────
// PARTICLE CANVAS — handles all 4 phases on one canvas
// Phase 0: counter display (DOM)
// Phase 1: burst (particles explode from counter)
// Phase 2: converge (particles fly to headline text positions)
// Phase 3: idle (particles drift, parallax on scroll)
// ─────────────────────────────────────────────────────────────────────────────
type Phase = 0 | 1 | 2 | 3;

interface Particle {
  // Current state
  x: number; y: number;
  // Velocity
  vx: number; vy: number;
  // Burst target
  bx: number; by: number;
  // Converge target (position in headline text)
  tx: number; ty: number;
  // Idle drift
  dx: number; dy: number; // drift velocity
  dp: number; dps: number; // drift phase + speed
  // Visual
  size: number;
  depth: number;   // 0=far(blue,blurry) 1=near(white,sharp)
  alpha: number;
  color: string;
  // Timing
  burstDelay: number;   // stagger for burst
  convergeDelay: number; // stagger for converge
}

function sampleTextToPositions(
  text: string[], font: string, canvasW: number, canvasH: number,
  pixelSize: number, maxParticles: number
): Array<{ x: number; y: number }> {
  const off   = document.createElement("canvas");
  off.width   = canvasW;
  off.height  = canvasH;
  const octx  = off.getContext("2d")!;
  octx.fillStyle   = "#ffffff";
  octx.font        = font;
  octx.textAlign   = "left";
  octx.textBaseline = "top";

  // Measure and center text block
  const lineHeight = parseInt(font) * 1.1;
  const metrics    = text.map(line => octx.measureText(line));
  const maxW       = Math.max(...metrics.map(m => m.width));
  const totalH     = text.length * lineHeight;
  const startX     = (canvasW - maxW) / 2;
  const startY     = (canvasH - totalH) / 2;

  text.forEach((line, i) => {
    octx.fillText(line, startX, startY + i * lineHeight);
  });

  const imageData = octx.getImageData(0, 0, canvasW, canvasH);
  const data      = imageData.data;
  const positions: Array<{ x: number; y: number }> = [];

  for (let py = 0; py < canvasH; py += pixelSize) {
    for (let px = 0; px < canvasW; px += pixelSize) {
      const idx = (py * canvasW + px) * 4;
      if (data[idx + 3] > 80) {
        positions.push({ x: px + pixelSize / 2, y: py + pixelSize / 2 });
      }
    }
  }

  // Randomly downsample if too many
  if (positions.length > maxParticles) {
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    positions.length = maxParticles;
  }

  return positions;
}

// Ease functions
function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t: number): number { return t < 0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }
function easeOutExpo(t: number): number { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }

function ParticleCanvas({
  phase,
  onPhaseComplete,
  scrollY,
}: {
  phase: Phase;
  onPhaseComplete: (p: Phase) => void;
  scrollY: React.MutableRefObject<number>;
}) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const phaseRef    = useRef<Phase>(phase);
  const particles   = useRef<Particle[]>([]);
  const phaseStart  = useRef<number>(0);
  const rafRef      = useRef<number>(0);

  // Offscreen canvases for blur bucketing
  const farCanvas   = useRef<HTMLCanvasElement | null>(null);
  const midCanvas   = useRef<HTMLCanvasElement | null>(null);
  const nearCanvas  = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true })!;

    let W = 0, H = 0;

    function resize() {
      W = canvas!.width  = window.innerWidth;
      H = canvas!.height = window.innerHeight;
      // Resize offscreen canvases
      [farCanvas, midCanvas, nearCanvas].forEach(c => {
        if (c.current) { c.current.width = W; c.current.height = H; }
      });
    }

    // Create offscreen canvases
    farCanvas.current  = document.createElement("canvas");
    midCanvas.current  = document.createElement("canvas");
    nearCanvas.current = document.createElement("canvas");

    resize();
    window.addEventListener("resize", resize, { passive: true });

    // ── Sample counter text positions (source of burst) ────────────────────
    const counterFontSize = Math.min(W * 0.18, 160);
    const counterPositions = sampleTextToPositions(
      ["100", "AI MARKETING LABS"],
      `400 ${counterFontSize}px "DM Mono", monospace`,
      W, H, 4, 2000
    );

    // ── Sample headline text positions (converge target) ───────────────────
    // Render at actual hero position (left-aligned, bottom of viewport)
    const headlineFontSize = Math.min(W * 0.092, 152);
    const hlOff   = document.createElement("canvas");
    hlOff.width   = W;
    hlOff.height  = H;
    const hlCtx   = hlOff.getContext("2d")!;
    hlCtx.fillStyle = "#ffffff";
    hlCtx.font    = `400 ${headlineFontSize}px Georgia, serif`;
    hlCtx.textAlign = "left";
    hlCtx.textBaseline = "bottom";

    const lines     = ["Search", "intelligence", "for those", "who act."];
    const lineH     = headlineFontSize * 0.92;
    const totalH    = lines.length * lineH;
    const startY    = H - 64 - 48; // matches hero padding-bottom
    const startX    = 32;

    lines.forEach((line, i) => {
      hlCtx.fillText(line, startX, startY - (lines.length - 1 - i) * lineH);
    });

    const hlImageData = hlCtx.getImageData(0, 0, W, H);
    const hlData      = hlImageData.data;
    const headlinePositions: Array<{ x: number; y: number }> = [];

    for (let py = 0; py < H; py += 4) {
      for (let px = 0; px < W; px += 4) {
        const idx = (py * W + px) * 4;
        if (hlData[idx + 3] > 80) headlinePositions.push({ x: px + 2, y: py + 2 });
      }
    }

    // ── Build particles ────────────────────────────────────────────────────
    // Use headline positions as primary — burst from counter → converge to headline
    const MAX = Math.min(counterPositions.length, headlinePositions.length, 1800);

    // Shuffle both arrays
    const shuffleArr = <T,>(arr: T[]) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    };
    shuffleArr(counterPositions);
    shuffleArr(headlinePositions);

    particles.current = [];
    for (let i = 0; i < MAX; i++) {
      const cp    = counterPositions[i] ?? counterPositions[i % counterPositions.length];
      const hp    = headlinePositions[i] ?? headlinePositions[i % headlinePositions.length];
      const depth = Math.random();

      // Burst target: explode outward from counter, biased upward
      const angle  = Math.random() * Math.PI * 2;
      const dist   = 200 + Math.random() * 400;
      const upBias = -(Math.random() * 200 + 100);

      particles.current.push({
        x: cp.x, y: cp.y,
        vx: 0, vy: 0,
        bx: cp.x + Math.cos(angle) * dist,
        by: cp.y + Math.sin(angle) * dist + upBias,
        tx: hp.x,
        ty: hp.y,
        dx: (Math.random() - 0.5) * 0.3,
        dy: -(Math.random() * 0.2 + 0.05),
        dp: Math.random() * Math.PI * 2,
        dps: 0.008 + Math.random() * 0.012,
        size: 3 + Math.random() * 1,
        depth,
        alpha: 0,
        color: "#ffffff",
        burstDelay:    i / MAX * 0.3,
        convergeDelay: i / MAX * 0.5,
      });
    }

    // ── Render loop ────────────────────────────────────────────────────────
    function render(now: number) {
      const ph      = phaseRef.current;
      const elapsed = (now - phaseStart.current) / 1000; // seconds

      ctx.clearRect(0, 0, W, H);

      if (ph === 0) {
        // Phase 0: particles hidden (DOM shows counter)
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      // Clear offscreen canvases
      const far  = farCanvas.current!;
      const mid  = midCanvas.current!;
      const near = nearCanvas.current!;
      const fctx = far.getContext("2d")!;
      const mctx = mid.getContext("2d")!;
      const nctx = near.getContext("2d")!;
      fctx.clearRect(0, 0, W, H);
      mctx.clearRect(0, 0, W, H);
      nctx.clearRect(0, 0, W, H);

      const scroll = scrollY.current;

      let allDone = true;

      for (const p of particles.current) {
        let px = p.x;
        let py = p.y;
        let alpha = p.alpha;

        if (ph === 1) {
          // BURST: ease from origin to burst target
          const t = Math.max(0, Math.min((elapsed - p.burstDelay) / 0.9, 1));
          const et = easeOutCubic(t);
          px    = p.x + (p.bx - p.x) * et; // will update p.x only at end
          py    = p.y + (p.by - p.y) * et;
          alpha = t < 0.1 ? t * 10 : t > 0.85 ? (1 - t) / 0.15 : 1;
          if (t < 1) allDone = false;

        } else if (ph === 2) {
          // CONVERGE: ease from burst position to headline position
          const t  = Math.max(0, Math.min((elapsed - p.convergeDelay) / 1.2, 1));
          const et = easeOutExpo(t);
          px    = p.bx + (p.tx - p.bx) * et;
          py    = p.by + (p.ty - p.by) * et;
          alpha = t < 0.05 ? t / 0.05 : 1;
          if (t < 1) allDone = false;

        } else if (ph === 3) {
          // IDLE: drift gently, parallax on scroll
          p.dp += p.dps;
          p.x  += p.dx + Math.sin(p.dp) * 0.1;
          p.y  += p.dy;
          // Parallax: far particles move faster with scroll
          const parallax = (1 - p.depth) * scroll * 0.12 + p.depth * scroll * 0.04;
          px    = p.x;
          py    = p.y + parallax;
          alpha = 0.6 + p.depth * 0.4;
          allDone = false;

          // Respawn when drifted too far
          if (p.y < -50) {
            p.x = p.tx + (Math.random() - 0.5) * 100;
            p.y = p.ty + 50;
          }
          if (p.x < -20) p.x = W + 20;
          if (p.x > W + 20) p.x = -20;
        }

        // Bucket into depth layer
        const blurDepth = 1 - p.depth; // 0=near(sharp), 1=far(blurry)
        const size      = p.size * (0.5 + p.depth * 0.5);
        const color     = p.depth > 0.6 ? "255,255,255" : p.depth > 0.3 ? "100,150,255" : "37,99,235";

        let targetCtx: CanvasRenderingContext2D;
        if (blurDepth > 0.6)      targetCtx = fctx;  // far: most blur
        else if (blurDepth > 0.3) targetCtx = mctx;  // mid: some blur
        else                       targetCtx = nctx;  // near: sharp

        targetCtx.globalAlpha = Math.max(0, Math.min(1, alpha));
        targetCtx.fillStyle   = `rgb(${color})`;
        targetCtx.fillRect(Math.round(px - size / 2), Math.round(py - size / 2), Math.ceil(size), Math.ceil(size));
      }

      // Composite layers with blur applied once per layer
      ctx.save();
      ctx.filter = "blur(4px)";
      ctx.drawImage(far, 0, 0);
      ctx.filter = "blur(1.5px)";
      ctx.drawImage(mid, 0, 0);
      ctx.filter = "none";
      ctx.drawImage(near, 0, 0);
      ctx.restore();

      if (allDone && ph !== 3) {
        phaseStart.current = now;
        onPhaseComplete(ph);
      }

      rafRef.current = requestAnimationFrame(render);
    }

    phaseStart.current = performance.now();
    rafRef.current     = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []); // eslint-disable-line

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Counter DOM overlay
// ─────────────────────────────────────────────────────────────────────────────
function CounterOverlay({ count, visible }: { count: number; visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          style={{
            position: "fixed", inset: 0, zIndex: 10,
            background: "var(--bg)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px",
            pointerEvents: "none",
          }}
        >
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: "clamp(4rem,12vw,10rem)",
            letterSpacing: "-0.04em", lineHeight: 1,
            color: "var(--text-primary)", fontWeight: 400,
            fontVariantNumeric: "tabular-nums",
          }}>
            {String(count).padStart(3, "0")}
          </div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={count > 80 ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.5, ease: EASE_EXPO }}
            style={{ fontFamily: "var(--font-body)", fontSize: "13px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}
          >
            AI Marketing Labs
          </motion.div>
          {/* Progress bar */}
          <div style={{ position: "absolute", bottom: 0, left: 0, height: "2px", width: `${count}%`, background: "var(--brand)", transition: "width 0.06s linear" }} />
        </motion.div>
      )}
    </AnimatePresence>
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

function StatRow() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderTop: "1px solid var(--border)" }}>
      {STATS.map((stat, i) => {
        const ref    = useRef<HTMLDivElement>(null);
        const inView = useInView(ref, { once: true, margin: "-40px" });
        return (
          <motion.div key={stat.label} ref={ref}
            initial={{ opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: EASE_EXPO, delay: 0.1 + i * 0.1 }}
            style={{ padding: "48px 32px", borderRight: i < 3 ? "1px solid var(--border)" : "none" }}
          >
            <div style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem,4vw,3.5rem)", letterSpacing: "-0.04em", lineHeight: 1, color: "var(--text-primary)", marginBottom: "10px" }}>{stat.value}</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{stat.label}</div>
          </motion.div>
        );
      })}
    </div>
  );
}

function FeatureRow({ feature }: { feature: typeof FEATURES[0] }) {
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [hov,  setHov] = useState(false);
  return (
    <motion.div ref={ref}
      initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ duration: 0.5 }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "grid", gridTemplateColumns: "180px 1fr auto", padding: "52px 32px", borderTop: "1px solid var(--border)", alignItems: "start", background: hov ? "var(--muted)" : "transparent", transition: "background 0.3s" }}
    >
      <motion.div initial={{ opacity: 0, x: -16 }} animate={inView ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.7, ease: EASE_EXPO, delay: 0.05 }}
        style={{ fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.12em", color: "var(--text-tertiary)", paddingTop: "6px" }}
      >{feature.index} —</motion.div>
      <div style={{ maxWidth: "620px" }}>
        <motion.h3 initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.75, ease: EASE_EXPO, delay: 0.1 }}
          style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.5rem,2.8vw,2.2rem)", letterSpacing: "-0.04em", lineHeight: 1.05, color: "var(--text-primary)", fontWeight: 400, marginBottom: "16px" }}
        >{feature.title}</motion.h3>
        <motion.p initial={{ opacity: 0, y: 16 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.75, ease: EASE_EXPO, delay: 0.18 }}
          style={{ fontFamily: "var(--font-body)", fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: "520px" }}
        >{feature.body}</motion.p>
      </div>
      <motion.div initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ duration: 0.5, delay: 0.3 }} style={{ paddingTop: "6px" }}>
        <Link href={feature.href} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500, color: hov ? "var(--brand)" : "var(--text-secondary)", textDecoration: "none", transition: "color 0.2s", whiteSpace: "nowrap" }}>
          {feature.cta}
          <motion.span animate={{ x: hov ? 4 : 0 }} transition={{ duration: 0.2 }}><ArrowRight size={13} /></motion.span>
        </Link>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [count,         setCount]         = useState(0);
  const [phase,         setPhase]         = useState<Phase>(0);
  const [counterVisible,setCounterVisible] = useState(true);
  const [heroVisible,   setHeroVisible]   = useState(false);
  const [contentVisible,setContentVisible] = useState(false);
  const scrollYRef  = useRef(0);
  const { scrollY } = useScroll();

  // Track scroll for particle parallax
  useEffect(() => {
    return scrollY.on("change", v => { scrollYRef.current = v; });
  }, [scrollY]);

  // Skip intro if seen this session
  useEffect(() => {
    if (sessionStorage.getItem("aiml-intro-seen")) {
      setPhase(3);
      setCounterVisible(false);
      setHeroVisible(true);
      setContentVisible(true);
    }
  }, []);

  // Phase 0: count 0→100
  useEffect(() => {
    if (phase !== 0 || !counterVisible) return;
    if (sessionStorage.getItem("aiml-intro-seen")) return;
    const duration = 1800;
    const start    = performance.now();
    let raf: number;
    function tick(now: number) {
      const p     = Math.min((now - start) / duration, 1);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setCount(Math.round(eased * 100));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        // 0.3s pause then start burst
        setTimeout(() => {
          setCounterVisible(false);
          setPhase(1);
        }, 300);
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, counterVisible]);

  const handlePhaseComplete = useCallback((completedPhase: Phase) => {
    if (completedPhase === 1) {
      // Burst done → start converge, show hero text transparent (particles will form it)
      setPhase(2);
      setHeroVisible(true);
    } else if (completedPhase === 2) {
      // Converge done → idle phase, show all content
      setPhase(3);
      setContentVisible(true);
      sessionStorage.setItem("aiml-intro-seen", "1");
    }
  }, []);

  return (
    <>
      {/* Counter DOM overlay */}
      <CounterOverlay count={count} visible={counterVisible} />

      {/* Particle canvas — fixed, always present */}
      {!sessionStorage.getItem("aiml-intro-seen") || phase === 3 ? (
        <ParticleCanvas phase={phase} onPhaseComplete={handlePhaseComplete} scrollY={scrollYRef} />
      ) : null}

      {/* Page content */}
      <div style={{ background: "transparent", minHeight: "100vh", position: "relative", zIndex: 1 }}>

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "0 32px 64px", position: "relative" }}>

          {/* Ambient gradient above particles */}
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(37,99,235,0.05) 0%, transparent 65%)", pointerEvents: "none" }} />

          {/* Top metadata */}
          <AnimatePresence>
            {heroVisible && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 0.5 }}
                style={{ position: "absolute", top: "80px", left: "32px", right: "32px", display: "flex", justifyContent: "space-between" }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>GEO Intelligence Platform</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em", color: "var(--text-tertiary)" }}>Est. 2026 · Welwyn Garden City, UK</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Headline — invisible during converge (particles form it), visible after */}
          <div style={{ position: "relative", zIndex: 2, maxWidth: "1200px" }}>
            <motion.h1
              initial={{ opacity: 0 }}
              animate={contentVisible ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.6, ease: EASE_EXPO }}
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

            <AnimatePresence>
              {contentVisible && (
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.9, ease: EASE_EXPO, delay: 0.2 }}
                  style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "24px" }}
                >
                  <p style={{ fontFamily: "var(--font-body)", fontSize: "clamp(14px,1.4vw,17px)", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: "420px", margin: 0 }}>
                    GA4, Search Console, and DataForSEO unified. AI forecasts on your real traffic. GEO tracking before anyone else notices.
                  </p>
                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 500, color: "#fff", background: "var(--brand)", textDecoration: "none", padding: "13px 26px", borderRadius: "100px", transition: "opacity 0.16s" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
                    >Open platform <ArrowUpRight size={14} /></Link>
                    <Link href="/blog" style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 500, color: "var(--text-primary)", background: "transparent", textDecoration: "none", padding: "13px 26px", borderRadius: "100px", border: "1px solid var(--border-strong)", transition: "border-color 0.16s, background 0.16s" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.background = "var(--muted)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >Read intelligence</Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Scroll indicator */}
          <AnimatePresence>
            {contentVisible && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.8 }}
                style={{ position: "absolute", bottom: "32px", right: "32px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}
              >
                <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  style={{ width: "1px", height: "48px", background: "linear-gradient(to bottom, var(--border-strong), transparent)" }}
                />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)", writingMode: "vertical-rl" }}>Scroll</span>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Rest of page fades in after converge */}
        <AnimatePresence>
          {contentVisible && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease: EASE_EXPO }}>

              <Marquee />

              <section style={{ maxWidth: "1400px", margin: "0 auto" }}>
                <StatRow />
              </section>

              <section style={{ maxWidth: "1400px", margin: "0 auto" }}>
                <FadeUp style={{ padding: "64px 32px 32px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>What it does</span>
                    <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                  </div>
                </FadeUp>
                {FEATURES.map(f => <FeatureRow key={f.index} feature={f} />)}
              </section>

              <section style={{ borderTop: "1px solid var(--border)", padding: "120px 32px", textAlign: "center", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 80% at 50% 100%, rgba(37,99,235,0.07) 0%, transparent 60%)", pointerEvents: "none" }} />
                <FadeUp>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)", display: "block", marginBottom: "32px" }}>Ready when you are</span>
                </FadeUp>
                <FadeUp delay={0.1}>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.5rem,7vw,6.5rem)", letterSpacing: "-0.05em", lineHeight: 0.92, color: "var(--text-primary)", fontWeight: 400, marginBottom: "52px", position: "relative", zIndex: 1 }}>
                    Stop guessing.<br /><span style={{ color: "var(--text-secondary)" }}>Start knowing.</span>
                  </h2>
                </FadeUp>
                <FadeUp delay={0.2}>
                  <Link href="/auth/signup" style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-body)", fontSize: "15px", fontWeight: 500, color: "#fff", background: "var(--brand)", textDecoration: "none", padding: "15px 36px", borderRadius: "100px", transition: "opacity 0.16s", position: "relative", zIndex: 1 }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
                  >Get started free <ArrowUpRight size={15} /></Link>
                </FadeUp>
              </section>

            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </>
  );
}
