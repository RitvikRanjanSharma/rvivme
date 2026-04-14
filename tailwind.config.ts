import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      // ── Dynamic brand color (resolved from CSS variable at runtime) ─────────
      // Usage: bg-brand, text-brand, border-brand, shadow-brand
      colors: {
        brand: {
          DEFAULT:   "var(--brand)",
          50:        "color-mix(in srgb, var(--brand) 10%, transparent)",
          100:       "color-mix(in srgb, var(--brand) 20%, transparent)",
          200:       "color-mix(in srgb, var(--brand) 35%, transparent)",
          300:       "color-mix(in srgb, var(--brand) 50%, transparent)",
          400:       "color-mix(in srgb, var(--brand) 65%, transparent)",
          500:       "var(--brand)",
          600:       "color-mix(in srgb, var(--brand) 85%, #000)",
          700:       "color-mix(in srgb, var(--brand) 70%, #000)",
          glow:      "var(--brand-glow)",
        },
        // ── Obsidian scale ─────────────────────────────────────────────────
        obsidian: {
          base:    "#050505",
          surface: "#0a0a0a",
          raised:  "#0f0f0f",
          card:    "#111111",
          border:  "#1a1a1a",
          muted:   "#222222",
          subtle:  "#2a2a2a",
        },
        // ── Light mode scale ───────────────────────────────────────────────
        slate: {
          base:    "#f8f8f8",
          surface: "#ffffff",
          raised:  "#f3f3f3",
          card:    "#ececec",
          border:  "#e2e2e2",
          muted:   "#d0d0d0",
        },
        ink: {
          primary:   "#f0f0f0",
          secondary: "#a0a0a0",
          tertiary:  "#525252",
          "light-primary":   "#0a0a0a",
          "light-secondary": "#444444",
          "light-tertiary":  "#888888",
        },
        signal: {
          green:  "#00e676",
          amber:  "#ffab00",
          red:    "#ff1744",
          blue:   "#2979ff",
        },
      },

      // ── Typography ─────────────────────────────────────────────────────────
      fontFamily: {
        display: ["Syne",    "system-ui", "sans-serif"],
        mono:    ["DM Mono", "ui-monospace", "monospace"],
        body:    ["Inter",   "system-ui",   "sans-serif"],
      },

      fontSize: {
        "d-2xl": ["5rem",   { lineHeight: "0.92", letterSpacing: "-0.045em", fontWeight: "800" }],
        "d-xl":  ["3.5rem", { lineHeight: "0.95", letterSpacing: "-0.04em",  fontWeight: "800" }],
        "d-lg":  ["2.5rem", { lineHeight: "1.0",  letterSpacing: "-0.035em", fontWeight: "700" }],
        "d-md":  ["1.875rem",{ lineHeight: "1.1", letterSpacing: "-0.03em",  fontWeight: "700" }],
        "d-sm":  ["1.5rem", { lineHeight: "1.15", letterSpacing: "-0.025em", fontWeight: "600" }],
      },

      // ── Spacing extras ─────────────────────────────────────────────────────
      spacing: {
        "13": "3.25rem",
        "15": "3.75rem",
        "18": "4.5rem",
        "22": "5.5rem",
      },

      // ── Border radius ──────────────────────────────────────────────────────
      borderRadius: {
        "3xl": "1.25rem",
        "4xl": "1.75rem",
      },

      // ── Box shadows ────────────────────────────────────────────────────────
      boxShadow: {
        "brand-sm":  "0 0 10px var(--brand-glow)",
        "brand-md":  "0 0 22px var(--brand-glow)",
        "brand-lg":  "0 0 40px var(--brand-glow)",
        "card":      "0 1px 3px rgba(0,0,0,0.7), 0 4px 12px rgba(0,0,0,0.5)",
        "card-hover":"0 4px 20px rgba(0,0,0,0.8)",
      },

      // ── Background images ──────────────────────────────────────────────────
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, var(--brand) 0%, color-mix(in srgb, var(--brand) 60%, #000) 100%)",
        "brand-radial":
          "radial-gradient(ellipse at top, color-mix(in srgb, var(--brand) 15%, transparent), transparent 70%)",
        "grid-dark":
          "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
        "grid-light":
          "linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)",
      },

      backgroundSize: {
        grid: "40px 40px",
      },

      // ── Keyframes ──────────────────────────────────────────────────────────
      keyframes: {
        "brand-pulse": {
          "0%, 100%": { boxShadow: "0 0 12px var(--brand-glow)" },
          "50%":       { boxShadow: "0 0 28px var(--brand-glow)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
      },
      animation: {
        "brand-pulse": "brand-pulse 2.5s ease-in-out infinite",
        "slide-up":    "slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in":     "fade-in 0.4s ease both",
      },
    },
  },
  plugins: [],
};

export default config;
