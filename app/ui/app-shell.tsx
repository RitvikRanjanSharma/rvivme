"use client";

// app/ui/app-shell.tsx
// =============================================================================
// AI Marketing Lab — App Shell v2
// Fixed: nav routing, settings link, profile menu on all app routes
// =============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext, useContext, useEffect, useMemo, useState, useRef,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LogOut, Settings, User, ChevronDown, Sun, Moon,
  Home, LayoutDashboard, Search, Users,
} from "lucide-react";

// ─── Theme context ────────────────────────────────────────────────────────────
type ThemeMode = "dark" | "light";
type ThemeCtx  = { brandColor: string; mode: ThemeMode; setBrandColor: (v: string) => void; toggleMode: () => void; };
const ThemeContext = createContext<ThemeCtx | null>(null);

function hexToRgb(hex: string) {
  const c = hex.replace("#", "");
  return `${parseInt(c.slice(0,2),16)}, ${parseInt(c.slice(2,4),16)}, ${parseInt(c.slice(4,6),16)}`;
}
function applyTheme(mode: ThemeMode, brand: string) {
  const r = document.documentElement;
  r.classList.toggle("light", mode === "light");
  r.classList.toggle("dark",  mode === "dark");
  r.style.setProperty("--brand",      brand);
  r.style.setProperty("--brand-rgb",  hexToRgb(brand));
  r.style.setProperty("--brand-glow", `rgba(${hexToRgb(brand)}, 0.20)`);
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode,  setMode]  = useState<ThemeMode>("dark");
  const [brand, setBrand] = useState("#2563eb");

  useEffect(() => {
    const m = (localStorage.getItem("aiml-mode") || localStorage.getItem("rvivme-theme")) as ThemeMode | null;
    const b = localStorage.getItem("aiml-brand") || localStorage.getItem("rvivme-brand");
    if (m === "light" || m === "dark") setMode(m);
    if (b) setBrand(b);
  }, []);

  useEffect(() => {
    applyTheme(mode, brand);
    localStorage.setItem("aiml-mode",    mode);
    localStorage.setItem("aiml-brand",   brand);
    localStorage.setItem("rvivme-theme", mode);
    localStorage.setItem("rvivme-brand", brand);
  }, [mode, brand]);

  const value = useMemo<ThemeCtx>(() => ({
    brandColor:    brand,
    mode,
    setBrandColor: setBrand,
    toggleMode:    () => setMode(m => m === "dark" ? "light" : "dark"),
  }), [brand, mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be within ThemeProvider");
  return ctx;
}

// ─── Nav definitions ──────────────────────────────────────────────────────────
const PUBLIC_NAV = [
  { href: "/",     label: "Home" },
  { href: "/blog", label: "Blog" },
] as const;

const APP_NAV = [
  { href: "/",            label: "Home",        icon: Home             },
  { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard  },
  { href: "/keywords",    label: "Keywords",    icon: Search           },
  { href: "/competitors", label: "Competitors", icon: Users            },
] as const;

// ─── Profile menu ─────────────────────────────────────────────────────────────
function ProfileMenu({ brandColor }: { brandColor: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: "flex", alignItems: "center", gap: "8px",
        background: "transparent", border: "1px solid var(--border-strong)",
        borderRadius: "100px", padding: "5px 12px 5px 5px",
        cursor: "pointer", color: "var(--text-primary)", transition: "border-color 0.2s",
      }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = brandColor}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)"}
      >
        <div style={{
          width: "26px", height: "26px", borderRadius: "50%", background: brandColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 500,
          color: "#fff", letterSpacing: "0.04em", flexShrink: 0,
        }}>AI</div>
        <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500 }}>Workspace</span>
        <ChevronDown size={12} style={{ opacity: 0.5 }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{   opacity: 0, y: -8,  scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              width: "190px", background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: "12px", overflow: "hidden", zIndex: 200,
            }}
          >
            {[
              { label: "Profile",  icon: User,    href: "/settings?tab=profile"  },
              { label: "Branding", icon: Settings, href: "/settings?tab=branding" },
              { label: "Sign out", icon: LogOut,   href: "/auth/signout", danger: true },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)} style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "11px 14px", fontFamily: "var(--font-body)", fontSize: "13px",
                  color: (item as any).danger ? "var(--signal-red)" : "var(--text-secondary)",
                  textDecoration: "none", borderTop: i > 0 ? "1px solid var(--border)" : "none",
                  transition: "background 0.12s, color 0.12s",
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--muted)"; if (!(item as any).danger) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = (item as any).danger ? "var(--signal-red)" : "var(--text-secondary)"; }}
                >
                  <Icon size={13} />{item.label}
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header() {
  const pathname = usePathname();
  const { brandColor, mode, toggleMode } = useTheme();
  const [scrolled, setScrolled] = useState(false);

  const isAuth = pathname.startsWith("/auth");
  const isApp  = pathname.startsWith("/dashboard") || pathname.startsWith("/keywords") ||
                 pathname.startsWith("/competitors") || pathname.startsWith("/settings");

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  if (isAuth) return null;

  return (
    <header style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      height: "60px", display: "flex", alignItems: "center",
      justifyContent: "space-between", padding: "0 32px",
      background:     scrolled ? "var(--nav-bg)"   : "transparent",
      backdropFilter: scrolled ? "blur(20px) saturate(160%)" : "none",
      borderBottom:   scrolled ? "1px solid var(--border)" : "1px solid transparent",
      transition: "background 0.4s, border-color 0.4s",
    }}>

      {/* Logo */}
      <Link href={isApp ? "/dashboard" : "/"} style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{
          width: "32px", height: "32px", borderRadius: "8px", background: brandColor,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          transition: "opacity 0.16s",
        }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L14 12H2L8 2Z" fill="white" fillOpacity="0.9"/>
          </svg>
        </div>
        <span style={{ fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
          AI Marketing Lab
        </span>
      </Link>

      {/* Nav links */}
      <nav style={{ display: "flex", alignItems: "center" }}>
        {isApp
          ? APP_NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/"
                ? pathname === "/"
                : pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
              return (
                <Link key={href} href={href} style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  textDecoration: "none", padding: "8px 12px", borderRadius: "8px",
                  transition: "color 0.16s, background 0.16s",
                  background: active ? "var(--muted)" : "transparent",
                }}
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLElement).style.background = "var(--muted)"; } }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.background = "transparent"; } }}
                >
                  <Icon size={13} />{label}
                </Link>
              );
            })
          : PUBLIC_NAV.map(({ href, label }) => {
              const active = pathname === href || (href !== "/" && pathname.startsWith(href));
              return (
                <Link key={href} href={href} style={{
                  fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  textDecoration: "none", padding: "8px 14px", borderRadius: "8px",
                  transition: "color 0.16s, background 0.16s",
                  background: active ? "var(--muted)" : "transparent",
                }}
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLElement).style.background = "var(--muted)"; } }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.background = "transparent"; } }}
                >
                  {label}
                </Link>
              );
            })
        }
      </nav>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button onClick={toggleMode} style={{
          width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center",
          background: "transparent", border: "1px solid var(--border)", borderRadius: "8px",
          cursor: "pointer", color: "var(--text-secondary)", transition: "border-color 0.16s, color 0.16s",
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
        >
          <AnimatePresence mode="wait">
            <motion.div key={mode} initial={{ opacity: 0, rotate: -20 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 20 }} transition={{ duration: 0.15 }}>
              {mode === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </motion.div>
          </AnimatePresence>
        </button>

        {isApp ? (
          <ProfileMenu brandColor={brandColor} />
        ) : (
          <div style={{ display: "flex", gap: "8px" }}>
            <Link href="/auth/login" style={{
              fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
              color: "var(--text-secondary)", textDecoration: "none",
              padding: "8px 16px", borderRadius: "100px", border: "1px solid var(--border)",
              transition: "color 0.16s, border-color 0.16s",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
            >
              Sign in
            </Link>
            <Link href="/dashboard" style={{
              fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
              color: "#fff", background: brandColor, textDecoration: "none",
              padding: "8px 18px", borderRadius: "100px", transition: "opacity 0.16s",
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
            >
              Dashboard
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  const pathname = usePathname();
  const isAuth = pathname.startsWith("/auth");
  const isApp  = pathname.startsWith("/dashboard") || pathname.startsWith("/keywords") ||
                 pathname.startsWith("/competitors") || pathname.startsWith("/settings");
  if (isAuth || isApp) return null;

  return (
    <footer style={{
      borderTop: "1px solid var(--border)", padding: "28px 32px",
      display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px",
    }}>
      <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-tertiary)" }}>
        © {new Date().getFullYear()} AI Marketing Lab · Welwyn Garden City, UK
      </span>
      <div style={{ display: "flex", gap: "24px" }}>
        {[{ href: "/blog", label: "Blog" }, { href: "/dashboard", label: "Dashboard" }, { href: "/auth/login", label: "Sign in" }].map(({ href, label }) => (
          <Link key={href} href={href} style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-tertiary)", textDecoration: "none", transition: "color 0.16s" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"}
          >{label}</Link>
        ))}
      </div>
    </footer>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth   = pathname.startsWith("/auth");
  return (
    <ThemeProvider>
      <Header />
      <main style={{ paddingTop: isAuth ? "0" : "60px", minHeight: "100vh" }}>
        {children}
      </main>
      <Footer />
    </ThemeProvider>
  );
}
