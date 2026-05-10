"use client";

// app/page.tsx — AI Marketing Lab
// GOD MODE particle system — light/dark mode aware
// Phase 1: counter 000→100 → burst
// Phase 2: wipe fills screen
// Phase 3: converge to headline
// Phase 4: scroll disperse/reconverge

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { ArrowUpRight, ArrowRight } from "lucide-react";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;
const CAPABILITIES = [
  "SEO Intelligence","GEO Optimisation","Competitor Analysis","AI Overview Tracking",
  "Search Console","Traffic Forecasting","Content Strategy","Keyword Research",
  "Backlink Intelligence","Rank Monitoring","GA4 Integration","6-Month Forecasting",
];
// STATS: kept honest. "Forecast horizon" is real (6 months). "Free beta" is
// the truth right now — closed beta, no payment, capacity for ~50 testers.
// Anything that sounds like a hard performance number ("85% accuracy", "1000
// users") would be made up given we haven't launched, so we don't put any.
const STATS = [
  { value: "6mo",  label: "Forecast horizon"     },
  { value: "Live", label: "GA4 + Search Console" },
  { value: "Free", label: "Closed beta"          },
  { value: "UK",   label: "Built for UK SMBs"    },
];
const FEATURES = [
  { index: "01", title: "Search intelligence in one workspace.", body: "Connect Google Analytics 4, Search Console, and DataForSEO once. See your rankings, traffic, audit findings, and competitor gaps in one place — without bouncing between twelve tabs.", href: "/dashboard", cta: "Open dashboard" },
  { index: "02", title: "Forecasts built on your real traffic.", body: "Not industry benchmarks. Not made-up averages. Your actual GA4 sessions projected six months forward with confidence intervals that widen honestly the further out you look.", href: "/dashboard", cta: "See the model" },
  { index: "03", title: "GEO — the AI-search layer most tools miss.", body: "Track whether your domain shows up in Google's AI Overview for the keywords you care about, and see who's winning citation share you aren't.", href: "/blog", cta: "Read the intelligence" },
];

// Long-form feature narratives below the platform rows. Rewritten to match
// what the product actually does today (May 2026): keyword tracking, site
// audit, competitor gap analysis, AI strategy generation, GEO probes. The
// previous copy talked about Amazon affiliate, Google Ads, and AI rewriters
// that don't exist — that's been removed. Update this when new features ship.
const COMMAND_CENTRE_FEATURES = [
  {
    index: "04",
    title: "An AI strategy you can actually act on this week.",
    body: "We don't dump a 40-page audit on you and call it a strategy. The AI looks at your real Search Console data, the audit findings on your site, and the keyword gaps against your top three competitors — then proposes three to five concrete moves with the impact and effort scored honestly.",
    body2: "Each strategy comes with a checklist you tick off as you go. Pick one, work it for a fortnight, see it move the numbers. No agency retainer, no jargon, no SEO degree required.",
  },
  {
    index: "05",
    title: "Honest data from sources that already know your site.",
    body: "We connect to your own Google Analytics 4 and Search Console accounts to see your real traffic and ranking positions, not industry benchmarks or estimates. Where you've earned a position, we show it. Where you haven't, we say so plainly.",
    body2: "On top of that we run a technical site audit using PageSpeed Insights and our own crawler — performance, accessibility, on-page, schema. Everything is backed by a source you can click through to verify.",
  },
  {
    index: "06",
    title: "Watch yourself appear (or not) in AI search.",
    body: "AI Overviews and ChatGPT-style answer engines are quietly rerouting search traffic. Most SMB tools haven't caught up. We track whether your domain is being cited in Google's AI Overview for the keywords you care about, and surface where you're losing citation share to competitors.",
    body2: "Live AI Overview tracking is available when DataForSEO SERP is enabled on your workspace. Without it we run a clearly-labelled simulation so you can still see directional signal — we never pass simulated data off as real measurement.",
  },
];

// TESTIMONIALS — empty until real ones come back from the closed beta.
// UK CMA + ASA rules make fabricated or "representative" testimonials a
// banned practice (Schedule 1 §11 of the Consumer Protection from Unfair
// Trading Regs). The home-page render is gated on this array being non-empty
// so the section disappears entirely while we have nothing real to show.
const TESTIMONIALS: { quote: string; source: string }[] = [];

