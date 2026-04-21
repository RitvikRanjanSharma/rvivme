"use client";

// app/blog/[slug]/page.tsx
// =============================================================================
// AI Marketing Lab — Blog Post
// Reads from Supabase · New design system · View count · Share buttons
// =============================================================================

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, Share2, Link2, CheckCircle2, Rss } from "lucide-react";
import { supabase } from "@/lib/supabase";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

interface Post {
  id:                string;
  title:             string;
  slug:              string;
  excerpt:           string;
  content:           string;
  category:          string;
  read_time_minutes: number;
  published_at:      string | null;
  author_name:       string;
  author_bio:        string | null;
  focus_keyword:     string | null;
  meta_description:  string | null;
  view_count:        number;
  featured:          boolean;
}

function categoryLabel(id: string): string {
  const map: Record<string, string> = {
    seo_strategy: "SEO Strategy", geo_optimisation: "GEO",
    technical_seo: "Technical SEO", content_marketing: "Content",
    business_insights: "Business", platform_updates: "Platform",
    case_studies: "Case Studies", industry_news: "Industry News",
  };
  return map[id] ?? id;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// Minimal markdown renderer
function renderContent(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { elements.push(<div key={key++} style={{ height: "12px" }} />); continue; }

    if (line.startsWith("## ")) {
      elements.push(<h2 key={key++} style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.4rem,2.5vw,1.9rem)", letterSpacing: "-0.04em", lineHeight: 1.1, fontWeight: 400, color: "var(--text-primary)", marginTop: "48px", marginBottom: "16px" }}>{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={key++} style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.1rem,2vw,1.4rem)", letterSpacing: "-0.03em", lineHeight: 1.2, fontWeight: 400, color: "var(--text-primary)", marginTop: "32px", marginBottom: "12px" }}>{line.slice(4)}</h3>);
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) { items.push(lines[i].slice(2)); i++; }
      i--;
      elements.push(
        <ul key={key++} style={{ margin: "12px 0 16px", paddingLeft: "20px" }}>
          {items.map((item, j) => <li key={j} style={{ fontFamily: "var(--font-body)", fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: "6px" }} dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text-primary);font-weight:600">$1</strong>') }} />)}
        </ul>
      );
    } else if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, "")); i++; }
      i--;
      elements.push(
        <ol key={key++} style={{ margin: "12px 0 16px", paddingLeft: "20px" }}>
          {items.map((item, j) => <li key={j} style={{ fontFamily: "var(--font-body)", fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: "6px" }} dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text-primary);font-weight:600">$1</strong>') }} />)}
        </ol>
      );
    } else if (line.startsWith("✓ ")) {
      elements.push(<div key={key++} style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "8px" }}>
        <CheckCircle2 size={14} style={{ color: "var(--signal-green)", flexShrink: 0, marginTop: "4px" }} />
        <span style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.7 }}>{line.slice(2)}</span>
      </div>);
    } else {
      elements.push(<p key={key++} style={{ fontFamily: "var(--font-body)", fontSize: "16px", color: "var(--text-secondary)", lineHeight: 1.85, marginBottom: "0" }} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text-primary);font-weight:600">$1</strong>') }} />);
    }
  }
  return elements;
}

