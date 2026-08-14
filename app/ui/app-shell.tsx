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
  AlertTriangle, Bell, Bot, Brain, ChevronDown, FileText, Flag, Gauge, LayoutDashboard,
  LogOut, MapPin, Menu, Moon, Newspaper, Search, Settings, Sun, Target,
  User, Users, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isAdminEmail } from "@/lib/admin";

// ─── Theme context ────────────────────────────────────────────────────────────
type ThemeMode = "dark" | "light";
type ThemeCtx  = {
  brandColor:    string;
  mode:          ThemeMode;
  setBrandColor: (v: string) => void;
  toggleMode:    () => void;
};
/** Luminous Copper. Exported so Settings' colour picker starts here too. */
export const BRAND_DEFAULT = "#B86D48";

const ThemeContext = createContext<ThemeCtx | null>(null);

function hexToRgb(hex: string) {
  const c = hex.replace("#", "");
  return `${parseInt(c.slice(0,2),16)}, ${parseInt(c.slice(2,4),16)}, ${parseInt(c.slice(4,6),16)}`;
}

/**
 * Shift a hex colour's lightness, keeping hue and saturation.
 *
 * Used to derive --brand-strong, the variant that carries white button text.
 * The brand colour is user-overridable, so this can't be a hardcoded second
 * hex: whatever colour someone picks, the button label still has to be legible
 * on it. Deepening on light backgrounds and lifting on dark keeps the contrast
 * moving in the useful direction in both themes.
 */
function shiftLightness(hex: string, delta: number): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0,2),16)/255, g = parseInt(c.slice(2,4),16)/255, b = parseInt(c.slice(4,6),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0; const l = (max+min)/2;
  if (max !== min) {
    const d = max-min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    h = max === r ? ((g-b)/d + (g<b ? 6 : 0)) : max === g ? ((b-r)/d + 2) : ((r-g)/d + 4);
    h /= 6;
  }
  const nl = Math.min(1, Math.max(0, l + delta));
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q-p)*6*t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q-p)*(2/3 - t)*6;
    return p;
  };
  const q = nl < 0.5 ? nl*(1+s) : nl + s - nl*s;
  const p = 2*nl - q;
  const to = (v: number) => Math.round(v*255).toString(16).padStart(2,"0");
  return `#${to(hue(p,q,h+1/3))}${to(hue(p,q,h))}${to(hue(p,q,h-1/3))}`;
}

