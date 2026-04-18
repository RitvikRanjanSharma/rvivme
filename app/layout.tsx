"use client";

// app/layout.tsx — AI Marketing Labs
// ============================================================================
// Root layout · Theme engine · Navbar · Font loading
// ============================================================================

import { Inter, DM_Mono } from "next/font/google";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sun, Moon, Bell, ChevronDown, Settings,
  LogOut, User, BarChart3, Search, Globe2, BookOpen,
} from "lucide-react";
import "./globals.css";

// ── Fonts ──────────────────────────────────────────────────────────────────────
const inter = Inter({
  subsets:  ["latin"],
  weight:   ["300","400","500","600"],
  variable: "--font-inter",
  display:  "swap",
});
const dmMono = DM_Mono({
  subsets:  ["latin"],
  weight:   ["300","400","500"],
  variable: "--font-dm-mono",
  display:  "swap",
});

// ── Theme context ──────────────────────────────────────────────────────────────
type ThemeCtx = {
  mode: "dark"|"light";
  toggleMode: () => void;
  brandColor: string;
  setBrandColor: (hex: string) => void;
};
const ThemeContext = createContext<ThemeCtx>({
  mode: "dark", toggleMode:()=>{},
  brandColor: "#2563eb", setBrandColor:()=>{},
});
export function useTheme() { return useContext(ThemeContext); }

function hexToRgb(hex: string) {
  const c = hex.replace("#","");
  return `${parseInt(c.slice(0,2),16)}, ${parseInt(c.slice(2,4),16)}, ${parseInt(c.slice(4,6),16)}`;
}
function injectBrand(hex: string) {
  const r = document.documentElement;
  r.style.setProperty("--brand",      hex);
  r.style.setProperty("--brand-rgb",  hexToRgb(hex));
  r.style.setProperty("--brand-glow", `rgba(${hexToRgb(hex)}, 0.20)`);
}

// ── Nav items ──────────────────────────────────────────────────────────────────
const NAV = [
  { label:"Dashboard",   href:"/dashboard",   icon:BarChart3 },
  { label:"Keywords",    href:"/keywords",    icon:Search    },
  { label:"Competitors", href:"/competitors", icon:Globe2    },
  { label:"Blog",        href:"/blog",        icon:BookOpen  },
  { label:"Settings",    href:"/settings",    icon:Settings  },
] as const;

