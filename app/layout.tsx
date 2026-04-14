"use client";

// app/layout.tsx
// =============================================================================
// AI Marketing Labs — Root Layout & Dynamic Theming Engine
// Reads --brand CSS variable from user profile; injects into document root.
// Dark / light mode toggle persisted in localStorage + applied via .dark class.
// =============================================================================

import type { Metadata } from "next";
import { Syne, DM_Mono, Inter } from "next/font/google";
import Link from "next/link";
import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, usePathname } from "next/navigation";
import {
  Zap, Sun, Moon, Bell, ChevronDown, Settings,
  LogOut, User, BarChart3, Search, Cpu, FileText,
} from "lucide-react";
import "./globals.css";

// ── Fonts ─────────────────────────────────────────────────────────────────────
const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

// ── Theme context ─────────────────────────────────────────────────────────────
type ThemeContextValue = {
  mode: "dark" | "light";
  toggleMode: () => void;
  brandColor: string;
  setBrandColor: (hex: string) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: "dark",
  toggleMode: () => {},
  brandColor: "#3b82f6",
  setBrandColor: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

// ── CSS variable injector ─────────────────────────────────────────────────────
function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function injectBrandVars(hex: string) {
  const root = document.documentElement;
  root.style.setProperty("--brand", hex);
  root.style.setProperty("--brand-rgb", hexToRgb(hex));
  root.style.setProperty("--brand-glow", `rgba(${hexToRgb(hex)}, 0.30)`);
}

// ── Nav items ─────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { label: "Dashboard",   href: "/dashboard",       icon: BarChart3 },
  { label: "Keywords",    href: "/keywords",         icon: Search    },
  { label: "Competitors", href: "/competitors",      icon: Cpu       },
  { label: "Blog",        href: "/blog",             icon: FileText  },
] as const;

