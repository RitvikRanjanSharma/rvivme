"use client";

// app/blog/page.tsx
// =============================================================================
// RVIVME — Public Blog Index
// Editorial dark aesthetic · Category filter · Search · Newsletter capture
// Obsidian & Bio-Blue design system — public-facing, no auth required
// =============================================================================

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  Search, Clock, Tag, ArrowRight, Zap, Rss,
  TrendingUp, Code2, FileText, Globe2, Newspaper,
  Lightbulb, BookOpen, CheckCircle2, X,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Post {
  id:             string;
  slug:           string;
  title:          string;
  excerpt:        string;
  category:       string;
  tags:           string[];
  read_time:      number;
  published_at:   string;
  author_name:    string;
  author_avatar:  string;
  featured:       boolean;
  cover_image:    string;
  focus_keyword:  string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock posts — clinical corporate tone, SEO & Hatfield UK content
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_POSTS: Post[] = [
  {
    id: "1", slug: "generative-engine-optimisation-enterprise-guide",
    title: "Generative Engine Optimisation: The Definitive Enterprise Guide for 2026",
    excerpt: "As AI-powered search engines displace traditional SERP rankings, enterprise organisations must adapt their content architecture to achieve citation within large language model outputs. This guide covers the strategic framework, technical implementation, and measurement protocols required to succeed in the post-Google search landscape.",
    category: "geo_optimisation", tags: ["GEO", "AI Search", "Content Strategy"],
    read_time: 14, published_at: "2026-04-10", author_name: "AI Marketing Labs Editorial",
    author_avatar: "RE", featured: true, cover_image: "",
    focus_keyword: "generative engine optimisation",
  },
  {
    id: "2", slug: "technical-seo-core-web-vitals-2026",
    title: "Core Web Vitals in 2026: What Has Changed and What Your Site Must Do Now",
    excerpt: "Google's third iteration of the Core Web Vitals update introduces Interaction to Next Paint as a primary ranking signal. This technical brief covers INP benchmarks, measurement tooling, and remediation strategies for enterprise web properties handling high traffic volumes.",
    category: "technical_seo", tags: ["Technical SEO", "Core Web Vitals", "Google"],
    read_time: 9, published_at: "2026-04-08", author_name: "AI Marketing Labs Editorial",
    author_avatar: "RE", featured: false, cover_image: "",
    focus_keyword: "core web vitals 2026",
  },
  {
    id: "3", slug: "hatfield-uk-business-digital-strategy-2026",
    title: "Hatfield UK Business District: A Digital Strategy Review for Q2 2026",
    excerpt: "An analysis of the digital presence, search visibility, and content authority of businesses operating within the Hatfield commercial district. This review benchmarks local organic performance against national competitors and identifies the primary growth opportunities available to Hertfordshire-based enterprises.",
    category: "business_insights", tags: ["Hatfield UK", "Business Strategy", "SEO"],
    read_time: 7, published_at: "2026-04-06", author_name: "AI Marketing Labs Editorial",
    author_avatar: "RE", featured: false, cover_image: "",
    focus_keyword: "Hatfield UK business digital strategy",
  },
  {
    id: "4", slug: "dataforseo-api-integration-seo-platforms",
    title: "How We Integrated DataForSEO to Power Real-Time Keyword Intelligence",
    excerpt: "A technical case study detailing the architecture decisions, API endpoint selection, cost management strategies, and data normalisation processes behind RVIVME's DataForSEO integration. Includes benchmark comparisons against SEMrush API and practical implementation guidance for development teams.",
    category: "platform_updates", tags: ["DataForSEO", "RVIVME", "Technical SEO"],
    read_time: 11, published_at: "2026-04-04", author_name: "AI Marketing Labs Editorial",
    author_avatar: "RE", featured: false, cover_image: "",
    focus_keyword: "DataForSEO API integration",
  },
  {
    id: "5", slug: "topical-authority-content-clusters-guide",
    title: "Building Topical Authority: The Hub-and-Spoke Content Cluster Framework",
    excerpt: "Topical authority has replaced domain authority as the primary determinant of content visibility in competitive niches. This framework outlines the research methodology, information architecture, and internal linking strategy required to establish definitive coverage across a subject area.",
    category: "content_marketing", tags: ["Content Strategy", "SEO", "Keyword Research"],
    read_time: 12, published_at: "2026-04-02", author_name: "AI Marketing Labs Editorial",
    author_avatar: "RE", featured: false, cover_image: "",
    focus_keyword: "topical authority content clusters",
  },
  {
    id: "6", slug: "competitor-backlink-gap-analysis-methodology",
    title: "Competitor Backlink Gap Analysis: A Systematic Methodology for Link Acquisition",
    excerpt: "Systematic backlink gap analysis — identifying high-authority referring domains that link to competitors but not to your domain — remains one of the highest-ROI activities in enterprise SEO. This methodology covers data sourcing, prospect qualification, outreach sequencing, and success measurement.",
    category: "seo_strategy", tags: ["Link Building", "Competitor Analysis", "SEO"],
    read_time: 8, published_at: "2026-03-31", author_name: "AI Marketing Labs Editorial",
    author_avatar: "RE", featured: false, cover_image: "",
    focus_keyword: "competitor backlink gap analysis",
  },
  {
    id: "7", slug: "ai-overview-optimisation-schema-markup",
    title: "AI Overview Optimisation: How Schema Markup Increases Citation Probability by 34%",
    excerpt: "Analysis of 2,400 AI Overview citations across Google, Perplexity, and ChatGPT reveals a strong correlation between structured data implementation and citation frequency. This study details the specific schema types, implementation patterns, and content formatting conventions that maximise AI engine visibility.",
    category: "geo_optimisation", tags: ["GEO", "AI Search", "Technical SEO"],
    read_time: 10, published_at: "2026-03-28", author_name: "AI Marketing Labs Editorial",
    author_avatar: "RE", featured: false, cover_image: "",
    focus_keyword: "AI overview optimisation schema markup",
  },
  {
    id: "8", slug: "rvivme-platform-case-study-organic-growth",
    title: "Case Study: 85% Organic Traffic Growth in 6 Months Using RVIVME Intelligence",
    excerpt: "A detailed account of how a mid-market professional services firm in the UK achieved an 85% increase in organic sessions within 26 weeks by implementing the three AI-generated strategies surfaced by the RVIVME platform. Includes full methodology, timeline, and attribution analysis.",
    category: "case_studies", tags: ["Case Study", "RVIVME", "SEO"],
    read_time: 13, published_at: "2026-03-25", author_name: "AI Marketing Labs Editorial",
    author_avatar: "RE", featured: false, cover_image: "",
    focus_keyword: "organic traffic growth case study",
  },
];

const CATEGORIES = [
  { id: "all",               label: "All Posts",          icon: BookOpen  },
  { id: "seo_strategy",      label: "SEO Strategy",       icon: TrendingUp },
  { id: "geo_optimisation",  label: "GEO",                icon: Globe2     },
  { id: "technical_seo",     label: "Technical SEO",      icon: Code2      },
  { id: "content_marketing", label: "Content",            icon: FileText   },
  { id: "business_insights", label: "Business Insights",  icon: Lightbulb  },
  { id: "platform_updates",  label: "Platform Updates",   icon: Zap        },
  { id: "case_studies",      label: "Case Studies",       icon: CheckCircle2 },
  { id: "industry_news",     label: "Industry News",      icon: Newspaper  },
];

function categoryLabel(id: string): string {
  return CATEGORIES.find(c => c.id === id)?.label ?? id;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Spring / animation helpers
// ─────────────────────────────────────────────────────────────────────────────
const SP = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const;
function pv(delay = 0) {
  return {
    hidden:  { opacity: 0, y: 18 },
    visible: { opacity: 1, y: 0, transition: { ...SP, delay } },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Newsletter signup
// ─────────────────────────────────────────────────────────────────────────────
function NewsletterBanner() {
  const [email,     setEmail]     = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const brandColor = "#3b82f6";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setLoading(true);
    // In production: POST to /api/newsletter with { email, source: "blog" }
    await new Promise(r => setTimeout(r, 800));
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div style={{
      background:     `linear-gradient(135deg, rgba(var(--brand-rgb),0.08) 0%, rgba(var(--brand-rgb),0.03) 100%)`,
      border:         `1px solid rgba(var(--brand-rgb),0.20)`,
      borderRadius:   "16px",
      padding:        "40px 48px",
      textAlign:      "center",
      position:       "relative",
      overflow:       "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "300px", height: "1px", background: `linear-gradient(90deg, transparent, ${brandColor}, transparent)` }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "12px" }}>
        <Rss size={16} color={brandColor} />
        <span style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "11px", fontWeight: 700, color: brandColor, letterSpacing: "0.14em", textTransform: "uppercase" }}>Intelligence Dispatch</span>
      </div>

      <h3 style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "clamp(1.4rem, 3vw, 1.9rem)", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.025em", marginBottom: "10px" }}>
        Weekly SEO & GEO Intelligence.<br />
        <span style={{ color: brandColor }}>Delivered to your inbox.</span>
      </h3>
      <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: "480px", margin: "0 auto 28px" }}>
        Join 2,400+ enterprise SEO practitioners receiving the RVIVME weekly brief — strategy analysis, algorithm updates, and GEO intelligence every Tuesday.
      </p>

      <AnimatePresence mode="wait">
        {submitted ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              display:        "inline-flex",
              alignItems:     "center",
              justifyContent: "center",
              gap:            "8px",
              padding:        "12px 24px",
              background:     "rgba(0,230,118,0.10)",
              border:         "1px solid rgba(0,230,118,0.25)",
              borderRadius:   "8px",
              margin:         "0 auto",
            }}
          >
            <CheckCircle2 size={15} color="var(--signal-green)" />
            <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 600, color: "var(--signal-green)" }}>
              Subscribed. Check your inbox for confirmation.
            </span>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={handleSubmit}
            style={{ display: "flex", gap: "8px", maxWidth: "440px", margin: "0 auto", flexWrap: "wrap", justifyContent: "center" }}
          >
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@company.com"
              required
              style={{
                flex:         "1 1 240px",
                padding:      "11px 16px",
                fontFamily:   "var(--font-inter), sans-serif",
                fontSize:     "13px",
                color:        "var(--text-primary)",
                background:   "var(--surface)",
                border:       "1px solid var(--border)",
                borderRadius: "8px",
                outline:      "none",
                transition:   "border-color 0.18s",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = brandColor)}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                flex:         "0 0 auto",
                display:      "flex",
                alignItems:   "center",
                gap:          "6px",
                padding:      "11px 22px",
                fontFamily:   "var(--font-inter), sans-serif",
                fontSize:     "13px",
                fontWeight:   700,
                color:        "#fff",
                background:   `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 60%, #000))`,
                border:       "none",
                borderRadius: "8px",
                cursor:       "pointer",
                boxShadow:    "0 0 18px var(--brand-glow)",
                transition:   "all 0.2s",
              }}
            >
              {loading
                ? <div style={{ width: "12px", height: "12px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                : <><Zap size={13} strokeWidth={2.5} />Subscribe</>
              }
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "11px", color: "var(--text-tertiary)", marginTop: "14px" }}>
        No spam. Unsubscribe at any time. GDPR compliant.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Featured post hero