// ── Profile dropdown ───────────────────────────────────────────────────────────
function ProfileDropdown({ brandColor }: { brandColor: string }) {
  const [open,    setOpen]    = useState(false);
  const [name,    setName]    = useState("Account");
  const [initials,setInitials]= useState("AI");

  useEffect(() => {
    // Read company name from localStorage (set by settings save)
    const company = localStorage.getItem("aiml-company");
    if (company) {
      setName(company.slice(0,20));
      setInitials(company.split(" ").map((w:string)=>w[0]).join("").slice(0,2).toUpperCase());
    }
  }, []);

  const items = [
    { label:"Profile",  icon:User,    href:"/settings?tab=profile"   },
    { label:"Branding", icon:Settings,href:"/settings?tab=branding"  },
    { label:"Sign out", icon:LogOut,  href:"/auth/signout", danger:true },
  ];

  return (
    <div style={{ position:"relative" }}>
      <button onClick={()=>setOpen(!open)} style={{
        display:"flex", alignItems:"center", gap:"8px",
        background:"transparent", border:"1px solid var(--border)", borderRadius:"8px",
        padding:"6px 12px", cursor:"pointer", color:"var(--text-primary)",
        fontFamily:"var(--font-inter), sans-serif", fontSize:"13px", fontWeight:500,
        transition:"border-color 0.18s",
      }}
        onMouseEnter={e=>(e.currentTarget.style.borderColor=brandColor)}
        onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border)")}
      >
        <div style={{
          width:"26px", height:"26px", borderRadius:"6px",
          background:`linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 60%, #000))`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:"10px", fontFamily:"var(--font-inter), sans-serif", fontWeight:600, color:"#fff",
        }}>{initials}</div>
        <span style={{ maxWidth:"120px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</span>
        <ChevronDown size={13} style={{ opacity:0.5, flexShrink:0 }}/>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div style={{ position:"fixed", inset:0, zIndex:90 }} onClick={()=>setOpen(false)}/>
            <motion.div
              initial={{ opacity:0, y:-6, scale:0.97 }}
              animate={{ opacity:1, y:0,  scale:1    }}
              exit={{   opacity:0, y:-6, scale:0.97 }}
              transition={{ duration:0.16 }}
              style={{
                position:"absolute", top:"calc(100% + 6px)", right:0,
                width:"180px", background:"var(--surface)",
                border:"1px solid var(--border)", borderRadius:"10px",
                overflow:"hidden", zIndex:100,
                boxShadow:"0 12px 40px rgba(0,0,0,0.4)",
              }}
            >
              {items.map(({ label, icon:Icon, href, danger },i)=>(
                <Link key={label} href={href} onClick={()=>setOpen(false)} style={{
                  display:"flex", alignItems:"center", gap:"8px",
                  padding:"10px 14px",
                  fontFamily:"var(--font-inter), sans-serif", fontSize:"13px", fontWeight:500,
                  color: danger?"var(--signal-red)":"var(--text-secondary)",
                  textDecoration:"none",
                  borderTop: i>0?"1px solid var(--border)":"none",
                  transition:"background 0.15s, color 0.15s",
                }}
                  onMouseEnter={e=>{
                    (e.currentTarget as HTMLElement).style.background="var(--muted)";
                    if(!danger)(e.currentTarget as HTMLElement).style.color="var(--text-primary)";
                  }}
                  onMouseLeave={e=>{
                    (e.currentTarget as HTMLElement).style.background="transparent";
                    (e.currentTarget as HTMLElement).style.color=danger?"var(--signal-red)":"var(--text-secondary)";
                  }}
                >
                  <Icon size={14}/>{label}
                </Link>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Theme provider ─────────────────────────────────────────────────────────────
function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode,       setMode]       = useState<"dark"|"light">("dark");
  const [brandColor, setBrandState] = useState("#2563eb");

  useEffect(() => {
    // Read theme — support both key names
    const stored      = localStorage.getItem("rvivme-theme") as "dark"|"light"|null;
    const storedBrand = localStorage.getItem("aiml-brand")
                     || localStorage.getItem("rvivme-brand")
                     || "#2563eb";
    if (stored) {
      setMode(stored);
      document.documentElement.classList.remove("dark","light");
      document.documentElement.classList.add(stored);
    } else {
      document.documentElement.classList.add("dark");
    }
    setBrandState(storedBrand);
    injectBrand(storedBrand);

    // Listen for brand updates from settings page
    const onStorage = (e: StorageEvent) => {
      if ((e.key==="aiml-brand"||e.key==="rvivme-brand") && e.newValue) {
        setBrandState(e.newValue);
        injectBrand(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(prev => {
      const next = prev==="dark" ? "light" : "dark";
      localStorage.setItem("rvivme-theme", next);
      document.documentElement.classList.remove("dark","light");
      document.documentElement.classList.add(next);
      return next;
    });
  }, []);

  const setBrandColor = useCallback((hex: string) => {
    setBrandState(hex);
    localStorage.setItem("aiml-brand",   hex);
    localStorage.setItem("rvivme-brand", hex);
    injectBrand(hex);
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, toggleMode, brandColor, setBrandColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── Navbar ─────────────────────────────────────────────────────────────────────
function Navbar() {
  const { mode, toggleMode, brandColor } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const path = usePathname() ?? "";
  const isPublic = path === "/" || path.startsWith("/blog") || path.startsWith("/auth");

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", fn, { passive:true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header style={{
      position:"fixed", top:0, left:0, right:0, zIndex:50,
      height:"56px", display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"0 24px",
      background: scrolled ? "var(--nav-bg)" : "transparent",
      backdropFilter: scrolled ? "blur(16px) saturate(180%)" : "none",
      borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
      transition:"all 0.3s ease",
    }}>
      {/* Logo */}
      <Link href={isPublic ? "/" : "/dashboard"} style={{ display:"flex", alignItems:"center", gap:"10px", textDecoration:"none" }}>
        <div style={{
          width:"30px", height:"30px", borderRadius:"8px",
          background:`linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 55%, #000))`,
          display:"flex", alignItems:"center", justifyContent:"center",
          boxShadow:`0 0 12px var(--brand-glow)`,
        }}>
          {/* Triangle logo mark */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1L13 12H1L7 1Z" fill="white" fillOpacity="0.92"/>
          </svg>
        </div>
        <span style={{
          fontFamily:"var(--font-inter), sans-serif",
          fontSize:"15px", fontWeight:600,
          color:"var(--text-primary)", letterSpacing:"-0.02em",
        }}>
          AI Marketing Labs
        </span>
      </Link>

      {/* Nav links — only show app nav when inside app */}
      {!isPublic && (
        <nav style={{ display:"flex", alignItems:"center", gap:"2px" }}>
          {NAV.map(({ label, href, icon:Icon }) => {
            const active = path.startsWith(href);
            return (
              <Link key={label} href={href} style={{
                display:"flex", alignItems:"center", gap:"6px",
                fontFamily:"var(--font-inter), sans-serif", fontSize:"13px", fontWeight:500,
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                padding:"6px 12px", borderRadius:"7px",
                background: active ? "var(--muted)" : "transparent",
                textDecoration:"none", transition:"color 0.16s, background 0.16s",
              }}
                onMouseEnter={e=>{
                  (e.currentTarget as HTMLElement).style.color="var(--text-primary)";
                  if(!active)(e.currentTarget as HTMLElement).style.background="var(--muted)";
                }}
                onMouseLeave={e=>{
                  (e.currentTarget as HTMLElement).style.color=active?"var(--text-primary)":"var(--text-secondary)";
                  if(!active)(e.currentTarget as HTMLElement).style.background="transparent";
                }}
              >
                <Icon size={13}/>{label}
              </Link>
            );
          })}
        </nav>
      )}

      {/* Public nav */}
      {isPublic && (
        <nav style={{ display:"flex", alignItems:"center", gap:"2px" }}>
          <Link href="/" style={{ fontFamily:"var(--font-inter), sans-serif", fontSize:"13px", fontWeight:500, color:"var(--text-secondary)", padding:"6px 12px", borderRadius:"7px", textDecoration:"none" }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color="var(--text-primary)"}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color="var(--text-secondary)"}
          >Home</Link>
          <Link href="/blog" style={{ fontFamily:"var(--font-inter), sans-serif", fontSize:"13px", fontWeight:500, color:"var(--text-secondary)", padding:"6px 12px", borderRadius:"7px", textDecoration:"none" }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color="var(--text-primary)"}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color="var(--text-secondary)"}
          >Intelligence</Link>
        </nav>
      )}

      {/* Right controls */}
      <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
        {!isPublic && (
          <button style={{
            width:"32px", height:"32px", border:"1px solid var(--border)", borderRadius:"7px",
            background:"transparent", display:"flex", alignItems:"center", justifyContent:"center",
            cursor:"pointer", color:"var(--text-secondary)", transition:"border-color 0.16s, color 0.16s",
            position:"relative",
          }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=brandColor;(e.currentTarget as HTMLElement).style.color="var(--text-primary)";}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor="var(--border)";(e.currentTarget as HTMLElement).style.color="var(--text-secondary)";}}
          >
            <Bell size={14}/>
            <div style={{ position:"absolute", top:"7px", right:"7px", width:"5px", height:"5px", borderRadius:"50%", background:brandColor }}/>
          </button>
        )}

        <button onClick={toggleMode} style={{
          width:"32px", height:"32px", border:"1px solid var(--border)", borderRadius:"7px",
          background:"transparent", display:"flex", alignItems:"center", justifyContent:"center",
          cursor:"pointer", color:"var(--text-secondary)", transition:"border-color 0.16s, color 0.16s",
        }}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=brandColor;(e.currentTarget as HTMLElement).style.color="var(--text-primary)";}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor="var(--border)";(e.currentTarget as HTMLElement).style.color="var(--text-secondary)";}}
        >
          <AnimatePresence mode="wait">
            <motion.div key={mode} initial={{ rotate:-30,opacity:0 }} animate={{ rotate:0,opacity:1 }} exit={{ rotate:30,opacity:0 }} transition={{ duration:0.18 }}>
              {mode==="dark" ? <Sun size={14}/> : <Moon size={14}/>}
            </motion.div>
          </AnimatePresence>
        </button>

        {!isPublic
          ? <ProfileDropdown brandColor={brandColor}/>
          : <Link href="/auth/login" style={{ display:"flex", alignItems:"center", gap:"6px", fontFamily:"var(--font-inter), sans-serif", fontSize:"13px", fontWeight:500, color:"#fff", background:brandColor, textDecoration:"none", padding:"7px 16px", borderRadius:"100px", transition:"opacity 0.16s" }}
              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity="0.85"}
              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity="1"}
            >Sign in</Link>
        }
      </div>
    </header>
  );
}

// ── Root layout ────────────────────────────────────────────────────────────────
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`dark ${inter.variable} ${dmMono.variable}`} suppressHydrationWarning>
      <head>
        <title>AI Marketing Labs — SEO & GEO Intelligence Platform</title>
        <meta name="description" content="Unified SEO and GEO intelligence. GA4, Search Console, DataForSEO, and AI citation tracking in one workspace."/>
        <meta name="theme-color" content="#080808"/>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
      </head>
      <body style={{ margin:0, padding:0 }}>
        <ThemeProvider>
          <Navbar/>
          <main style={{ paddingTop:"56px", minHeight:"100vh" }}>
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