function applyTheme(mode: ThemeMode, brand: string) {
  const r = document.documentElement;
  r.classList.toggle("light", mode === "light");
  r.classList.toggle("dark",  mode === "dark");
  r.style.setProperty("--brand",      brand);
  r.style.setProperty("--brand-rgb",  hexToRgb(brand));
  r.style.setProperty("--brand-glow", `rgba(${hexToRgb(brand)}, 0.20)`);
  // On linen we deepen so white labels stay readable; on teal we lift, because
  // deepening a mid-tone accent against a dark background does the opposite.
  r.style.setProperty("--brand-strong", shiftLightness(brand, mode === "light" ? -0.04 : 0.05));
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Light is the default. Must match both the :root CSS block and the
  // pre-paint script in layout.tsx, or the first frame disagrees with itself.
  const [mode,  setMode]  = useState<ThemeMode>("light");
  const [brand, setBrand] = useState(BRAND_DEFAULT);

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

// ─── Auth state hook ──────────────────────────────────────────────────────────
// Shared by MarketingHeader, AppSidebar and Footer so the three surfaces can't
// drift out of sync about whether someone is signed in.
//
// Returns { signedIn, isOperator }. Both start false so the first client render
// matches the server-rendered HTML exactly (the server has no session cookie
// access here) — resolving after mount avoids a hydration mismatch. The
// practical effect is a brief signed-out flash on first paint, which is the
// correct trade: rendering the signed-in state optimistically would break
// hydration for every logged-out visitor.
export function useAuthState() {
  const [signedIn,   setSignedIn]   = useState(false);
  const [isOperator, setIsOperator] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const apply = (email: string | null | undefined, present: boolean) => {
      if (cancelled) return;
      setSignedIn(present);
      setIsOperator(present && isAdminEmail(email));
    };

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        apply(user?.email, !!user);
      } catch {
        apply(null, false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      apply(session?.user?.email, !!session?.user);
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  return { signedIn, isOperator };
}

// ─── Route helpers ────────────────────────────────────────────────────────────
const isAppRoute  = (p: string) =>
  p.startsWith("/dashboard")   || p.startsWith("/keywords")   ||
  p.startsWith("/competitors") || p.startsWith("/settings")   ||
  p.startsWith("/strategies")  ||
  p.startsWith("/alerts")      || p.startsWith("/audit")      ||
  p.startsWith("/opportunities") || p.startsWith("/geo") || p.startsWith("/local") ||
  p.startsWith("/onboarding");
const isAuthRoute = (p: string) => p.startsWith("/auth");

// ─── Nav definitions ──────────────────────────────────────────────────────────
const PUBLIC_NAV = [
  { href: "/",          label: "Home"      },
  { href: "/blog",      label: "Blog"      },
  { href: "/portfolio", label: "Portfolio" },
] as const;

const SIDEBAR_INTEL = [
  { href: "/dashboard",      label: "Dashboard",   icon: LayoutDashboard },
  { href: "/opportunities",  label: "Opportunities", icon: Target        },
  { href: "/geo",            label: "Answer engines", icon: Bot          },
  { href: "/local",          label: "Local search", icon: MapPin         },
  { href: "/strategies",     label: "Strategies",  icon: Flag            },
  { href: "/keywords",       label: "Keywords",    icon: Search          },
  { href: "/competitors",    label: "Competitors", icon: Users           },
  { href: "/audit",          label: "Site audit",  icon: Gauge           },
  { href: "/alerts",         label: "Alerts",      icon: AlertTriangle   },
  { href: "/blog",           label: "Public blog", icon: Newspaper       },
] as const;
// SIDEBAR_ADMIN — visible to all signed-in users.
const SIDEBAR_ADMIN = [
  { href: "/settings",       label: "Settings",    icon: Settings        },
] as const;

// SIDEBAR_OPERATOR — only rendered for emails on the NEXT_PUBLIC_ADMIN_EMAILS
// allowlist. Blog publishing writes to the public AI Marketing Lab blog, so
// customers should never see this entry (previously it was hidden from every
// user, which meant even operators had to type the URL by hand).
const SIDEBAR_OPERATOR = [
  { href: "/dashboard/blog", label: "Blog admin",  icon: Newspaper       },
] as const;

// ─── Shared visual primitives ─────────────────────────────────────────────────
// Wordmark — replaces the old blue-tile-plus-triangle lockup. Rendered as real
// text rather than an SVG or image so it:
//   * uses the site's actual Inter face (no approximation, no extra request)
//   * inherits the theme via currentColor, so it stays legible in light mode
//     where a baked-in off-white would vanish
//   * stays crisp at any zoom / DPI and is selectable + readable by screen
//     readers without needing alt text
// Tracking is tightened to -0.04em to match the generated mark, where the
// letters sit noticeably closer than Inter's default.
function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span
      style={{
        fontFamily:    "var(--font-inter), Inter, system-ui, sans-serif",
        fontSize:      `${size}px`,
        fontWeight:    600,
        letterSpacing: "-0.04em",
        lineHeight:    1,
        color:         "var(--text-primary)",
        whiteSpace:    "nowrap",
        flexShrink:    0,
      }}
    >
      AIML
    </span>
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

// ─── Notification bell with unread badge ─────────────────────────────────────
// Polls /api/notifications every 60s for an unread count. Clicking navigates
// to /alerts where the user can mark items read. Cheap; we don't need a
// websocket for sub-minute resolution on a beta tool.
function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const res = await fetch("/api/notifications");
        const j   = await res.json();
        if (alive) setUnread(j?.unread ?? 0);
      } catch { /* ignore — keep last value */ }
    }
    tick();
    const t = setInterval(tick, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <Link href="/alerts" style={{ position: "relative", textDecoration: "none" }} title="Notifications">
      <IconButton title="Notifications">
        <Bell size={13} />
      </IconButton>
      {unread > 0 && (
        <span aria-label={`${unread} unread notifications`} style={{
          position: "absolute", top: -2, right: -2,
          minWidth: 16, height: 16, padding: "0 4px",
          borderRadius: 999, background: "var(--signal-red, #ef6b6b)",
          color: "#fff", fontSize: 9, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "2px solid var(--nav-bg, #0b0b0c)",
          fontFamily: "var(--font-mono)",
        }}>
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
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

  // Auth-aware CTA — signed-in visitors get a single Dashboard button.
  const { signedIn } = useAuthState();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header
      className="aiml-marketing-header"
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        height: "60px", display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "0 32px",
        background:      scrolled ? "var(--nav-bg)"                    : "transparent",
        backdropFilter:  scrolled ? "blur(20px) saturate(180%)"        : "none",
        WebkitBackdropFilter: scrolled ? "blur(20px) saturate(180%)"   : "none",
        borderBottom:    scrolled ? "1px solid var(--border)"          : "1px solid transparent",
        transition: "background var(--dur-base), border-color var(--dur-base), backdrop-filter var(--dur-base)",
      }}
    >
      {/* Wordmark only — the tile + "AI Marketing Lab" lockup is gone. aria-label
          carries the full name for assistive tech and for the link's accessible
          name, since "AIML" alone isn't self-explanatory. */}
      <Link
        href="/"
        aria-label="AI Marketing Lab — home"
        style={{ textDecoration: "none", display: "flex", alignItems: "center" }}
      >
        <Wordmark size={22} />
      </Link>

      <nav className="aiml-marketing-nav" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
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
        {signedIn ? (
          /* Signed in — a single Dashboard button replaces both CTAs. */
          <Link href="/dashboard" className="aiml-marketing-cta" style={{
            fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
            color: "#fff", background: "var(--brand-strong)", textDecoration: "none",
            padding: "11px 22px", borderRadius: "100px", whiteSpace: "nowrap",
            boxShadow: "0 0 22px var(--brand-glow)",
            transition: "opacity var(--dur-fast)",
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
          >Dashboard</Link>
        ) : (
          <>
            <Link
              href="/auth/login"
              className="aiml-marketing-signin"
              style={{
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
            <Link href="/dashboard" className="aiml-marketing-cta" style={{
              fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500,
              color: "#fff", background: "var(--brand-strong)", textDecoration: "none",
              padding: "11px 22px", borderRadius: "100px", whiteSpace: "nowrap",
              boxShadow: "0 0 22px var(--brand-glow)",
              transition: "opacity var(--dur-fast)",
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
            >Get started</Link>
          </>
        )}
      </div>
    </header>
  );
}

// ─── App header ───────────────────────────────────────────────────────────────
function AppHeader({
  workspaceDomain, onToggleNav, navOpen,
}: { workspaceDomain: string; onToggleNav?: () => void; navOpen?: boolean }) {
  const { brandColor, mode, toggleMode } = useTheme();

  return (
    <header
      className="aiml-header"
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        height: "56px", display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "0 20px",
        background: "var(--nav-bg)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
        {/* Hamburger — only visible ≤1024px (sidebar drawer toggle) */}
        <button
          className="aiml-mobile-burger"
          onClick={onToggleNav}
          aria-label={navOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={!!navOpen}
          style={{
            width: 32, height: 32, alignItems: "center", justifyContent: "center",
            background: "transparent", border: "1px solid var(--border)",
            borderRadius: 8, cursor: "pointer", color: "var(--text-secondary)",
            flexShrink: 0,
          }}
        >
          {navOpen ? <X size={15} /> : <Menu size={15} />}
        </button>

        <Link
          href="/dashboard"
          aria-label="AI Marketing Lab — dashboard"
          style={{
            textDecoration: "none", display: "flex", alignItems: "center",
            minWidth: 0,
          }}
        >
          <Wordmark size={18} />
        </Link>
        <span aria-hidden="true" className="aiml-header-divider" style={{
          width: "1px", height: "18px",
          background: "var(--border-strong)", margin: "0 4px",
        }} />
        <span
          className="aiml-header-workspace"
          style={{
            fontFamily: "var(--font-mono)", fontSize: "10px",
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: "var(--text-secondary)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          Workspace · {workspaceDomain}
        </span>
      </div>

      <div className="aiml-header-actions" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span className="aiml-header-live"><LiveDot label="LIVE" /></span>
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
        <NotificationBell />
        <ProfileMenu brandColor={brandColor} compact />
      </div>
    </header>
  );
}

// ─── App sidebar ──────────────────────────────────────────────────────────────
function AppSidebar({ open = false }: { open?: boolean }) {
  const pathname = usePathname();
  const { brandColor } = useTheme();

  // Operator-only nav (Blog admin). Non-admins never see the entry at all.
  const { isOperator } = useAuthState();

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
    <aside
      className={`aiml-sidebar${open ? " aiml-sidebar-open" : ""}`}
      style={{
        position: "fixed", top: "56px", left: 0, bottom: 0, width: "220px",
        background: "var(--bg)", borderRight: "1px solid var(--border)",
        padding: "22px 14px", display: "flex", flexDirection: "column",
        gap: "2px", zIndex: 50, overflowY: "auto",
      }}
    >
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
      {isOperator && SIDEBAR_OPERATOR.map(renderItem)}

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
  // NOTE: this hook must be called before the early return below — bailing out
  // first would call a different number of hooks on marketing vs app routes and
  // violate the Rules of Hooks.
  const { signedIn } = useAuthState();
  if (isAuthRoute(pathname) || isAppRoute(pathname)) return null;

  // Signed-in visitors have no use for a "Sign in" link; drop it rather than
  // swapping the label, since "Dashboard" is already in this list.
  const footerLinks = signedIn
    ? [
        { href: "/blog",      label: "Blog"      },
        { href: "/dashboard", label: "Dashboard" },
      ]
    : [
        { href: "/blog",       label: "Blog"      },
        { href: "/dashboard",  label: "Dashboard" },
        { href: "/auth/login", label: "Sign in"   },
      ];

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
        © {new Date().getFullYear()} AI Marketing Lab · London, UK
      </span>
      <div style={{ display: "flex", gap: "24px" }}>
        {footerLinks.map(({ href, label }) => (
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
// On screens ≤1024px the sidebar collapses to a slide-in drawer triggered by
// a hamburger button in the topbar. The main column reclaims full width so
// tables stay readable. On ≤768px we additionally hide the brand text +
// workspace pill + LIVE dot from the topbar so the right-hand actions fit.
const SHELL_RESPONSIVE_CSS = `
@media (max-width: 1024px) {
  .aiml-sidebar {
    transform: translateX(-100%);
    transition: transform var(--dur-base) var(--ease-expo);
    box-shadow: 0 0 24px rgba(0,0,0,0.5);
    width: 260px !important;
  }
  .aiml-sidebar.aiml-sidebar-open { transform: translateX(0); }
  .aiml-main-app { padding-left: 0 !important; }
  .aiml-mobile-burger { display: inline-flex !important; }
  .aiml-header-live { display: none !important; }
}
@media (max-width: 768px) {
  .aiml-header-divider, .aiml-header-workspace, .aiml-header-brand-text {
    display: none !important;
  }
  .aiml-header { padding: 0 14px !important; }
  .aiml-header-actions { gap: 8px !important; }
  .aiml-marketing-header { padding: 0 12px !important; }
  .aiml-marketing-brand-text { display: none !important; }
  /* The nav used to be display:none on mobile, which made Blog and Portfolio
     completely unreachable on a phone — the only links left were the logo and
     the CTA. Keep it visible and shrink it instead. */
  .aiml-marketing-nav { gap: 0 !important; }
  .aiml-marketing-nav a { padding: 8px 8px !important; font-size: 12px !important; }
  /* Drop the secondary "Sign in" pill on mobile; the primary CTA still gets
     people into the app and the row can't fit both under ~380px. */
  .aiml-marketing-signin { display: none !important; }
  .aiml-marketing-cta { padding: 9px 14px !important; font-size: 12px !important; }
  /* Page-level padding shrinks on mobile so content uses the screen */
  .aiml-page-pad { padding: 20px 14px 64px !important; }
  /* Tables that overflow get a horizontal scroll affordance instead of squashing */
  .aiml-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  /* Alerts-page rule rows reflow with wrap: icon + text on top line, then
     threshold + email + enable toggle wrap onto the next line on phones. */
  .aiml-alert-rule-row {
    display: flex !important;
    flex-wrap: wrap;
    gap: 10px !important;
  }
  .aiml-alert-rule-row > :nth-child(2) {
    flex: 1 1 calc(100% - 36px);
    min-width: 0;
  }
}
@media (min-width: 1025px) {
  .aiml-mobile-burger { display: none !important; }
}
.aiml-mobile-burger { display: none; }
.aiml-mobile-backdrop {
  position: fixed; inset: 56px 0 0 0;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  z-index: 49;
  animation: aiml-fade-in var(--dur-fast) var(--ease-expo);
}
@keyframes aiml-fade-in { from { opacity: 0; } to { opacity: 1; } }
`;

// AppShellWithDrawer
// -----------------------------------------------------------------------------
// Holds drawer-open state for the mobile/tablet experience. Wires up:
//   • Escape to close
//   • Click outside (backdrop) to close
//   • Auto-close when route changes (so the sidebar links work)
//   • Body scroll lock while open (prevents the page scrolling under the drawer)
function AppShellWithDrawer({
  workspaceDomain, children,
}: { workspaceDomain: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  // Close on route change (so picking a sidebar link dismisses the drawer)
  useEffect(() => { setNavOpen(false); }, [pathname]);

  // Escape closes
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNavOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  // Body scroll lock while drawer is open on mobile
  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [navOpen]);

  return (
    <>
      <AppHeader
        workspaceDomain={workspaceDomain}
        onToggleNav={() => setNavOpen(o => !o)}
        navOpen={navOpen}
      />
      <AppSidebar open={navOpen} />
      {navOpen && (
        <div
          className="aiml-mobile-backdrop hide-desktop"
          aria-hidden="true"
          onClick={() => setNavOpen(false)}
        />
      )}
      <main className="aiml-main-app" style={{
        paddingTop:  "56px",
        paddingLeft: "220px",
        minHeight:   "100vh",
        background:  "var(--bg)",
      }}>
        {children}
      </main>
    </>
  );
}

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
        <AppShellWithDrawer workspaceDomain={workspaceDomain}>
          {children}
        </AppShellWithDrawer>
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