// ── Profile dropdown ──────────────────────────────────────────────────────────
function ProfileDropdown({ brandColor }: { brandColor: string }) {
  const [open, setOpen] = useState(false);
  const items = [
  { label: "Account",     icon: User,    href: "/settings?tab=profile"  },
  { label: "Preferences", icon: Settings,href: "/settings?tab=branding" },
  { label: "Sign out",    icon: LogOut,  href: "/auth/signout", danger: true },
  ];
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        "8px",
          background: "transparent",
          border:     "1px solid var(--border)",
          borderRadius: "8px",
          padding:    "6px 12px",
          cursor:     "pointer",
          color:      "var(--text-primary)",
          fontFamily: "var(--font-inter), sans-serif",
          fontSize:   "13px",
          fontWeight: 500,
          transition: "border-color 0.2s",
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = brandColor)}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
      >
        <div style={{
          width:        "26px",
          height:       "26px",
          borderRadius: "6px",
          background:   `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 60%, #000))`,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          fontSize:     "11px",
          fontFamily:   "var(--font-syne), sans-serif",
          fontWeight:   700,
          color:        "#fff",
        }}>{"AI Marketing Labs"
          .split(" ")
          .map(w => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()}</div>
        <span style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          AI Marketing Labs
        </span>
        <ChevronDown size={13} style={{ opacity: 0.5, flexShrink: 0 }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="profile-dd"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{   opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{
              position:     "absolute",
              top:          "calc(100% + 6px)",
              right:        0,
              width:        "180px",
              background:   "var(--surface)",
              border:       "1px solid var(--border)",
              borderRadius: "10px",
              overflow:     "hidden",
              zIndex:       100,
              boxShadow:    "0 12px 40px rgba(0,0,0,0.5)",
            }}
          >
            {items.map(({ label, icon: Icon, href, danger }, i) => (
              <Link
                key={label}
                href={href}
                onClick={() => setOpen(false)}
                style={{
                  display:    "flex",
                  alignItems: "center",
                  gap:        "8px",
                  padding:    "10px 14px",
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize:   "13px",
                  fontWeight: 500,
                  color:      danger ? "var(--signal-red)" : "var(--text-secondary)",
                  textDecoration: "none",
                  borderTop:  i > 0 ? "1px solid var(--border)" : "none",
                  transition: "background 0.15s, color 0.15s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)";
                  if (!danger) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = danger ? "var(--signal-red)" : "var(--text-secondary)";
                }}
              >
                <Icon size={14} />
                {label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Theme provider + layout shell ─────────────────────────────────────────────
function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const [brandColor, setBrandColorState] = useState("#3b82f6");

  useEffect(() => {
    const stored = localStorage.getItem("rvivme-theme") as "dark" | "light" | null;
    const storedBrand = localStorage.getItem("rvivme-brand") ?? "#3b82f6";
    if (stored) setMode(stored);
    setBrandColorState(storedBrand);
    document.documentElement.classList.toggle("dark", (stored ?? "dark") === "dark");
    injectBrandVars(storedBrand);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(prev => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("rvivme-theme", next);
      document.documentElement.classList.toggle("dark", next === "dark");
      return next;
    });
  }, []);

  const setBrandColor = useCallback((hex: string) => {
    setBrandColorState(hex);
    localStorage.setItem("rvivme-brand", hex);
    injectBrandVars(hex);
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, toggleMode, brandColor, setBrandColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────
function Navbar() {
  const { mode, toggleMode, brandColor } = useTheme();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header
      style={{
        position:   "fixed",
        top:        0,
        left:       0,
        right:      0,
        zIndex:     50,
        height:     "56px",
        display:    "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding:    "0 24px",
        background: scrolled ? "var(--nav-bg)" : "transparent",
        backdropFilter: scrolled ? "blur(16px) saturate(180%)" : "none",
        borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
        transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Logo */}
      <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: "9px", textDecoration: "none" }}>
        <div style={{
          width: "30px", height: "30px",
          background: `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 55%, #000))`,
          borderRadius: "8px",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 14px var(--brand-glow)`,
        }}>
          <Zap size={15} color="#fff" strokeWidth={2.5} />
        </div>
        <span style={{
          fontFamily:    "var(--font-syne), sans-serif",
          fontSize:      "17px",
          fontWeight:    800,
          color:         "var(--text-primary)",
          letterSpacing: "-0.02em",
        }}>
          AI <span style={{ color: brandColor }}>Marketing</span> Labs
        </span>
      </Link>

      {/* Nav links */}
      <nav style={{ display: "flex", alignItems: "center", gap: "2px" }}>
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            style={{
              display:    "flex",
              alignItems: "center",
              gap:        "6px",
              fontFamily: "var(--font-inter), sans-serif",
              fontSize:   "13px",
              fontWeight: 500,
              color:      "var(--text-secondary)",
              padding:    "6px 12px",
              borderRadius: "7px",
              textDecoration: "none",
              transition: "color 0.18s, background 0.18s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            <Icon size={13} />
            {label}
          </Link>
        ))}
      </nav>

      {/* Right controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {/* Notifications */}
        <button
          style={{
            width: "32px", height: "32px",
            border: "1px solid var(--border)",
            borderRadius: "7px",
            background: "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            color: "var(--text-secondary)",
            transition: "border-color 0.18s, color 0.18s",
            position: "relative",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = brandColor;
            (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
          }}
        >
          <Bell size={14} />
          <div style={{
            position: "absolute", top: "6px", right: "6px",
            width: "6px", height: "6px", borderRadius: "50%",
            background: brandColor,
            boxShadow: `0 0 6px var(--brand-glow)`,
          }} />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleMode}
          title={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
          style={{
            width: "32px", height: "32px",
            border: "1px solid var(--border)",
            borderRadius: "7px",
            background: "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            color: "var(--text-secondary)",
            transition: "border-color 0.18s, color 0.18s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = brandColor;
            (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ rotate: -30, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{   rotate: 30, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {mode === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </motion.div>
          </AnimatePresence>
        </button>

        {/* Profile */}
        <ProfileDropdown brandColor={brandColor} />
      </div>
    </header>
  );
}

// ── Root layout export ────────────────────────────────────────────────────────
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname   = usePathname();
  const isAuthPage = pathname?.startsWith("/auth") ?? false;
  return (
    <html
      lang="en-GB"
      className={`dark ${syne.variable} ${dmMono.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        <title>AI Marketing Labs — GEO Intelligence Platform</title>
        <meta name="description" content="Next-generation SEO and Generative Engine Optimisation platform." />
        <meta name="theme-color" content="#050505" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>
        <ThemeProvider>
          <Navbar />
          <main style={{ paddingTop: "56px", minHeight: "100vh" }}>
            {children}
          </main>
          {!isAuthPage && (
            <footer
              style={{
                borderTop: "1px solid var(--border)",
                padding:   "24px",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize:   "13px",
                  color:      "var(--text-tertiary)",
                  margin:     0,
                }}
              >
                © {new Date().getFullYear()} AI Marketing Labs Ltd. All rights reserved. · Registered in England &amp; Wales
              </p>
            </footer>
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
