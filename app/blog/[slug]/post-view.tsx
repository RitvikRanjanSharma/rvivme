"use client";

// app/blog/[slug]/post-view.tsx
// =============================================================================
// AI Marketing Lab — Blog Post (client view)
// Reads from Supabase · View count (one per session) · Share buttons
//
// Split out from page.tsx so that page.tsx can be a SERVER component and
// export generateMetadata(). Open Graph / Twitter card tags have to be in the
// server-rendered HTML for LinkedIn, Slack, X etc. to read them — a client
// component can't emit them at all, which is why shared links previously
// showed no preview.
// =============================================================================

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Clock, Link2, CheckCircle2, Rss, X } from "lucide-react";

// Brand marks as inline SVG. lucide-react dropped its brand icons in v1 (they
// were removed over trademark concerns), so these are hand-rolled rather than
// imported. currentColor lets them inherit the button's hover colour.
function LinkedinIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}
function XIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 1.15h7.59l5.24 6.93zm-1.29 19.5h2.04L6.49 3.24H4.3z" />
    </svg>
  );
}
function FacebookIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}
import { supabase } from "@/lib/supabase";
import { sanitizeHtml, looksLikeHtml } from "@/lib/sanitize-html";
import ReaderControls from "./reader-controls";

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
    consumer_psychology: "Consumer Psychology",
  };
  return map[id] ?? id;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// HTML-escape user content before we transform our `**bold**` markers into
// `<strong>` tags. Without this, anyone with insert access to blog_posts
// (any signed-in user under current RLS) could embed a `<script>` or
// `<img onerror=…>` payload that executes for every blog reader.
function safeBold(line: string): string {
  const escaped = line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return escaped.replace(
    /\*\*(.+?)\*\*/g,
    '<strong style="color:var(--text-primary);font-weight:600">$1</strong>',
  );
}

// Renders a post body. Two formats land in blog_posts.content:
//   • HTML     — from the TipTap editor in Blog Admin (editor.getHTML())
//   • Markdown — legacy posts stored before the editor moved to HTML
// The markdown renderer below HTML-escapes everything, so feeding it editor
// HTML printed raw "<h1>…</h1>" tags on the page as literal text. Detect the
// format and route accordingly, sanitising the HTML path.
function PostBody({ content }: { content: string }) {
  // Sanitisation uses DOMParser, which only exists in the browser, so this has
  // to run after mount rather than during SSR/first render.
  const [html, setHtml] = useState<string | null>(null);
  const isHtml = looksLikeHtml(content);

  useEffect(() => {
    if (isHtml) setHtml(sanitizeHtml(content));
  }, [content, isHtml]);

  if (!isHtml) {
    return <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>{renderContent(content)}</div>;
  }

  // Brief skeleton while the client-side sanitise pass runs.
  if (html === null) {
    return (
      <div aria-hidden style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {[100, 96, 88].map((w, i) => (
          <div key={i} style={{
            height: "16px", width: `${w}%`, borderRadius: "4px",
            background: "linear-gradient(90deg, var(--card) 25%, var(--muted) 50%, var(--card) 75%)",
            backgroundSize: "200% 100%", animation: "shimmer 1.4s ease-in-out infinite",
          }} />
        ))}
      </div>
    );
  }

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
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
          {/* Font size / colour / line-height come from .aiml-article in
              globals.css so they can respond to viewport width. */}
          {items.map((item, j) => <li key={j} style={{ fontFamily: "var(--font-body)", marginBottom: "6px" }} dangerouslySetInnerHTML={{ __html: safeBold(item) }} />)}
        </ul>
      );
    } else if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, "")); i++; }
      i--;
      elements.push(
        <ol key={key++} style={{ margin: "12px 0 16px", paddingLeft: "20px" }}>
          {items.map((item, j) => <li key={j} style={{ fontFamily: "var(--font-body)", marginBottom: "6px" }} dangerouslySetInnerHTML={{ __html: safeBold(item) }} />)}
        </ol>
      );
    } else if (line.startsWith("✓ ")) {
      elements.push(<div key={key++} style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "8px" }}>
        <CheckCircle2 size={14} style={{ color: "var(--signal-green)", flexShrink: 0, marginTop: "4px" }} />
        <span style={{ fontFamily: "var(--font-body)", fontSize: "15px", color: "var(--text-reading)", lineHeight: 1.7 }}>{line.slice(2)}</span>
      </div>);
    } else {
      // Size / colour / line-height / margin all come from .aiml-article.
      elements.push(<p key={key++} style={{ fontFamily: "var(--font-body)" }} dangerouslySetInnerHTML={{ __html: safeBold(line) }} />);
    }
  }
  return elements;
}

