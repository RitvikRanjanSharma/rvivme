"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Bell,
  ChevronDown,
  FileText,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
  User,
  Users,
  Zap,
} from "lucide-react";

type ThemeMode = "dark" | "light";

type ThemeContextValue = {
  brandColor: string;
  mode: ThemeMode;
  setBrandColor: (value: string) => void;
  toggleMode: () => void;
};

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Zap },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/keywords", label: "Keywords", icon: Search },
  { href: "/competitors", label: "Competitors", icon: Users },
  { href: "/blog", label: "Blog", icon: FileText },
] as const;

const ThemeContext = createContext<ThemeContextValue | null>(null);
const DEFAULT_THEME_MODE: ThemeMode = "dark";
const DEFAULT_BRAND_COLOR = "#2563eb";

function hexToRgb(hex: string) {
  const cleaned = hex.replace("#", "");
  const normalized = cleaned.length === 6 ? cleaned : "2563eb";
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function applyTheme(mode: ThemeMode, brandColor: string) {
  const root = document.documentElement;
  root.classList.toggle("light", mode === "light");
  root.classList.toggle("dark", mode === "dark");
  root.style.setProperty("--brand", brandColor);
  root.style.setProperty("--brand-rgb", hexToRgb(brandColor));
  root.style.setProperty("--brand-glow", `rgba(${hexToRgb(brandColor)}, 0.28)`);
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [brandColor, setBrandColorState] = useState<string>(DEFAULT_BRAND_COLOR);

  useEffect(() => {
    const storedMode = window.localStorage.getItem("rvivme-theme");
    const storedBrandColor = window.localStorage.getItem("rvivme-brand");

    if (storedMode === "light" || storedMode === "dark") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode(storedMode);
    }

    if (storedBrandColor) {
      setBrandColorState(storedBrandColor);
    }
  }, []);

  useEffect(() => {
    applyTheme(mode, brandColor);
    window.localStorage.setItem("rvivme-theme", mode);
    window.localStorage.setItem("rvivme-brand", brandColor);
  }, [brandColor, mode]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "rvivme-brand" && event.newValue) {
        setBrandColorState(event.newValue);
      }

      if (event.key === "rvivme-theme" && event.newValue) {
        setMode(event.newValue === "light" ? "light" : "dark");
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      brandColor,
      mode,
      setBrandColor: setBrandColorState,
      toggleMode: () => setMode((current) => (current === "dark" ? "light" : "dark")),
    }),
    [brandColor, mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}