export default function BlogPostPage() {
  const params = useParams();
  const slug   = params.slug as string;

  const [post,    setPost]    = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound,setNotFound]= useState(false);
  const [copied,  setCopied]  = useState(false);
  const [email,   setEmail]   = useState("");
  const [subbed,  setSubbed]  = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id,title,slug,excerpt,content,category,read_time_minutes,published_at,author_name,author_bio,focus_keyword,meta_description,view_count,featured")
        .eq("slug", slug)
        .eq("status", "published")
        .single();

      if (error || !data) { setNotFound(true); setLoading(false); return; }
      const post = data as Post;
      setPost(post);
      setLoading(false);

      // Increment view count. RLS on blog_posts blocks anon/non-author UPDATEs,
      // so go through the SECURITY DEFINER RPC added in migration 003.
      // `as never` bypasses the generated RPC type map, which doesn't know about
      // our custom function yet.
      await supabase.rpc("increment_post_view" as never, { p_post_id: post.id } as never);
      // Log the view event (anon has public insert via RLS).
      await supabase.from("post_view_events").insert({ post_id: post.id, referrer: document.referrer || null } as never);
    }
    load();
  }, [slug]);

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    // UNIQUE constraint on email means a duplicate subscribe throws 23505.
    // Treat "already subscribed" as success from the reader's perspective.
    const { error } = await supabase.from("newsletter_subscribers").insert({ email, source: "post" } as never);
    if (error && !/duplicate|unique/i.test(error.message)) {
      console.error("[subscribe]", error.message);
      return;
    }
    setSubbed(true);
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "20px", height: "20px", border: "2px solid var(--border)", borderTopColor: "var(--brand)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "24px", padding: "40px" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "3rem", letterSpacing: "-0.05em", fontWeight: 400, color: "var(--text-primary)" }}>Post not found.</h1>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "15px", color: "var(--text-secondary)" }}>This article may have been moved or unpublished.</p>
        <Link href="/blog" style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--brand)", textDecoration: "underline", textUnderlineOffset: "3px" }}>Browse all articles</Link>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "48px 32px 40px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(37,99,235,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: "860px", margin: "0 auto", position: "relative" }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE_EXPO }}>
            <Link href="/blog" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-tertiary)", textDecoration: "none", marginBottom: "28px", transition: "color 0.16s" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"}
            >
              <ArrowLeft size={13} /> Intelligence
            </Link>

            {/* Category + read time */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--brand)", background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.20)", padding: "3px 10px", borderRadius: "100px" }}>
                {categoryLabel(post.category)}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.08em", color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: "4px" }}>
                <Clock size={10} /> {post.read_time_minutes} min read
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
                {formatDate(post.published_at)}
              </span>
            </div>

            {/* Title */}
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem,4.5vw,3.6rem)", letterSpacing: "-0.05em", lineHeight: 0.95, fontWeight: 400, color: "var(--text-primary)", marginBottom: "20px" }}>
              {post.title}
            </h1>

            {/* Excerpt */}
            <p style={{ fontFamily: "var(--font-body)", fontSize: "17px", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: "680px", marginBottom: "28px" }}>
              {post.excerpt}
            </p>

            {/* Author + share */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 500, color: "#fff" }}>
                  {post.author_name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase()}
                </div>
                <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{post.author_name}</span>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                {[
                  { label: "X",       icon: Share2,                        action: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(window.location.href)}`) },
                  { label: "LinkedIn",icon: ArrowLeft,                     action: () => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`) },
                  { label: "Copy",    icon: copied ? CheckCircle2 : Link2, action: copyLink },
                ].map(({ icon: Icon, label, action }) => (
                  <button key={label} onClick={action} title={label}
                    style={{ width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "7px", cursor: "pointer", color: "var(--text-tertiary)", transition: "all 0.15s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--brand)"; (e.currentTarget as HTMLElement).style.color = "var(--brand)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; }}
                  >
                    <Icon size={12} />
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "48px 32px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: "48px", alignItems: "start" }}>

          {/* Article */}
          <motion.article initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE_EXPO, delay: 0.1 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              {renderContent(post.content)}
            </div>

            {/* Author bio */}
            {post.author_bio && (
              <div style={{ marginTop: "56px", paddingTop: "40px", borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                  <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 500, color: "#fff", flexShrink: 0 }}>
                    {post.author_name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>{post.author_name}</div>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>{post.author_bio}</p>
                  </div>
                </div>
              </div>
            )}
          </motion.article>

          {/* Sidebar */}
          <motion.aside initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease: EASE_EXPO, delay: 0.3 }}
            style={{ position: "sticky", top: "80px" }}
          >
            {/* Focus keyword */}
            {post.focus_keyword && (
              <div style={{ padding: "14px 16px", background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.15)", borderRadius: "10px", marginBottom: "20px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--brand)", marginBottom: "5px" }}>Focus Keyword</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>{post.focus_keyword}</div>
              </div>
            )}

            {/* Newsletter */}
            <div style={{ padding: "20px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "10px" }}>
                <Rss size={12} color="var(--brand)" />
                <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Weekly Brief</span>
              </div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "14px" }}>
                SEO & GEO intelligence every Tuesday.
              </p>
              {subbed ? (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--signal-green)" }}>
                  <CheckCircle2 size={13} /> Subscribed
                </div>
              ) : (
                <form onSubmit={handleSubscribe}>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required
                    style={{ width: "100%", padding: "9px 12px", fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-primary)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "7px", outline: "none", marginBottom: "8px", boxSizing: "border-box" as const }}
                    onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
                    onBlur={e =>  e.currentTarget.style.borderColor = "var(--border)"}
                  />
                  <button type="submit" style={{ width: "100%", padding: "9px", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 500, color: "#fff", background: "var(--brand)", border: "none", borderRadius: "7px", cursor: "pointer", transition: "opacity 0.16s" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
                  >
                    Subscribe
                  </button>
                </form>
              )}
            </div>

            {/* Back to blog */}
            <div style={{ marginTop: "16px" }}>
              <Link href="/blog" style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-tertiary)", textDecoration: "none", transition: "color 0.16s" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"}
              >
                <ArrowLeft size={12} /> All articles
              </Link>
            </div>
          </motion.aside>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
