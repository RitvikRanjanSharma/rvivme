"use client";

// app/ui/app-shell.tsx
// =============================================================================
// AI Marketing Lab — App Shell v3
// Implements the Claude Design handoff bundle:
//
//   * Marketing routes  → horizontal top nav, transparent at top, blurs on
//                         scroll. Pill CTAs per spec (11px 22px / radius 100).
//   * App routes        → compact 56px top bar (logo · workspace · live · bell
//                         · profile) + fixed 220px left sidebar with
//                         Intelligence / Admin sections and brand-tinted
//                         active state.
//   * Auth routes       → no chrome.
//
// Does not touch app/page.tsx — the particle intro is owned by that page and
// must remain untouched per product direction.
// =============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, Brain, ChevronDown, FileText, LayoutDashboard, LogOut, Moon,
  Newspaper, PenLine, Search, Settings, Sun, Target, User, Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// ─── Theme context ────────────────────────────────────────────────────────────
type ThemeMode = "dark" | "light";
type ThemeCtx  = {
  brandColor:    string;
  mode:          ThemeMode;
  setBrandColor: (v: string) => void;
  toggleMode:    () => void;
};
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

    // Cross-tab / external-writer sync: Settings page writes localStorage
    // directly, so we listen for storage events to keep the shell in sync.
    const onStorage = (e: StorageEvent) => {
      if (!e.newValue) return;
      if (e.key === "aiml-brand" || e.key === "rvivme-brand") setBrand(e.newValue);
      if ((e.key === "aiml-mode" || e.key === "rvivme-theme") &&
          (e.newValue === "dark" || e.newValue === "light")) {
        setMode(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
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

// ─── UserCacheGuard ───────────────────────────────────────────────────────────
// localStorage is scoped to the browser origin, not to the authenticated user.
// Without this component, a new account signing into the same browser would
// see the previous user's cached domain, brand colour, and content drafts —
// which is exactly the multi-tenancy leak we saw in production.
//
// Strategy: keep a pointer to the "last seen" user id in localStorage. On any
// auth change, compare against the current session's user id. If they differ
// (different account signed in, or signed out), wipe every aiml-*/rvivme-*
// key before the rest of the app hydrates.
// =============================================================================
const LAST_USER_KEY = "aiml-last-user-id";

function clearAimlKeys() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      // Keep the last-user pointer so we can tell if the *next* login needs a
      // wipe; everything else that's prefixed with our app namespaces goes.
      if (k === LAST_USER_KEY) continue;
      if (k.startsWith("aiml-") || k.startsWith("rvivme-")) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
    sessionStorage.clear();
  } catch {
    /* storage may be unavailable — nothing to do */
  }
}

function UserCacheGuard() {
  useEffect(() => {
    // Run once on mount to handle the "app just loaded and a new user is
    // already signed in" case.
    let cancelled = false;

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        const prev    = localStorage.getItem(LAST_USER_KEY);
        const current = user?.id ?? null;
        if (prev && current && prev !== current) clearAimlKeys();
        if (!current && prev) clearAimlKeys();
        if (current) localStorage.setItem(LAST_USER_KEY, current);
        else         localStorage.removeItem(LAST_USER_KEY);
      } catch {
        /* auth not configured — don't block the shell */
      }
    })();

    // Subscribe to subsequent auth events (sign-in, sign-out, token refresh).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const prev    = localStorage.getItem(LAST_USER_KEY);
      const current = session?.user?.id ?? null;
      if (prev && current && prev !== current) clearAimlKeys();
      if (!current && prev) clearAimlKeys();
      if (current) localStorage.setItem(LAST_USER_KEY, current);
      else         localStorage.removeItem(LAST_USER_KEY);
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  return null;
}

// ─── Route helpers ────────────────────────────────────────────────────────────
const isAppRoute  = (p: string) =>
  p.startsWith("/dashboard")   || p.startsWith("/keywords")   ||
  p.startsWith("/competitors") || p.startsWith("/settings")   ||
  p.startsWith("/strategies")  || p.startsWith("/content");
const isAuthRoute = (p: string) => p.startsWith("/auth");

// ─── Nav definitions ──────────────────────────────────────────────────────────
const PUBLIC_NAV = [
  { href: "/",     label: "Home" },
  { href: "/blog", label: "Blog" },
] as const;