export default function PostView() {
  const params = useParams();
  const slug   = params.slug as string;

  const [post,    setPost]    = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound,setNotFound]= useState(false);
  const [copied,  setCopied]  = useState(false);
  const [email,   setEmail]   = useState("");
  const [subbed,  setSubbed]  = useState(false);

  // Newsletter slide-in. Opens once the reader is ~55% through the article —
  // late enough that they've had a chance to judge whether the writing is
  // worth subscribing to, early enough that they haven't already left.
  // Dismissal and subscription are both remembered so it never nags.
  const [newsletterOpen, setNewsletterOpen] = useState(false);
  const promptedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("aiml-newsletter-dismissed")) return;

    function onScroll() {
      if (promptedRef.current) return;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      if (window.scrollY / scrollable < 0.55) return;
      promptedRef.current = true;
      setNewsletterOpen(true);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function dismissNewsletter() {
    setNewsletterOpen(false);
    // Remember for this browser. Deliberately not per-post — being asked on
    // every article you read is the thing that makes these obnoxious.
    try { localStorage.setItem("aiml-newsletter-dismissed", "1"); } catch { /* private mode */ }
  }

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

      // ── View counting ────────────────────────────────────────────────────
      // This used to write the same fact twice: increment blog_posts.view_count
      // AND append a row to post_view_events. Nothing in the app ever read the
      // event log — it was write-only — so every page load did two round trips
      // to record one view, and only one of them was ever looked at.
      //
      // It also counted every render. A refresh added a view, and React's
      // StrictMode double-invokes effects in development, so local reads
      // counted twice. The numbers in Blog Admin were inflated by an unknown
      // amount rather than being wrong in a predictable direction.
      //
      // Now: one write, once per post per browser session.
      const seenKey = `aiml-viewed-${post.id}`;
      let alreadySeen = false;
      try { alreadySeen = sessionStorage.getItem(seenKey) === "1"; } catch { /* private mode */ }

      if (!alreadySeen) {
        try { sessionStorage.setItem(seenKey, "1"); } catch { /* private mode */ }
        // RLS on blog_posts blocks anon/non-author UPDATEs, so this goes
        // through the SECURITY DEFINER RPC from migration 003. `as never`
        // bypasses the generated RPC type map, which doesn't know our function.
        await supabase.rpc("increment_post_view" as never, { p_post_id: post.id } as never);
      }
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
    // Show the confirmation briefly, then close the slide-in and stop it
    // reappearing on future articles.
    try { localStorage.setItem("aiml-newsletter-dismissed", "1"); } catch { /* private mode */ }
    setTimeout(() => setNewsletterOpen(false), 2200);
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /**
   * Open a network's share dialog in a popup.
   *
   * All three take the canonical URL and read the page's Open Graph tags to
   * build the preview card — so the quality of the shared post depends on
   * generateMetadata() in page.tsx, not on anything passed here. LinkedIn in
   * particular ignores any title/summary params you append to the URL; it has
   * only honoured og:title / og:description / og:image since 2021.
   */
  function shareTo(network: "linkedin" | "x" | "facebook") {
    if (typeof window === "undefined") return;
    const url   = window.location.href;
    const title = post?.title ?? "";

    const endpoints: Record<typeof network, string> = {
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      x:        `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    };

    window.open(
      endpoints[network],
      "_blank",
      "noopener,noreferrer,width=640,height=640",
    );
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
      <div className="aiml-post-header" style={{ borderBottom: "1px solid var(--border)", padding: "48px 32px 40px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(184,109,72,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: "860px", margin: "0 auto", position: "relative" }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE_EXPO }}>
            <Link href="/blog" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-tertiary)", textDecoration: "none", marginBottom: "28px", transition: "color 0.16s" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"}
            >
              <ArrowLeft size={13} /> Intelligence
            </Link>

            {/* Category + read time */}
            <div className="aiml-post-meta" style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--brand)", background: "rgba(184,109,72,0.08)", border: "1px solid rgba(184,109,72,0.20)", padding: "3px 10px", borderRadius: "100px" }}>
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
            <h1 className="aiml-post-title" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem,4.5vw,3.6rem)", letterSpacing: "-0.05em", lineHeight: 0.95, fontWeight: 400, color: "var(--text-primary)", marginBottom: "20px" }}>
              {post.title}
            </h1>

            {/* Excerpt */}
            <p className="aiml-post-excerpt" style={{ fontFamily: "var(--font-body)", fontSize: "17px", color: "var(--text-reading)", lineHeight: 1.7, maxWidth: "680px", marginBottom: "28px" }}>
              {post.excerpt}
            </p>

            {/* Author + share */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "var(--brand-strong)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 500, color: "#fff" }}>
                  {post.author_name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase()}
                </div>
                <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{post.author_name}</span>
              </div>
              {/* Share row. LinkedIn is first and labelled because it's the
                  primary distribution channel for this blog. The preview card
                  LinkedIn renders comes from the Open Graph tags emitted by
                  page.tsx (the server component) — without those it would show
                  a bare URL with no title or description. */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  onClick={() => shareTo("linkedin")}
                  title="Share on LinkedIn"
                  className="aiml-touch-target"
                  style={{
                    display: "flex", alignItems: "center", gap: "7px",
                    height: "34px", padding: "0 14px",
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: "8px", cursor: "pointer",
                    fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 500,
                    color: "var(--text-secondary)", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#0a66c2"; (e.currentTarget as HTMLElement).style.color = "#0a66c2"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
                >
                  <LinkedinIcon size={13} /> Share
                </button>

                {[
                  { label: "Share on X",  icon: XIcon,                         action: () => shareTo("x")        },
                  { label: "Share on Facebook", icon: FacebookIcon,            action: () => shareTo("facebook") },
                  { label: copied ? "Link copied" : "Copy link", icon: copied ? CheckCircle2 : Link2, action: copyLink },
                ].map(({ icon: Icon, label, action }) => (
                  <button key={label} onClick={action} title={label} aria-label={label}
                    className="aiml-touch-target"
                    style={{ width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer", color: "var(--text-tertiary)", transition: "all 0.15s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--brand)"; (e.currentTarget as HTMLElement).style.color = "var(--brand)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; }}
                  >
                    <Icon size={13} />
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Body */}
      <div className="aiml-post-body" style={{ maxWidth: "860px", margin: "0 auto", padding: "48px 32px 80px" }}>
        <div className="aiml-post-grid">

          {/* Article */}
          <motion.article className="aiml-article" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE_EXPO, delay: 0.1 }}>
            {/* Listen / AI summary. Sits above the article so it's the first
                thing a reader sees when deciding how to consume the piece. */}
            <ReaderControls slug={slug} content={post.content} />

            <PostBody content={post.content} />

            {/* Author bio */}
            {post.author_bio && (
              <div style={{ marginTop: "56px", paddingTop: "40px", borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                  <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "var(--brand-strong)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 500, color: "#fff", flexShrink: 0 }}>
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
          <motion.aside className="aiml-post-sidebar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease: EASE_EXPO, delay: 0.3 }}
            style={{ position: "sticky", top: "80px" }}
          >
            {/* Focus keyword */}
            {post.focus_keyword && (
              <div style={{ padding: "14px 16px", background: "rgba(184,109,72,0.05)", border: "1px solid rgba(184,109,72,0.15)", borderRadius: "10px", marginBottom: "20px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--brand)", marginBottom: "5px" }}>Focus Keyword</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>{post.focus_keyword}</div>
              </div>
            )}

            {/* Newsletter used to be a ~200px tall card here. It's been moved
                to a dismissible slide-in (see <NewsletterSlideIn/> below) —
                stacked on mobile it pushed the "All articles" link almost a
                full screen down. All that's left inline is a one-line prompt. */}
            {!subbed && (
              <button
                onClick={() => setNewsletterOpen(true)}
                style={{
                  display: "flex", alignItems: "center", gap: "7px", width: "100%",
                  padding: "10px 12px", background: "transparent",
                  border: "1px solid var(--border)", borderRadius: "9px",
                  cursor: "pointer", textAlign: "left",
                  fontFamily: "var(--font-body)", fontSize: "12px",
                  color: "var(--text-secondary)", transition: "border-color 0.16s, color 0.16s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--brand)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
              >
                <Rss size={12} color="var(--brand)" />
                Get the Weekly Brief
              </button>
            )}

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

      {/* ── Newsletter slide-in ─────────────────────────────────────────────
          Bottom-right card on desktop, full-width sheet on phones. Replaces
          the tall sidebar card that was eating most of a mobile screen. */}
      <AnimatePresence>
        {newsletterOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{    opacity: 0, y: 16 }}
            transition={{ duration: 0.32, ease: EASE_EXPO }}
            role="dialog"
            aria-label="Subscribe to the Weekly Brief"
            className="aiml-newsletter-slidein"
            style={{
              position: "fixed", right: "20px", bottom: "20px", zIndex: 120,
              width: "320px", maxWidth: "calc(100vw - 40px)",
              padding: "16px 18px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "14px",
              boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
            }}
          >
            <button
              onClick={dismissNewsletter}
              aria-label="Dismiss"
              style={{
                position: "absolute", top: "10px", right: "10px",
                width: "26px", height: "26px", display: "flex",
                alignItems: "center", justifyContent: "center",
                background: "transparent", border: "none", borderRadius: "6px",
                cursor: "pointer", color: "var(--text-tertiary)",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"}
            >
              <X size={14} />
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "6px" }}>
              <Rss size={12} color="var(--brand)" />
              <span style={{ fontFamily: "var(--font-body)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                Weekly Brief
              </span>
            </div>

            {subbed ? (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-body)", fontSize: "12.5px", color: "var(--signal-green)", paddingTop: "4px" }}>
                <CheckCircle2 size={13} /> Subscribed — thanks.
              </div>
            ) : (
              <>
                <p style={{ fontFamily: "var(--font-body)", fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 12px", paddingRight: "18px" }}>
                  SEO &amp; GEO intelligence every Tuesday.
                </p>
                <form onSubmit={handleSubscribe} style={{ display: "flex", gap: "6px" }}>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com" required
                    style={{
                      flex: 1, minWidth: 0, padding: "9px 11px",
                      fontFamily: "var(--font-body)", fontSize: "12.5px",
                      color: "var(--text-primary)", background: "var(--card)",
                      border: "1px solid var(--border)", borderRadius: "8px",
                      outline: "none", boxSizing: "border-box" as const,
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
                    onBlur={e =>  e.currentTarget.style.borderColor = "var(--border)"}
                  />
                  <button
                    type="submit"
                    style={{
                      flexShrink: 0, padding: "9px 14px",
                      fontFamily: "var(--font-body)", fontSize: "12.5px", fontWeight: 500,
                      color: "#fff", background: "var(--brand-strong)",
                      border: "none", borderRadius: "8px", cursor: "pointer",
                      transition: "opacity 0.16s",
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
                  >
                    Join
                  </button>
                </form>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 560px) {
          .aiml-newsletter-slidein {
            right: 12px !important;
            left: 12px !important;
            bottom: 12px !important;
            width: auto !important;
            max-width: none !important;
          }
        }
      `}</style>
    </div>
  );
}