// ─────────────────────────────────────────────────────────────────────────────
function FeaturedPost({ post }: { post: Post }) {
  const [hovered, setHovered] = useState(false);
  const brandColor = "#3b82f6";

  return (
    <Link
    href="/blog"
    suppressHydrationWarning
    style={{ textDecoration: "none", display: "block" }}>
      <motion.div
        variants={pv(0.15)}
        initial="hidden"
        animate="visible"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background:   "var(--surface)",
          border:       `1px solid ${hovered ? `rgba(var(--brand-rgb),0.35)` : "var(--border)"}`,
          borderRadius: "16px",
          padding:      "40px 44px",
          marginBottom: "24px",
          position:     "relative",
          overflow:     "hidden",
          transition:   "border-color 0.25s, box-shadow 0.25s",
          boxShadow:    hovered ? "0 0 32px var(--brand-glow)" : "none",
          cursor:       "pointer",
        }}
      >
        {/* Top accent line */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: `linear-gradient(90deg, transparent, ${brandColor}, transparent)` }} />

        <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "18px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", fontWeight: 700, color: brandColor, background: `rgba(var(--brand-rgb),0.10)`, border: `1px solid rgba(var(--brand-rgb),0.22)`, padding: "3px 10px", borderRadius: "100px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Featured
          </span>
          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", color: "var(--text-tertiary)", background: "var(--card)", border: "1px solid var(--border)", padding: "3px 10px", borderRadius: "100px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {categoryLabel(post.category)}
          </span>
        </div>

        <h2 style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1.15, marginBottom: "14px", maxWidth: "760px" }}>
          {post.title}
        </h2>

        <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.75, maxWidth: "720px", marginBottom: "24px" }}>
          {post.excerpt}
        </p>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 55%, #000))`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-syne), sans-serif", fontSize: "9px", fontWeight: 700, color: "#fff" }}>
                {post.author_avatar}
              </div>
              <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>{post.author_name}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <Clock size={11} color="var(--text-tertiary)" />
              <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-tertiary)" }}>{post.read_time} min read</span>
            </div>
            <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-tertiary)" }}>{formatDate(post.published_at)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 600, color: brandColor, transition: "gap 0.2s" }}>
            Read article <ArrowRight size={14} style={{ transform: hovered ? "translateX(3px)" : "translateX(0)", transition: "transform 0.2s" }} />
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Post card
// ─────────────────────────────────────────────────────────────────────────────
function PostCard({ post, delay }: { post: Post; delay: number }) {
  const [hovered, setHovered] = useState(false);
  const brandColor = "#3b82f6";

  return (
    <Link
  href="/blog"
  suppressHydrationWarning
  style={{ textDecoration: "none" }}>
      <motion.div
        variants={pv(delay)}
        initial="hidden"
        animate="visible"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background:   "var(--surface)",
          border:       `1px solid ${hovered ? `rgba(var(--brand-rgb),0.30)` : "var(--border)"}`,
          borderRadius: "12px",
          padding:      "24px",
          height:       "100%",
          display:      "flex",
          flexDirection:"column",
          position:     "relative",
          overflow:     "hidden",
          transition:   "border-color 0.22s, transform 0.22s, box-shadow 0.22s",
          transform:    hovered ? "translateY(-2px)" : "translateY(0)",
          boxShadow:    hovered ? "0 8px 32px rgba(0,0,0,0.4)" : "0 1px 4px rgba(0,0,0,0.3)",
          cursor:       "pointer",
        }}
      >
        {/* Category pill */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", fontWeight: 500, color: "var(--text-tertiary)", background: "var(--card)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: "100px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {categoryLabel(post.category)}
          </span>
        </div>

        {/* Title */}
        <h3 style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.015em", lineHeight: 1.35, marginBottom: "10px", flex: "0 0 auto" }}>
          {post.title}
        </h3>

        {/* Excerpt */}
        <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.7, flex: 1, marginBottom: "18px", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {post.excerpt}
        </p>

        {/* Tags */}
        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "16px" }}>
          {post.tags.slice(0, 3).map(tag => (
            <span key={tag} style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", color: brandColor, background: `rgba(var(--brand-rgb),0.08)`, border: `1px solid rgba(var(--brand-rgb),0.18)`, padding: "2px 7px", borderRadius: "100px", letterSpacing: "0.06em" }}>
              {tag}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "14px", borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <Clock size={10} color="var(--text-tertiary)" />
              <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)" }}>{post.read_time} min</span>
            </div>
            <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)" }}>{formatDate(post.published_at)}</span>
          </div>
          <ArrowRight size={13} color={hovered ? brandColor : "var(--text-tertiary)"} style={{ transition: "color 0.2s, transform 0.2s", transform: hovered ? "translateX(2px)" : "translateX(0)" }} />
        </div>
      </motion.div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function BlogIndexPage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [search,         setSearch]         = useState("");
  const [searchOpen,     setSearchOpen]     = useState(false);
  const brandColor = "#3b82f6";

  useEffect(() => {
    const stored = localStorage.getItem("rvivme-brand");
    if (stored) {
      document.documentElement.style.setProperty("--brand", stored);
    }
  }, []);

  const featured = MOCK_POSTS.find(p => p.featured)!;
  const rest     = MOCK_POSTS.filter(p => !p.featured);

  const filtered = rest.filter(p => {
    const matchCat  = activeCategory === "all" || p.category === activeCategory;
    const matchSearch = search === "" || p.title.toLowerCase().includes(search.toLowerCase()) || p.excerpt.toLowerCase().includes(search.toLowerCase()) || p.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }} suppressHydrationWarning>
      {/* Page header */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "60px 24px 40px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "800px", height: "300px", background: `radial-gradient(ellipse, rgba(var(--brand-rgb),0.07) 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ maxWidth: "1200px", margin: "0 auto", position: "relative" }}>
          <motion.div variants={pv(0)} initial="hidden" animate="visible">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
              <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", fontWeight: 600, color: brandColor, letterSpacing: "0.14em", textTransform: "uppercase", padding: "4px 12px", border: `1px solid rgba(var(--brand-rgb),0.25)`, borderRadius: "100px", background: `rgba(var(--brand-rgb),0.07)` }}>
                Intelligence Blog
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
              <div>
                <h1 style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.04em", lineHeight: 0.95, marginBottom: "12px" }}>
                  SEO & GEO<br />
                  <span style={{ color: brandColor }}>Intelligence.</span>
                </h1>
                <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "15px", color: "var(--text-secondary)", maxWidth: "520px", lineHeight: 1.7 }}>
                  Strategy analysis, technical guides, and enterprise case studies from the AI Marketing Labs research team. Built to be tested by our own platform.
                </p>
              </div>

              {/* Search */}
              <div style={{ position: "relative" }}>
                <AnimatePresence>
                  {searchOpen ? (
                    <motion.div
                      key="search-input"
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "260px", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px", overflow: "hidden" }}
                    >
                      <Search size={13} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
                      <input
                        autoFocus
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search articles..."
                        style={{ background: "transparent", border: "none", outline: "none", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--text-primary)", flex: 1, minWidth: 0 }}
                      />
                      <button onClick={() => { setSearch(""); setSearchOpen(false); }} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex", padding: "2px" }}>
                        <X size={12} />
                      </button>
                    </motion.div>
                  ) : (
                    <motion.button
                      key="search-btn"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => setSearchOpen(true)}
                      style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--text-secondary)", transition: "border-color 0.18s" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = brandColor}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"}
                    >
                      <Search size={13} />
                      Search
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 24px 80px" }}>
        {/* Category filter */}
        <motion.div variants={pv(0.1)} initial="hidden" animate="visible" style={{ marginBottom: "32px", overflowX: "auto", paddingBottom: "4px" }}>
          <div style={{ display: "flex", gap: "6px", width: "max-content" }}>
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const active = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  style={{
                    display:      "flex",
                    alignItems:   "center",
                    gap:          "5px",
                    padding:      "7px 14px",
                    fontFamily:   "var(--font-inter), sans-serif",
                    fontSize:     "12px",
                    fontWeight:   active ? 600 : 500,
                    color:        active ? brandColor : "var(--text-secondary)",
                    background:   active ? `rgba(var(--brand-rgb),0.10)` : "transparent",
                    border:       `1px solid ${active ? `rgba(var(--brand-rgb),0.25)` : "var(--border)"}`,
                    borderRadius: "7px",
                    cursor:       "pointer",
                    transition:   "all 0.18s",
                    whiteSpace:   "nowrap",
                  }}
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLElement).style.background = "var(--surface)"; } }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.background = "transparent"; } }}
                >
                  <Icon size={11} />
                  {cat.label}
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Search results notice */}
        <AnimatePresence>
          {search && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}
            >
              <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
                {filtered.length} result{filtered.length !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Featured post */}
        {activeCategory === "all" && !search && <FeaturedPost post={featured} />}

        {/* Post grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory + search}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px", marginBottom: "48px" }}
          >
            {filtered.length > 0 ? (
              filtered.map((post, i) => (
                <PostCard key={post.id} post={post} delay={i * 0.06} />
              ))
            ) : (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 24px" }}>
                <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  No articles found for this filter
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Newsletter */}
        <motion.div variants={pv(0.3)} initial="hidden" animate="visible">
          <NewsletterBanner />
        </motion.div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