// CAPABILITY_GRID — what the product actually does today. If a feature is in
// development or partially shipped we say so explicitly rather than implying
// it's done. This grid is what a UK SMB owner sees on the home page; every
// item here must be verifiable by anyone signing up for the beta.
const CAPABILITY_GRID = [
  { title: "Daily rank tracking",         body: "Snapshots your Search Console positions every night so you can see the trend, not just today's number." },
  { title: "Technical site audit",        body: "Performance, accessibility, on-page, and Core Web Vitals via PageSpeed Insights and our own crawler." },
  { title: "Keyword research",            body: "Google Trends related-queries plus your own GSC top queries. Volume estimates where we have them." },
  { title: "Competitor gap analysis",     body: "See keywords competitors rank for that you don't, sorted by likely-winnable opportunity." },
  { title: "AI strategy generator",       body: "Three to five concrete moves a week, scored on impact and effort, with a checklist to work through." },
  { title: "Content drafting",            body: "Generate blog and landing-page drafts that target the keywords your strategy says matter most." },
  { title: "AI Overview tracking",        body: "Watch whether Google's AI Overview cites your domain for keywords you care about. Live mode requires DataForSEO." },
  { title: "Traffic forecasting",         body: "Six months projected forward from your real GA4 sessions, with confidence intervals that widen honestly." },
  { title: "Daily alerts",                body: "Email notifications when rankings drop, audit issues appear, or new keywords break into the top 100." },
  { title: "UK-first",                    body: "Built around UK SERPs, GBP, and Search Console domain properties. No US-centric assumptions baked in." },
];

// FAQ_ITEMS — answers reflect the actual product state in May 2026 (closed
// beta, free, UK SMB focus). If you change pricing or scope, update these.
// Avoid evergreen-sounding claims that won't age well.
const FAQ_ITEMS = [
  {
    q: "Is this free?",
    a: "Yes — during the closed beta. We're testing with a small group of UK small business owners through summer 2026 to make sure the tool actually moves their numbers before charging anyone. No credit card, no trial expiry, no surprise bills.",
  },
  {
    q: "What do I need to connect for it to work?",
    a: "Your Google Search Console property (so we can see your real rankings) and your Google Analytics 4 property (so we can show your real traffic). Both are free Google products. Connection is one-click via Google sign-in once OAuth is approved — until then you'll add a service-account email as a viewer to each property.",
  },
  {
    q: "Will the AI write content for me?",
    a: "Yes — we generate blog and landing-page drafts targeted at keywords your strategy identifies as worth pursuing. Treat them as a starting point, not finished copy. You'll always want to add your own voice, examples, and judgement before publishing. The AI's job is to remove the blank page, not replace you.",
  },
  {
    q: "How does AI Overview citation tracking work?",
    a: "When DataForSEO SERP is enabled on your workspace, we query Google's Live SERP for each tracked keyword and check whether your domain appears in the AI Overview's cited references. When it isn't enabled we run a Claude-powered simulation that's clearly labelled as such — you'll always know which mode produced a result.",
  },
  {
    q: "Is my data safe? Where is it stored?",
    a: "Your data lives in a UK-region Supabase project (Postgres) with row-level security so users can only ever read their own rows. We don't sell, share, or train on it. The privacy notice explains exactly what we collect, why, how long we keep it, and how to delete it.",
  },
  {
    q: "How is this different from Ahrefs or SEMrush?",
    a: "Those are excellent tools built for SEO professionals at agencies. They cost £100+/month and assume you already know what a backlink profile is. We're built for the small business owner who wants 'what should I do this week to get more customers' — fewer levers, more action lists, tuned for the UK SMB context.",
  },
  {
    q: "When will it be available to everyone?",
    a: "We're aiming to open it up more widely in autumn 2026, after the beta period. If you'd like to be on the list when that happens, sign up now — beta users automatically get continued access on whatever plan we land on.",
  },
];

function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }
function easeOutExpo(t: number)  { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }
function easeInExpo(t: number)   { return t === 0 ? 0 : Math.pow(2, 10 * t - 10); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function sampleText(
  lines: string[], font: string,
  W: number, H: number,
  step: number, maxP: number,
  align: "center" | "left" = "center",
  offsetX = 0, offsetY = 0
): Array<{ x: number; y: number }> {
  const off = document.createElement("canvas");
  off.width = W; off.height = H;
  const ctx = off.getContext("2d")!;
  const fsize = parseInt(font);
  const lh = fsize * 0.95;
  ctx.fillStyle = "#fff";
  ctx.font = font;
  ctx.textBaseline = "top";
  ctx.textAlign = align;
  if (align === "center") {
    const totalH = lines.length * lh;
    const sy = (H - totalH) / 2 + offsetY;
    lines.forEach((l, i) => ctx.fillText(l, W / 2 + offsetX, sy + i * lh));
  } else {
    const lh2 = fsize * 0.92;
    lines.forEach((l, i) => ctx.fillText(l, 32 + offsetX, offsetY + i * lh2));
  }
  const d = ctx.getImageData(0, 0, W, H).data;
  const pts: Array<{ x: number; y: number }> = [];
  for (let py = 0; py < H; py += step)
    for (let px = 0; px < W; px += step)
      if (d[(py * W + px) * 4 + 3] > 30) pts.push({ x: px + step / 2, y: py + step / 2 });
  for (let i = pts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pts[i], pts[j]] = [pts[j], pts[i]];
  }
  if (pts.length > maxP) pts.length = maxP;
  return pts;
}