const SIDEBAR_INTEL = [
  { href: "/dashboard",      label: "Dashboard",   icon: LayoutDashboard },
  { href: "/strategies",     label: "Strategies",  icon: Target          },
  { href: "/keywords",       label: "Keywords",    icon: Search          },
  { href: "/competitors",    label: "Competitors", icon: Users           },
  { href: "/content",        label: "Content",     icon: PenLine         },
  { href: "/dashboard/blog", label: "Blog admin",  icon: FileText        },
  { href: "/blog",           label: "Public blog", icon: Newspaper       },
] as const;
const SIDEBAR_ADMIN = [
  { href: "/settings",    label: "Settings",    icon: Settings        },
] as const;

// ─── Shared visual primitives ─────────────────────────────────────────────────
function LogoMark({ size = 32, brand }: { size?: number; brand: string }) {
  const inner = Math.round(size * 0.5);
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.25),
      background: brand, display: "flex", alignItems: "center",
      justifyContent: "center", flexShrink: 0,
    }}>
      <svg width={inner} height={inner} viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 7L26 25H6L16 7Z" fill="#fff" fillOpacity="0.92" />
      </svg>
    </div>
  );
}

function LiveDot({ label = "LIVE", color = "var(--signal-green)" }: { label?: string; color?: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "6px",
      fontFamily: "var(--font-mono)", fontSize: "10px",
      letterSpacing: "0.12em", textTransform: "uppercase", color,
    }}>
      <span style={{
        width: "6px", height: "6px", background: color,
        borderRadius: "50%", boxShadow: `0 0 6px ${color}`,
        animation: "pulse-dot 2.2s var(--ease-expo) infinite",
      }} />
      {label}
    </span>
  );
}

function IconButton({
  children, onClick, title,
}: { children: React.ReactNode; onClick?: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} style={{
      width: "32px", height: "32px", display: "flex", alignItems: "center",
      justifyContent: "center", background: "transparent",
      border: "1px solid var(--border)", borderRadius: "8px",
      cursor: "pointer", color: "var(--text-secondary)",
      transition: "border-color var(--dur-fast), color var(--dur-fast)",
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
        (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
      }}
    >
      {children}
    </button>
  );
}

// ─── Profile menu ─────────────────────────────────────────────────────────────
function ProfileMenu({ brandColor, compact = false }: { brandColor: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const avatarSize = compact ? 22 : 26;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: "flex", alignItems: "center", gap: "8px",
        background: "transparent", border: "1px solid var(--border-strong)",
        borderRadius: "100px", padding: compact ? "3px 10px 3px 3px" : "5px 12px 5px 5px",
        cursor: "pointer", color: "var(--text-primary)",
        transition: "border-color var(--dur-fast)",
      }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = brandColor}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)"}
      >
        <div style={{
          width: `${avatarSize}px`, height: `${avatarSize}px`, borderRadius: "50%",
          background: `linear-gradient(135deg, ${brandColor}, rgba(var(--brand-rgb),0.55))`,
          border: "1px solid var(--border-strong)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 500,
          color: "#fff", letterSpacing: "0.04em", flexShrink: 0,
        }}>AI</div>
        {!compact && (
          <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500 }}>
            Workspace
          </span>
        )}
        <ChevronDown size={12} style={{ opacity: 0.5 }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{    opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              width: "200px", background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: "12px", overflow: "hidden", zIndex: 200,
              boxShadow: "var(--shadow-card)",
            }}
          >
            {[
              { label: "Profile",  icon: User,    href: "/settings?tab=profile"  },
              { label: "Branding", icon: Settings, href: "/settings?tab=branding" },
              { label: "Sign out", icon: LogOut,   href: "/auth/signout", danger: true },
            ].map((item, i) => {
              const Icon = item.icon;
              const danger = (item as { danger?: boolean }).danger;
              return (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)} style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "11px 14px", fontFamily: "var(--font-body)", fontSize: "13px",
                  color: danger ? "var(--signal-red)" : "var(--text-secondary)",
                  textDecoration: "none",
                  borderTop: i > 0 ? "1px solid var(--border)" : "none",
                  transition: "background 0.12s, color 0.12s",
                }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = "var(--muted)";
                    if (!danger) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = danger ? "var(--signal-red)" : "var(--text-secondary)";
                  }}
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