function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const { brandColor } = useTheme();

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        style={{
          alignItems: "center",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "999px",
          color: "var(--text-primary)",
          cursor: "pointer",
          display: "flex",
          gap: "10px",
          padding: "6px 10px 6px 6px",
        }}
      >
        <span
          style={{
            alignItems: "center",
            background: `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 65%, #081018))`,
            borderRadius: "50%",
            color: "#ffffff",
            display: "inline-flex",
            fontFamily: "var(--font-display)",
            fontSize: "0.8rem",
            fontWeight: 700,
            height: "32px",
            justifyContent: "center",
            width: "32px",
          }}
        >
          RV
        </span>
        <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>Workspace</span>
        <ChevronDown size={16} />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            initial={{ opacity: 0, scale: 0.98, y: -6 }}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
              boxShadow: "0 16px 40px rgba(0, 0, 0, 0.22)",
              padding: "8px",
              position: "absolute",
              right: 0,
              top: "calc(100% + 10px)",
              width: "200px",
              zIndex: 30,
            }}
          >
            {[
              { href: "/settings?tab=profile", icon: User, label: "Profile" },
              { href: "/settings?tab=branding", icon: Settings, label: "Branding" },
              { href: "/auth/signout", icon: LogOut, label: "Sign out" },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  style={{
                    alignItems: "center",
                    borderRadius: "12px",
                    color: "var(--text-secondary)",
                    display: "flex",
                    gap: "10px",
                    padding: "10px 12px",
                    textDecoration: "none",
                  }}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Header() {
  const pathname = usePathname();
  const { brandColor, mode, toggleMode } = useTheme();
  const isAuthRoute = pathname.startsWith("/auth");

  if (isAuthRoute) {
    return null;
  }

  return (
    <header
      style={{
        backdropFilter: "blur(18px)",
        background: "color-mix(in srgb, var(--bg) 84%, transparent)",
        borderBottom: "1px solid var(--border)",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: "20px",
          justifyContent: "space-between",
          margin: "0 auto",
          maxWidth: "1280px",
          padding: "16px 24px",
        }}
      >
        <Link
          href="/"
          style={{ alignItems: "center", color: "inherit", display: "flex", gap: "12px", textDecoration: "none" }}
        >
          <span
            style={{
              alignItems: "center",
              background: `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 70%, #081018))`,
              borderRadius: "16px",
              boxShadow: "0 0 28px var(--brand-glow)",
              color: "#ffffff",
              display: "inline-flex",
              height: "42px",
              justifyContent: "center",
              width: "42px",
            }}
          >
            <Zap size={20} />
          </span>
          <span>
            <span
              style={{
                display: "block",
                fontFamily: "var(--font-display)",
                fontSize: "1.15rem",
                fontWeight: 800,
                letterSpacing: "-0.04em",
              }}
            >
              Rvivme
            </span>
            <span style={{ color: "var(--text-secondary)", display: "block", fontSize: "0.8rem" }}>
              AI marketing intelligence
            </span>
          </span>
        </Link>

        <nav style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center" }}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  alignItems: "center",
                  background: active ? "rgba(var(--brand-rgb), 0.12)" : "transparent",
                  border: active ? "1px solid rgba(var(--brand-rgb), 0.24)" : "1px solid transparent",
                  borderRadius: "999px",
                  color: active ? brandColor : "var(--text-secondary)",
                  display: "flex",
                  gap: "8px",
                  padding: "10px 14px",
                  textDecoration: "none",
                }}
              >
                <Icon size={14} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div style={{ alignItems: "center", display: "flex", gap: "10px" }}>
          <button
            type="button"
            style={{
              alignItems: "center",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "999px",
              color: "var(--text-secondary)",
              display: "inline-flex",
              height: "40px",
              justifyContent: "center",
              width: "40px",
            }}
          >
            <Bell size={16} />
          </button>

          <button
            type="button"
            onClick={toggleMode}
            style={{
              alignItems: "center",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "999px",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "inline-flex",
              height: "40px",
              justifyContent: "center",
              width: "40px",
            }}
          >
            {mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const pathname = usePathname();

  if (pathname.startsWith("/auth")) {
    return null;
  }

  return (
    <footer style={{ borderTop: "1px solid var(--border)", marginTop: "48px" }}>
      <div
        style={{
          alignItems: "center",
          color: "var(--text-secondary)",
          display: "flex",
          flexWrap: "wrap",
          gap: "16px",
          justifyContent: "space-between",
          margin: "0 auto",
          maxWidth: "1280px",
          padding: "20px 24px 36px",
        }}
      >
        <p style={{ margin: 0 }}>Built for modern SEO, GEO, and AI-assisted growth teams.</p>
        <div style={{ display: "flex", gap: "14px" }}>
          <Link href="/blog" style={{ color: "inherit", textDecoration: "none" }}>
            Insights
          </Link>
          <Link href="/settings" style={{ color: "inherit", textDecoration: "none" }}>
            Settings
          </Link>
        </div>
      </div>
    </footer>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/auth");

  return (
    <ThemeProvider>
      <Header />
      <main style={{ minHeight: isAuthRoute ? "100vh" : "calc(100vh - 81px)" }}>{children}</main>
      <Footer />
    </ThemeProvider>
  );
}