type MasterPhase = "counter" | "burst" | "wipe" | "converge" | "idle";

interface Particle {
  x: number; y: number;
  ox: number; oy: number;
  bx: number; by: number;
  tx: number; ty: number;
  rx: number; ry: number;
  dvx: number; dvy: number;
  dp: number; dps: number;
  size: number;
  depth: number;
  burstDelay: number;
  convergeDelay: number;
}

function MasterCanvas({
  phase, onPhaseComplete, scrollFrac, isDark,
}: {
  phase: MasterPhase;
  onPhaseComplete: (p: MasterPhase) => void;
  scrollFrac: React.MutableRefObject<number>;
  isDark: boolean;
}) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const phaseRef   = useRef<MasterPhase>(phase);
  const phaseTRef  = useRef<number>(0);
  const rafRef     = useRef<number>(0);
  const particles  = useRef<Particle[]>([]);
  const farOff     = useRef<HTMLCanvasElement | null>(null);
  const nearOff    = useRef<HTMLCanvasElement | null>(null);
  const initDone   = useRef(false);
  const isDarkRef  = useRef(isDark);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { isDarkRef.current = isDark; }, [isDark]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const M = 200;
    let W = 0, H = 0, CW = 0, CH = 0;
    farOff.current  = document.createElement("canvas");
    nearOff.current = document.createElement("canvas");

    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      CW = canvas!.width  = W + 2 * M;
      CH = canvas!.height = H + 2 * M;
      farOff.current!.width  = CW; farOff.current!.height  = CH;
      nearOff.current!.width = CW; nearOff.current!.height = CH;
      if (!initDone.current) buildParticles();
    }

    function buildParticles() {
      initDone.current = true;
      const csize = Math.min(W * 0.18, 160);
      const cPts  = sampleText(
        ["100", "AI MARKETING LAB"],
        `400 ${csize}px "DM Mono",monospace`,
        W, H, 3, 5000, "center"
      );
      const hsize  = Math.max(56, Math.min(W * 0.10, 152));
      const hlines = ["Search", "intelligence", "for those", "who act."];
      const hlh    = hsize * 0.9;
      const hlOff  = document.createElement("canvas");
      hlOff.width  = W; hlOff.height = H;
      const hlCtx  = hlOff.getContext("2d")!;
      hlCtx.fillStyle    = "#fff";
      hlCtx.font         = `400 ${hsize}px Georgia,serif`;
      hlCtx.textBaseline = "top";
      hlCtx.textAlign    = "left";
      const hlStartY = H * 0.18;
      hlines.forEach((l, i) => hlCtx.fillText(l, 32, hlStartY + i * hlh));
      const hlImgData = hlOff.getContext("2d")!.getImageData(0, 0, W, H).data;
      const hPtsRaw: Array<{x:number;y:number}> = [];
      for (let py2 = 0; py2 < H; py2 += 3)
        for (let px2 = 0; px2 < W; px2 += 3)
          if (hlImgData[(py2 * W + px2) * 4 + 3] > 30)
            hPtsRaw.push({ x: px2 + 1.5, y: py2 + 1.5 });
      for (let i = hPtsRaw.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [hPtsRaw[i], hPtsRaw[j]] = [hPtsRaw[j], hPtsRaw[i]];
      }
      if (hPtsRaw.length > 5000) hPtsRaw.length = 5000;
      const hPts = hPtsRaw;
      const N = Math.min(cPts.length, hPts.length, 5000);
      particles.current = [];
      for (let i = 0; i < N; i++) {
        const cp = cPts[i % cPts.length];
        const hp = hPts[i % hPts.length];
        const depth = Math.random();
        const angle = Math.random() * Math.PI * 2;
        const dist  = 250 + Math.random() * 500;
        const up    = -(150 + Math.random() * 300);
        particles.current.push({
          x: cp.x, y: cp.y, ox: cp.x, oy: cp.y,
          bx: cp.x + Math.cos(angle) * dist,
          by: cp.y + Math.sin(angle) * dist + up,
          tx: hp.x, ty: hp.y,
          rx: -M + Math.random() * (W + 2 * M),
          ry: -M + Math.random() * (H + 2 * M),
          dvx: (Math.random() - 0.5) * 0.25,
          dvy: -(0.1 + Math.random() * 0.2),
          dp:  Math.random() * Math.PI * 2,
          dps: 0.006 + Math.random() * 0.01,
          size: 1.5 + Math.random() * 1.0,
          depth,
          burstDelay:    (i / N) * 0.35,
          convergeDelay: Math.random() * 0.6,
        });
      }
    }

    function getParticleColor(depth: number, dark: boolean): string {
      if (dark) {
        // Dark mode: white near, blue far
        return depth > 0.6 ? "255,255,255" : depth > 0.3 ? "140,170,255" : "37,99,235";
      } else {
        // Light mode: dark near, blue far — visible on white background
        return depth > 0.6 ? "10,10,20" : depth > 0.3 ? "37,99,235" : "100,130,220";
      }
    }

    function composite(elapsed: number) {
      const far  = farOff.current!;
      const near = nearOff.current!;
      const fc   = far.getContext("2d")!;
      const nc   = near.getContext("2d")!;
      fc.clearRect(0, 0, CW, CH);
      nc.clearRect(0, 0, CW, CH);
      const ph   = phaseRef.current;
      const sf   = clamp(scrollFrac.current, 0, 1);
      const dark = isDarkRef.current;

      for (const p of particles.current) {
        let px = p.x, py = p.y, a = 0;

        if (ph === "burst") {
          const t  = clamp((elapsed - p.burstDelay) / 1.0, 0, 1);
          const et = easeOutCubic(t);
          px = lerp(p.ox, p.bx, et);
          py = lerp(p.oy, p.by, et);
          a  = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;
        } else if (ph === "wipe") {
          px = p.bx; py = p.by;
          a  = clamp(1 - elapsed / 0.4, 0, 1);
        } else if (ph === "converge") {
          const t  = clamp((elapsed - p.convergeDelay) / 1.4, 0, 1);
          const et = easeOutExpo(t);
          px = lerp(p.rx, p.tx, et);
          py = lerp(p.ry, p.ty, et);
          a  = t < 0.08 ? t / 0.08 : 1;
          p.x = px; p.y = py;
        } else if (ph === "idle") {
          const disperseT = easeInExpo(sf);
          const dirX = p.rx - p.tx;
          const dirY = p.ry - p.ty;
          const dx   = dirX * disperseT * (1 + sf * 2);
          const dy   = dirY * disperseT * (1 + sf * 2);
          p.dp  += p.dps;
          const drift = clamp(1 - sf * 6, 0, 1);
          p.x   = p.tx + dx + Math.sin(p.dp) * 1.2 * drift;
          p.y   = p.ty + dy + Math.cos(p.dp * 0.7) * 0.6 * drift;
          px    = p.x; py = p.y;
          a     = clamp(1 - sf * 0.6, 0.02, 1);
        }

        if (a <= 0.01) continue;
        const sz   = p.size * (0.5 + p.depth * 0.5);
        const c    = getParticleColor(p.depth, dark);
        const tctx = p.depth < 0.4 ? fc : nc;
        tctx.globalAlpha = Math.max(0, Math.min(1, a));
        tctx.fillStyle   = `rgb(${c})`;
        tctx.fillRect(Math.round(px - sz / 2 + M), Math.round(py - sz / 2 + M), Math.ceil(sz), Math.ceil(sz));
      }

      ctx.save();
      ctx.filter = "blur(3px)";
      ctx.drawImage(far, 0, 0);
      ctx.filter = "none";
      ctx.drawImage(near, 0, 0);
      ctx.restore();
    }

    function frame(now: number) {
      const ph      = phaseRef.current;
      const elapsed = (now - phaseTRef.current) / 1000;
      const dark    = isDarkRef.current;
      ctx.clearRect(0, 0, CW, CH);

      if (ph === "burst") {
        composite(elapsed);
        if (elapsed > 0.35 + 1.1) { phaseTRef.current = now; onPhaseComplete("burst"); }

      } else if (ph === "wipe") {
        composite(elapsed);
        const t  = clamp(elapsed / 0.55, 0, 1);
        const et = easeInExpo(t);
        const r  = et * Math.sqrt(CW * CW + CH * CH);
        ctx.save();
        ctx.globalAlpha = clamp(t * 1.5, 0, 1);
        // Wipe to correct bg color based on mode
        ctx.fillStyle = dark ? "#080808" : "#f5f5f0";
        ctx.beginPath();
        ctx.arc(W / 2 + M, H / 2 + M, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (t >= 1) { phaseTRef.current = now; onPhaseComplete("wipe"); }

      } else if (ph === "converge") {
        // Background fades from wipe color to page bg
        const bgT  = clamp(elapsed / 1.8, 0, 1);
        if (dark) {
          const bg = Math.round(lerp(8, 8, bgT)); // stay dark
          ctx.fillStyle = `rgb(${bg},${bg},${bg})`;
        } else {
          // Light: start from near-white, stay light
          const bg = Math.round(lerp(245, 245, bgT));
          ctx.fillStyle = `rgb(${bg},${bg},${Math.round(lerp(240, 240, bgT))})`;
        }
        ctx.fillRect(0, 0, CW, CH);
        composite(elapsed);
        if (elapsed > 0.6 + 1.4) { phaseTRef.current = now; onPhaseComplete("converge"); }

      } else if (ph === "idle") {
        composite(elapsed);
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", resize, { passive: true });
    phaseTRef.current = performance.now();
    rafRef.current    = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []); // eslint-disable-line

  return (
    <canvas ref={canvasRef} style={{
      position: "fixed", top: "-200px", left: "-200px",
      width: "calc(100% + 400px)", height: "calc(100% + 400px)",
      pointerEvents: "none", zIndex: 5,
    }} />
  );
}

// Counter overlay
function CounterOverlay({ count, visible }: { count: number; visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div exit={{ opacity: 0, transition: { duration: 0.15 } }}
          style={{ position: "fixed", inset: 0, zIndex: 20, background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", pointerEvents: "none" }}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(4rem,12vw,10rem)", letterSpacing: "-0.04em", lineHeight: 1, color: "var(--text-primary)", fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>
            {String(count).padStart(3, "0")}
          </div>
          <motion.div
            animate={count > 80 ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.5 }}
            style={{ fontFamily: "var(--font-body)", fontSize: "13px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}
          >
            AI Marketing Lab
          </motion.div>
          <div style={{ position: "absolute", bottom: 0, left: 0, height: "2px", width: `${count}%`, background: "var(--brand)", transition: "width 0.06s linear" }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Helpers
function FadeUp({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 32 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.85, ease: EASE_EXPO, delay }} style={style}>
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
          <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: i % 2 === 0 ? "var(--text-primary)" : "var(--text-tertiary)", padding: "0 28px", whiteSpace: "nowrap" }}>{cap}</span>
        ))}
      </div>
    </div>
  );
}