// ─── Marketing header ─────────────────────────────────────────────────────────
function MarketingHeader() {
  const pathname = usePathname();
  const { brandColor, mode, toggleMode } = useTheme();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      height: "60px", display: "flex", alignItems: "center",
      justifyContent: "space-between", padding: "0 32px",
      background:      scrolled ? "var(--nav-bg)"                    : "transparent",
      backdropFilter:  scrolled ? "blur(20px) saturate(180%)"        : "none",
      WebkitBackdropFilter: scrolled ? "blur(20px) saturate(180%)"   : "none",
      borderBottom:    scrolled ? "1px solid var(--border)"          : "1px solid transparent",
      transition: "background var(--dur-base), border-color var(--dur-base), backdrop-filter var(--dur-base)",
    }}>
      <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}>
        <LogoMark size={32} brand={brandColor} />
        <span style={{
          fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 600,
          color: "var(--text-primary)", letterSpacing: "-0.01em",
        }}>AI Marketing Lab</span>
      </Link>

      <nav style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        {PUBLIC_NAV.map(({ href, label }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link key={href} href={href} style={{
              fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              textDecoration: "none", padding: "8px 14px", borderRadius: "8px",
              background: active ? "var(--muted)" : "transparent",
              transition: "color var(--dur-fast), background var(--dur-fast)",
            }}
              onMouseEnter={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                  (e.currentTarget as HTMLElement).style.background = "var(--muted)";
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }
              }}
            >{label}</Link>
          );
        })}
      </nav>

      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <IconButton onClick={toggleMode} title={mode === "dark" ? "Switch to light" : "Switch to dark"}>
          <AnimatePresence mode="wait">
            <motion.div key={mode}
              initial={{ opacity: 0, rotate: -20 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{    opacity: 0, rotate: 20 }}
              transition={{ duration: 0.15 }}
            >
              {mode === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </motion.div>
          </AnimatePresence>
        </IconButton>
        <Link href="/auth/login" style={{
          fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
          color: "var(--text-secondary)", textDecoration: "none",
          padding: "11px 22px", borderRadius: "100px",
          border: "1px solid var(--border)",
          transition: "color var(--dur-fast), border-color var(--dur-fast)",
        }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
          }}
        >Sign in</Link>
        <Link href="/dashboard" style={{
          fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
          color: "#fff", background: brandColor, textDecoration: "none",
          padding: "11px 22px", borderRadius: "100px",
          boxShadow: "0 0 22px var(--brand-glow)",
          transition: "opacity var(--dur-fast)",
        }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
        >Get started</Link>
      </div>
    </header>
  );
}

// ─── App header ───────────────────────────────────────────────────────────────
function AppHeader({ workspaceDomain }: { workspaceDomain: string }) {
  const { brandColor, mode, toggleMode } = useTheme();

  return (
    <header style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      height: "56px", display: "flex", alignItems: "center",
      justifyContent: "space-between", padding: "0 20px",
      background: "var(--nav-bg)",
      backdropFilter: "blur(16px) saturate(160%)",
      WebkitBackdropFilter: "blur(16px) saturate(160%)",
      borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
        <Link href="/dashboard" style={{
          textDecoration: "none", display: "flex", alignItems: "center", gap: "10px",
        }}>
          <LogoMark size={26} brand={brandColor} />
          <span style={{
            fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 600,
            color: "var(--text-primary)", letterSpacing: "-0.01em",
          }}>AI Marketing Lab</span>
        </Link>
        <span aria-hidden="true" style={{
          width: "1px", height: "18px",
          background: "var(--border-strong)", margin: "0 4px",
        }} />
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: "10px",
          letterSpacing: "0.12em", textTransform: "uppercase",
          color: "var(--text-secondary)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          Workspace · {workspaceDomain}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <LiveDot label="LIVE" />
        <IconButton onClick={toggleMode} title={mode === "dark" ? "Switch to light" : "Switch to dark"}>
          <AnimatePresence mode="wait">
            <motion.div key={mode}
              initial={{ opacity: 0, rotate: -20 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{    opacity: 0, rotate: 20 }}
              transition={{ duration: 0.15 }}
            >
              {mode === "dark" ? <Sun size={13} /> : <Moon size={13} />}
            </motion.div>
          </AnimatePresence>
        </IconButton>
        <IconButton title="Notifications">
          <Bell size={13} />
        </IconButton>
        <ProfileMenu brandColor={brandColor} compact />
      </div>
    </header>
  );
}

// ─── App sidebar ──────────────────────────────────────────────────────────────
function AppSidebar() {
  const pathname = usePathname();
  const { brandColor } = useTheme();

  const renderItem = (
    item: { href: string; label: string; icon: React.ComponentType<{ size?: number; color?: string }> },
  ) => {
    const active = item.href === "/dashboard"
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "9px 12px", borderRadius: "8px",
        background: active ? "rgba(var(--brand-rgb), 0.12)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
        textDecoration: "none",
        transition: "background var(--dur-fast), color var(--dur-fast)",
      }}
        onMouseEnter={e => {
          if (!active) {
            (e.currentTarget as HTMLElement).style.background = "var(--muted)";
            (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
          }
        }}
        onMouseLeave={e => {
          if (!active) {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
          }
        }}
      >
        <Icon size={14} color={active ? brandColor : "currentColor"} />
        <span>{item.label}</span>
        {active && (
          <span aria-hidden="true" style={{
            marginLeft: "auto", width: "4px", height: "4px", borderRadius: "50%",
            background: brandColor, boxShadow: `0 0 6px ${brandColor}`,
          }} />
        )}
      </Link>
    );
  };

  return (
    <aside className="aiml-sidebar" style={{
      position: "fixed", top: "56px", left: 0, bottom: 0, width: "220px",
      background: "var(--bg)", borderRight: "1px solid var(--border)",
      padding: "22px 14px", display: "flex", flexDirection: "column",
      gap: "2px", zIndex: 50, overflowY: "auto",
    }}>
      <span style={{
        padding: "0 12px 12px", fontFamily: "var(--font-mono)",
        fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase",
        color: "var(--text-tertiary)",
      }}>Intelligence</span>
      {SIDEBAR_INTEL.map(renderItem)}

      <div style={{
        height: "1px", background: "var(--border)", margin: "14px 8px",
      }} />

      <span style={{
        padding: "0 12px 10px", fontFamily: "var(--font-mono)",
        fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase",
        color: "var(--text-tertiary)",
      }}>Admin</span>
      {SIDEBAR_ADMIN.map(renderItem)}

      <div style={{ marginTop: "auto", paddingTop: "20px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "0 12px", fontFamily: "var(--font-mono)", fontSize: "10px",
          letterSpacing: "0.12em", textTransform: "uppercase",
          color: "var(--text-tertiary)",
        }}>
          <Brain size={11} /> v1.0 · UK
        </div>
      </div>
    </aside>
  );
}