function StatCell({ stat, i }: { stat: { value: string; label: string }; i: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 24 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.8, ease: EASE_EXPO, delay: 0.1 + i * 0.1 }}
      style={{ padding: "48px 32px", borderRight: i < 3 ? "1px solid var(--border)" : "none" }}
    >
      <div style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem,4vw,3.5rem)", letterSpacing: "-0.04em", lineHeight: 1, color: "var(--text-primary)", marginBottom: "10px" }}>{stat.value}</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{stat.label}</div>
    </motion.div>
  );
}

function StatRow() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderTop: "1px solid var(--border)" }}>
      {STATS.map((stat, i) => <StatCell key={stat.label} stat={stat} i={i} />)}
    </div>
  );
}

function FeatureRow({ feature }: { feature: typeof FEATURES[0] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [hov, setHov] = useState(false);
  return (
    <motion.div ref={ref} initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ duration: 0.5 }}
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
// Long-form narrative row — mirrors FeatureRow's 180px gutter + serif headline
// look, but drops the CTA column and carries two paragraphs of body.
// ─────────────────────────────────────────────────────────────────────────────
function NarrativeRow({ feature }: { feature: typeof COMMAND_CENTRE_FEATURES[0] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ duration: 0.5 }}
      style={{ display: "grid", gridTemplateColumns: "180px 1fr", padding: "56px 32px", borderTop: "1px solid var(--border)", alignItems: "start" }}
    >
      <motion.div initial={{ opacity: 0, x: -16 }} animate={inView ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.7, ease: EASE_EXPO, delay: 0.05 }}
        style={{ fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.12em", color: "var(--text-tertiary)", paddingTop: "6px" }}
      >{feature.index} —</motion.div>
      <div style={{ maxWidth: "760px" }}>
        <motion.h3 initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.75, ease: EASE_EXPO, delay: 0.1 }}
          style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.5rem,2.8vw,2.2rem)", letterSpacing: "-0.04em", lineHeight: 1.05, color: "var(--text-primary)", fontWeight: 400, marginBottom: "22px" }}
        >{feature.title}</motion.h3>
        <motion.p initial={{ opacity: 0, y: 16 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.75, ease: EASE_EXPO, delay: 0.18 }}
          style={{ fontFamily: "var(--font-body)", fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: "18px" }}
        >{feature.body}</motion.p>
        <motion.p initial={{ opacity: 0, y: 16 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.75, ease: EASE_EXPO, delay: 0.24 }}
          style={{ fontFamily: "var(--font-body)", fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.8 }}
        >{feature.body2}</motion.p>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Testimonial card — pair rendered inside a 2-col grid with vertical rule.
// ─────────────────────────────────────────────────────────────────────────────
function TestimonialCard({ t, i }: { t: typeof TESTIMONIALS[0]; i: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 24 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.8, ease: EASE_EXPO, delay: 0.1 + i * 0.1 }}
      style={{ padding: "56px 32px", borderRight: i === 0 ? "1px solid var(--border)" : "none" }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "28px", letterSpacing: "-0.02em", color: "var(--brand)", lineHeight: 1, marginBottom: "24px" }}>&ldquo;</div>
      <p style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.15rem,1.8vw,1.45rem)", letterSpacing: "-0.02em", color: "var(--text-primary)", lineHeight: 1.4, fontWeight: 400, marginBottom: "28px" }}>
        {t.quote}
      </p>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
        {t.source}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Capability grid cell — 2-column grid on desktop, single on narrow screens.
// ─────────────────────────────────────────────────────────────────────────────
function CapabilityCell({ item, i }: { item: typeof CAPABILITY_GRID[0]; i: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 16 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7, ease: EASE_EXPO, delay: (i % 4) * 0.06 }}
      style={{
        padding: "32px 28px",
        borderTop: "1px solid var(--border)",
        borderLeft: i % 2 === 1 ? "1px solid var(--border)" : "none",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", color: "var(--text-tertiary)", marginBottom: "14px" }}>
        {String(i + 1).padStart(2, "0")}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "19px", color: "var(--text-primary)", fontWeight: 400, lineHeight: 1.25, marginBottom: "10px", letterSpacing: "-0.02em" }}>
        {item.title}
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
        {item.body}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FAQ accordion row — collapses with a height animation; plus rotates to ×.