// ─── Footer (marketing only) ──────────────────────────────────────────────────
function Footer() {
  const pathname = usePathname();
  if (isAuthRoute(pathname) || isAppRoute(pathname)) return null;

  return (
    <footer style={{
      borderTop: "1px solid var(--border)", padding: "28px 32px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      flexWrap: "wrap", gap: "16px",
    }}>
      <span style={{
        fontFamily: "var(--font-body)", fontSize: "13px",
        color: "var(--text-tertiary)",
      }}>
        © {new Date().getFullYear()} AI Marketing Lab · Welwyn Garden City, UK
      </span>
      <div style={{ display: "flex", gap: "24px" }}>
        {[
          { href: "/blog",       label: "Blog"      },
          { href: "/dashboard",  label: "Dashboard" },
          { href: "/auth/login", label: "Sign in"   },
        ].map(({ href, label }) => (
          <Link key={href} href={href} style={{
            fontFamily: "var(--font-body)", fontSize: "13px",
            color: "var(--text-tertiary)", textDecoration: "none",
            transition: "color var(--dur-fast)",
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"}
          >{label}</Link>
        ))}
      </div>
    </footer>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────
// Per design: marketing = horizontal nav; app = top bar + left sidebar.
// Inline <style> scopes the 1024px breakpoint — below that the sidebar collapses
// and the main column reclaims the full width so tables stay readable.
const SHELL_RESPONSIVE_CSS = `
@media (max-width: 1024px) {
  .aiml-sidebar { display: none; }
  .aiml-main-app { padding-left: 0 !important; }
}
`;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth   = isAuthRoute(pathname);
  const isApp    = isAppRoute(pathname);

  const workspaceDomain =
    process.env.NEXT_PUBLIC_SITE_DOMAIN?.trim() || "aimarketinglab.co.uk";

  if (isAuth) {
    // Auth pages render without chrome — they manage their own layout.
    // We still mount the cache guard so the sign-in page clears any stale
    // data from a previous tenant before the dashboard ever loads.
    return (
      <ThemeProvider>
        <UserCacheGuard />
        {children}
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <UserCacheGuard />
      <style dangerouslySetInnerHTML={{ __html: SHELL_RESPONSIVE_CSS }} />
      {isApp ? (
        <>
          <AppHeader workspaceDomain={workspaceDomain} />
          <AppSidebar />
          <main className="aiml-main-app" style={{
            paddingTop:  "56px",
            paddingLeft: "220px",
            minHeight:   "100vh",
            background:  "var(--bg)",
          }}>
            {children}
          </main>
        </>
      ) : (
        <>
          <MarketingHeader />
          <main style={{ paddingTop: "60px", minHeight: "100vh" }}>
            {children}
          </main>
          <Footer />
        </>
      )}
    </ThemeProvider>
  );
}