// ─────────────────────────────────────────────────────────────────────────────
function FAQRow({ item }: { item: typeof FAQ_ITEMS[0] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          all: "unset", cursor: "pointer", width: "100%", boxSizing: "border-box",
          display: "grid", gridTemplateColumns: "1fr auto", gap: "24px",
          padding: "28px 32px", alignItems: "center",
        }}
      >
        <span style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.05rem,1.6vw,1.3rem)", color: "var(--text-primary)", fontWeight: 400, lineHeight: 1.35, letterSpacing: "-0.015em" }}>
          {item.q}
        </span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.25, ease: EASE_EXPO }}
          style={{ fontFamily: "var(--font-mono)", fontSize: "20px", color: "var(--text-tertiary)", lineHeight: 1, display: "inline-block" }}
        >+</motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE_EXPO }}
            style={{ overflow: "hidden" }}
          >
            <p style={{ fontFamily: "var(--font-body)", fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.8, padding: "0 32px 28px", maxWidth: "780px" }}>
              {item.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Page
export default function HomePage() {
  const [count,           setCount]           = useState(0);
  const [counterVisible,  setCounterVisible]  = useState(true);
  const [phase,           setPhase]           = useState<MasterPhase>("counter");
  const [contentVisible,  setContentVisible]  = useState(false);
  const [headlineVisible, setHeadlineVisible] = useState(false);
  const [isDark,          setIsDark]          = useState(true);
  const scrollFrac = useRef(0);
  const heroRef    = useRef<HTMLDivElement>(null);

  const [skipIntro] = useState(() =>
    typeof window !== "undefined" && !!sessionStorage.getItem("aiml-intro-seen")
  );

  // Detect dark/light mode
  useEffect(() => {
    function detect() {
      setIsDark(!document.documentElement.classList.contains("light"));
    }
    detect();
    const observer = new MutationObserver(detect);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (skipIntro) {
      setPhase("idle"); setCounterVisible(false); setHeadlineVisible(true); setContentVisible(true);
    }
  }, [skipIntro]);

  useEffect(() => {
    function onScroll() {
      const heroEl = heroRef.current;
      if (!heroEl) return;
      scrollFrac.current = clamp(window.scrollY / (heroEl.offsetHeight * 1.8), 0, 1);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (skipIntro) return;
    const duration = 1800, start = performance.now();
    let raf: number;
    function tick(now: number) {
      const p = Math.min((now - start) / duration, 1);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setCount(Math.round(eased * 100));
      if (p < 1) { raf = requestAnimationFrame(tick); }
      else { setTimeout(() => { setCounterVisible(false); setPhase("burst"); }, 300); }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [skipIntro]);

  const handlePhaseComplete = useCallback((completed: MasterPhase) => {
    if (completed === "burst") { setPhase("wipe"); }
    else if (completed === "wipe") { setPhase("converge"); }
    else if (completed === "converge") {
      setPhase("idle"); setHeadlineVisible(true); setContentVisible(true);
      if (typeof window !== "undefined") sessionStorage.setItem("aiml-intro-seen", "1");
    }
  }, []);

  const showCanvas = !skipIntro || phase === "idle";

  return (
    <>
      <CounterOverlay count={count} visible={counterVisible} />

      {showCanvas && (
        <MasterCanvas phase={phase} onPhaseComplete={handlePhaseComplete} scrollFrac={scrollFrac} isDark={isDark} />
      )}

      <div style={{ background: phase === "converge" ? "transparent" : "var(--bg)", minHeight: "100vh", position: "relative", zIndex: 1 }}>

        {/* Hero */}
        <div ref={heroRef} style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "flex-start", padding: "18vh 32px 64px", position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(37,99,235,0.05) 0%, transparent 65%)", pointerEvents: "none" }} />

          <AnimatePresence>
            {headlineVisible && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.4 }}
                style={{ position: "absolute", top: "72px", left: "32px", right: "32px", display: "flex", justifyContent: "space-between", zIndex: 2 }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>GEO Intelligence Platform</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em", color: "var(--text-tertiary)" }}>Est. 2026 · Welwyn Garden City, UK</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ position: "relative", zIndex: 2, maxWidth: "1200px" }}>
            {/* Spacer — particles form the headline text here */}
            <div style={{
              height: "clamp(calc(3.5rem * 4 * 0.9), calc(10vw * 4 * 0.9), calc(9.5rem * 4 * 0.9))",
              marginBottom: "52px", pointerEvents: "none",
            }} />

            <AnimatePresence>
              {contentVisible && (
                <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE_EXPO, delay: 0.3 }}
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
        </div>

        <AnimatePresence>
          {contentVisible && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease: EASE_EXPO }}>
              <Marquee />
              <section style={{ maxWidth: "1400px", margin: "0 auto" }}><StatRow /></section>
              <section style={{ maxWidth: "1400px", margin: "0 auto" }}>
                <FadeUp style={{ padding: "64px 32px 32px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>What it does</span>
                    <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                  </div>
                </FadeUp>
                {FEATURES.map(f => <FeatureRow key={f.index} feature={f} />)}
              </section>

              {/* ── Command Centre intro ─────────────────────────────────── */}
              <section style={{ borderTop: "1px solid var(--border)", maxWidth: "1400px", margin: "0 auto", padding: "120px 32px 64px" }}>
                <FadeUp>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "40px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>Command Centre</span>
                    <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                  </div>
                </FadeUp>
                <FadeUp delay={0.08}>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.25rem,5.2vw,4.75rem)", letterSpacing: "-0.045em", lineHeight: 1, color: "var(--text-primary)", fontWeight: 400, marginBottom: "32px", maxWidth: "1100px" }}>
                    Your complete digital marketing <span style={{ color: "var(--text-secondary)" }}>command centre.</span>
                  </h2>
                </FadeUp>
                <FadeUp delay={0.16}>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: "clamp(16px,1.4vw,19px)", color: "var(--text-secondary)", lineHeight: 1.65, maxWidth: "760px", marginBottom: "24px" }}>
                    Harness the power of advanced AI text generators and marketing intelligence tools to transform your campaigns and boost conversions.
                  </p>
                </FadeUp>
                <FadeUp delay={0.22}>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: "760px" }}>
                    Welcome to Britain&rsquo;s most comprehensive AI marketing lab, where cutting-edge artificial intelligence meets strategic digital marketing. Whether you&rsquo;re running Google Ads, diving into affiliate marketing, or crafting compelling content, our suite of AI-powered tools gives you the competitive edge you&rsquo;ve been searching for.
                  </p>
                </FadeUp>
              </section>

              {/* ── Three long-form feature narratives ───────────────────── */}
              <section style={{ maxWidth: "1400px", margin: "0 auto" }}>
                {COMMAND_CENTRE_FEATURES.map(f => <NarrativeRow key={f.index} feature={f} />)}
              </section>

              {/* ── Testimonials ─────────────────────────────────────────── */}
              {/* Section is rendered only when we have real, attributed
                  testimonials. UK CMA + ASA rules prohibit fabricated or
                  representative ones, so we'd rather show nothing than fake
                  social proof while we're still in closed beta. */}
              {TESTIMONIALS.length > 0 && (
                <section style={{ borderTop: "1px solid var(--border)", maxWidth: "1400px", margin: "0 auto" }}>
                  <FadeUp style={{ padding: "64px 32px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>What beta users are saying</span>
                      <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                    </div>
                  </FadeUp>
                  <div className="grid-1-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid var(--border)", marginTop: "52px" }}>
                    {TESTIMONIALS.map((t, i) => <TestimonialCard key={i} t={t} i={i} />)}
                  </div>
                </section>
              )}

              {/* ── Capability grid — "Everything You Need" ──────────────── */}
              <section style={{ borderTop: "1px solid var(--border)", maxWidth: "1400px", margin: "0 auto", padding: "96px 32px 0" }}>
                <FadeUp>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>Capabilities</span>
                    <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                  </div>
                </FadeUp>
                <FadeUp delay={0.08}>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem,4.2vw,3.75rem)", letterSpacing: "-0.04em", lineHeight: 1.02, color: "var(--text-primary)", fontWeight: 400, marginBottom: "56px", maxWidth: "900px" }}>
                    Everything you need to dominate your market.
                  </h2>
                </FadeUp>
                <div className="grid-1-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--border)" }}>
                  {CAPABILITY_GRID.map((item, i) => <CapabilityCell key={i} item={item} i={i} />)}
                </div>
              </section>

              {/* ── FAQ ──────────────────────────────────────────────────── */}
              <section style={{ borderTop: "1px solid var(--border)", maxWidth: "1400px", margin: "0 auto", padding: "96px 0 0" }}>
                <FadeUp style={{ padding: "0 32px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>FAQ</span>
                    <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                  </div>
                </FadeUp>
                <FadeUp delay={0.08} style={{ padding: "0 32px" }}>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem,4.2vw,3.75rem)", letterSpacing: "-0.04em", lineHeight: 1.02, color: "var(--text-primary)", fontWeight: 400, marginBottom: "56px", maxWidth: "900px" }}>
                    Frequently asked questions.
                  </h2>
                </FadeUp>
                <div>
                  {FAQ_ITEMS.map((item, i) => <FAQRow key={i} item={item} />)}
                  <div style={{ borderTop: "1px solid var(--border)", height: "0" }} />
                </div>
              </section>

              <section style={{ borderTop: "1px solid var(--border)", padding: "120px 32px", textAlign: "center", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 80% at 50% 100%, rgba(37,99,235,0.07) 0%, transparent 60%)", pointerEvents: "none" }} />
                <FadeUp>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)", display: "block", marginBottom: "32px" }}>Ready when you are</span>
                </FadeUp>
                <FadeUp delay={0.1}>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.5rem,7vw,6.5rem)", letterSpacing: "-0.05em", lineHeight: 0.92, color: "var(--text-primary)", fontWeight: 400, marginBottom: "40px", position: "relative", zIndex: 1 }}>
                    Stop guessing.<br /><span style={{ color: "var(--text-secondary)" }}>Start knowing.</span>
                  </h2>
                </FadeUp>
                <FadeUp delay={0.16}>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: "clamp(15px,1.3vw,17px)", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: "640px", margin: "0 auto 44px", position: "relative", zIndex: 1 }}>
                    Ready to revolutionise your marketing strategy? Join hundreds of successful marketers who&rsquo;ve already discovered the power of our AI marketing lab. Start your free trial today and see the difference intelligent automation can make to your campaigns.
                  </p>
                </FadeUp>
                <FadeUp delay={0.22}>
                  <Link href="/auth/signup" style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-body)", fontSize: "15px", fontWeight: 500, color: "#fff", background: "var(--brand)", textDecoration: "none", padding: "15px 36px", borderRadius: "100px", transition: "opacity 0.16s", position: "relative", zIndex: 1 }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
                  >Start your free trial <ArrowUpRight size={15} /></Link>
                </FadeUp>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
