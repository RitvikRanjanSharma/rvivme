"use client";

// app/dashboard/blog/page.tsx
// =============================================================================
// AI Marketing Labs — Blog Admin
// Real Supabase CRUD · TipTap rich text editor · SEO fields · Publish controls
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Eye, Edit3, Trash2, Search, Zap, ExternalLink,
  Globe2, Lock, Calendar, Archive, CheckCircle2,
  AlertCircle, RefreshCw, X, Tag, Clock, BarChart3,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { RichTextEditor } from "./editor";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type PostStatus   = "draft" | "scheduled" | "published" | "archived";
type PostCategory =
  | "seo_strategy" | "geo_optimisation" | "technical_seo"
  | "content_marketing" | "business_insights" | "platform_updates"
  | "case_studies" | "industry_news";

interface BlogPost {
  id:                 string;
  author_id:          string;
  title:              string;
  slug:               string;
  excerpt:            string;
  content:            string;
  category:           PostCategory;
  status:             PostStatus;
  focus_keyword:      string | null;
  meta_title:         string | null;
  meta_description:   string | null;
  author_name:        string;
  read_time_minutes:  number;
  view_count:         number;
  featured:           boolean;
  published_at:       string | null;
  updated_at:         string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const SP = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const;
function pv(delay = 0) {
  return { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { ...SP, delay } } };
}

function slugify(text: string): string {
  return text.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function estimateReadTime(html: string): number {
  const text = html.replace(/<[^>]*>/g, "");
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function categoryLabel(id: string): string {
  const map: Record<string, string> = {
    seo_strategy: "SEO Strategy", geo_optimisation: "GEO", technical_seo: "Technical SEO",
    content_marketing: "Content", business_insights: "Business",
    platform_updates: "Platform", case_studies: "Case Studies", industry_news: "News",
  };
  return map[id] ?? id;
}

function statusConfig(s: PostStatus) {
  return {
    published: { label: "Published", color: "var(--signal-green)", bg: "rgba(0,230,118,0.10)",  border: "rgba(0,230,118,0.25)",  icon: Globe2    },
    scheduled: { label: "Scheduled", color: "var(--signal-amber)", bg: "rgba(255,171,0,0.10)", border: "rgba(255,171,0,0.25)", icon: Calendar  },
    draft:     { label: "Draft",     color: "var(--text-tertiary)", bg: "var(--card)",          border: "var(--border)",        icon: Lock      },
    archived:  { label: "Archived",  color: "var(--text-tertiary)", bg: "var(--card)",          border: "var(--border)",        icon: Archive   },
  }[s];
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", ...style }}>{children}</div>;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <label style={{ display: "block", fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>{label}</label>
      {children}
      {hint && <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>{hint}</div>}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: "100%", padding: "9px 12px", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--text-primary)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "7px", outline: "none", transition: "border-color 0.18s", boxSizing: "border-box" as const }}
      onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
      onBlur={e =>  e.currentTarget.style.borderColor = "var(--border)"}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{ width: "100%", padding: "9px 12px", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--text-primary)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "7px", outline: "none", transition: "border-color 0.18s", resize: "vertical", boxSizing: "border-box" as const, lineHeight: 1.6 }}
      onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
      onBlur={e =>  e.currentTarget.style.borderColor = "var(--border)"}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI strip
// ─────────────────────────────────────────────────────────────────────────────
function BlogKpis({ posts, brandColor }: { posts: BlogPost[]; brandColor: string }) {
  const published  = posts.filter(p => p.status === "published");
  const drafts     = posts.filter(p => p.status === "draft");
  const totalViews = published.reduce((s, p) => s + p.view_count, 0);
  const kpis = [
    { label: "Total Posts",    value: posts.length,     color: brandColor              },
    { label: "Published",      value: published.length, color: "var(--signal-green)"  },
    { label: "Drafts",         value: drafts.length,    color: "var(--signal-amber)"  },
    { label: "Total Views",    value: totalViews,       color: brandColor              },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }}>
      {kpis.map((k, i) => (
        <motion.div key={k.label} variants={pv(0.08 + i * 0.06)} initial="hidden" animate="visible">
          <Panel style={{ padding: "16px 18px" }}>
            <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "24px", fontWeight: 500, color: k.color, letterSpacing: "-0.02em", lineHeight: 1, marginBottom: "4px" }}>{k.value.toLocaleString()}</div>
            <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>{k.label}</div>
          </Panel>
        </motion.div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Posts table
// ─────────────────────────────────────────────────────────────────────────────
function PostsTable({ posts, brandColor, onEdit, onDelete, onStatusChange }: {
  posts:          BlogPost[];
  brandColor:     string;
  onEdit:         (post: BlogPost) => void;
  onDelete:       (id: string) => void;
  onStatusChange: (id: string, status: PostStatus) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PostStatus | "all">("all");

  const filtered = posts.filter(p => {
    const matchQuery  = !query || p.title.toLowerCase().includes(query.toLowerCase()) || (p.focus_keyword ?? "").toLowerCase().includes(query.toLowerCase());
    const matchFilter = filter === "all" || p.status === filter;
    return matchQuery && matchFilter;
  });

  return (
    <motion.div variants={pv(0.24)} initial="hidden" animate="visible">
      <Panel>
        {/* Table header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 20px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: "200px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "7px", padding: "8px 12px" }}>
            <Search size={13} color="var(--text-tertiary)" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search posts..." style={{ background: "transparent", border: "none", outline: "none", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--text-primary)", width: "100%" }} />
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {(["all", "published", "draft", "scheduled", "archived"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", padding: "5px 10px", borderRadius: "5px", border: `1px solid ${filter === f ? brandColor : "var(--border)"}`, background: filter === f ? `rgba(var(--brand-rgb),0.10)` : "transparent", color: filter === f ? brandColor : "var(--text-tertiary)", cursor: "pointer", letterSpacing: "0.06em", textTransform: "capitalize" }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-tertiary)", fontFamily: "var(--font-dm-mono), monospace", fontSize: "12px" }}>
            {posts.length === 0 ? "No posts yet. Create your first post." : "No posts match your search."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["Title", "Status", "Category", "Keyword", "Published", "Views", "Actions"].map(h => (
                    <th key={h} style={{ borderBottom: "1px solid var(--border)", padding: "10px 14px", textAlign: "left", fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((post, i) => {
                  const sc = statusConfig(post.status);
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={post.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                    >
                      <td style={{ padding: "14px", maxWidth: "280px" }}>
                        <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "2px" }}>{post.title || "Untitled"}</div>
                        <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)" }}>{post.slug}</div>
                      </td>
                      <td style={{ padding: "14px", whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: sc.color, background: sc.bg, border: `1px solid ${sc.border}`, padding: "3px 8px", borderRadius: "100px", letterSpacing: "0.06em" }}>
                          <StatusIcon size={9} />{sc.label}
                        </span>
                      </td>
                      <td style={{ padding: "14px", whiteSpace: "nowrap" }}>
                        <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)" }}>{categoryLabel(post.category)}</span>
                      </td>
                      <td style={{ padding: "14px", maxWidth: "160px" }}>
                        <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{post.focus_keyword ?? "—"}</span>
                      </td>
                      <td style={{ padding: "14px", whiteSpace: "nowrap" }}>
                        <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-secondary)" }}>{formatDate(post.published_at)}</span>
                      </td>
                      <td style={{ padding: "14px" }}>
                        <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-primary)", fontWeight: 500 }}>{post.view_count.toLocaleString()}</span>
                      </td>
                      <td style={{ padding: "14px" }}>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <button onClick={() => onEdit(post)} title="Edit post" style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", color: "var(--text-secondary)", transition: "all 0.15s" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = brandColor; (e.currentTarget as HTMLElement).style.color = brandColor; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
                          ><Edit3 size={12} /></button>

                          {post.status === "published" && (
                            <Link href={`/blog/${post.slug}`} target="_blank" title="View post" style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text-secondary)", transition: "all 0.15s", textDecoration: "none" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--signal-green)"; (e.currentTarget as HTMLElement).style.color = "var(--signal-green)"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
                            ><ExternalLink size={12} /></Link>
                          )}

                          {post.status === "draft" && (
                            <button onClick={() => onStatusChange(post.id, "published")} title="Publish" style={{ display: "flex", alignItems: "center", gap: "4px", fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--signal-green)", background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.25)", borderRadius: "6px", padding: "4px 8px", cursor: "pointer", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                              <Globe2 size={10} /> PUBLISH
                            </button>
                          )}

                          {post.status === "published" && (
                            <button onClick={() => onStatusChange(post.id, "draft")} title="Unpublish" style={{ display: "flex", alignItems: "center", gap: "4px", fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "6px", padding: "4px 8px", cursor: "pointer", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                              <Lock size={10} /> UNPUBLISH
                            </button>
                          )}

                          <button onClick={() => { if (window.confirm("Delete this post? This cannot be undone.")) onDelete(post.id); }} title="Delete" style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid transparent", borderRadius: "6px", cursor: "pointer", color: "var(--text-tertiary)", transition: "all 0.15s" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,23,68,0.3)"; (e.currentTarget as HTMLElement).style.color = "var(--signal-red)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,23,68,0.08)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                          ><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Post editor modal
// ─────────────────────────────────────────────────────────────────────────────
function PostEditor({ post, onClose, onSaved, brandColor }: {
  post:       BlogPost | null; // null = new post
  onClose:    () => void;
  onSaved:    () => void;
  brandColor: string;
}) {
  const isNew = !post;

  const [title,           setTitle]           = useState(post?.title           ?? "");
  const [slug,            setSlug]            = useState(post?.slug            ?? "");
  const [excerpt,         setExcerpt]         = useState(post?.excerpt         ?? "");
  const [content,         setContent]         = useState(post?.content         ?? "");
  const [category,        setCategory]        = useState<PostCategory>(post?.category ?? "seo_strategy");
  const [focusKeyword,    setFocusKeyword]    = useState(post?.focus_keyword   ?? "");
  const [metaTitle,       setMetaTitle]       = useState(post?.meta_title      ?? "");
  const [metaDescription, setMetaDescription] = useState(post?.meta_description ?? "");
  const [featured,        setFeatured]        = useState(post?.featured        ?? false);
  const [status,          setStatus]          = useState<PostStatus>(post?.status ?? "draft");
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [saved,           setSaved]           = useState(false);
  const [slugManual,      setSlugManual]      = useState(!!post?.slug);

  // Auto-generate slug from title
  useEffect(() => {
    if (!slugManual && title) setSlug(slugify(title));
  }, [title, slugManual]);

  const CATEGORIES: { value: PostCategory; label: string }[] = [
    { value: "seo_strategy",      label: "SEO Strategy"     },
    { value: "geo_optimisation",  label: "GEO Optimisation" },
    { value: "technical_seo",     label: "Technical SEO"    },
    { value: "content_marketing", label: "Content Marketing"},
    { value: "business_insights", label: "Business Insights"},
    { value: "platform_updates",  label: "Platform Updates" },
    { value: "case_studies",      label: "Case Studies"     },
    { value: "industry_news",     label: "Industry News"    },
  ];

  async function handleSave(publishStatus?: PostStatus) {
    setSaving(true);
    setError(null);
    const targetStatus = publishStatus ?? status;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const readTime = estimateReadTime(content);
      const payload = {
        title:              title.trim(),
        slug:               slug.trim(),
        excerpt:            excerpt.trim(),
        content,
        category,
        status:             targetStatus,
        focus_keyword:      focusKeyword.trim() || null,
        meta_title:         metaTitle.trim()    || null,
        meta_description:   metaDescription.trim() || null,
        featured,
        read_time_minutes:  readTime,
        author_name:        "AI Marketing Labs Editorial",
        published_at:       targetStatus === "published"
          ? (post?.published_at ?? new Date().toISOString())
          : post?.published_at ?? null,
        updated_at:         new Date().toISOString(),
      };

      if (isNew) {
        const { error: insertErr } = await supabase
          .from("blog_posts")
          .insert({ ...payload, author_id: user.id } as never);
        if (insertErr) throw insertErr;
      } else {
        const { error: updateErr } = await supabase
          .from("blog_posts")
          .update(payload as never)
          .eq("id", post.id);
        if (updateErr) throw updateErr;
      }

      setSaved(true);
      setStatus(targetStatus);
      setTimeout(() => { setSaved(false); onSaved(); onClose(); }, 1000);
    } catch (e: any) {
      setError(e.message ?? "Failed to save post.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={SP}
        style={{ width: "100%", maxWidth: "900px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", overflow: "hidden", marginBottom: "24px" }}
      >
        {/* Modal header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
          <div>
            <div style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "16px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              {isNew ? "New Post" : "Edit Post"}
            </div>
            <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.06em", marginTop: "2px" }}>
              {isNew ? "CREATING NEW DRAFT" : `EDITING · ${post?.slug}`}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Status badge */}
            <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: statusConfig(status).color, background: statusConfig(status).bg, border: `1px solid ${statusConfig(status).border}`, padding: "3px 10px", borderRadius: "100px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {statusConfig(status).label}
            </span>
            <button onClick={onClose} style={{ width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--border)", borderRadius: "7px", cursor: "pointer", color: "var(--text-secondary)" }}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", minHeight: "600px" }}>
          {/* Main content area */}
          <div style={{ padding: "24px", borderRight: "1px solid var(--border)" }}>
            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "rgba(255,23,68,0.08)", border: "1px solid rgba(255,23,68,0.25)", borderRadius: "8px", marginBottom: "16px" }}>
                <AlertCircle size={13} color="var(--signal-red)" />
                <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", color: "var(--signal-red)" }}>{error}</span>
              </div>
            )}

            <Field label="Post Title">
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Enter post title..."
                style={{ width: "100%", padding: "10px 12px", fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "7px", outline: "none", transition: "border-color 0.18s", boxSizing: "border-box" as const, letterSpacing: "-0.03em" }}
                onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
                onBlur={e =>  e.currentTarget.style.borderColor = "var(--border)"}
              />
            </Field>

            <Field label="URL Slug" hint="Auto-generated from title. Edit to customise.">
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>/blog/</span>
                <input value={slug} onChange={e => { setSlug(e.target.value); setSlugManual(true); }} placeholder="post-slug"
                  style={{ flex: 1, padding: "8px 10px", fontFamily: "var(--font-dm-mono), monospace", fontSize: "12px", color: "var(--text-primary)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "7px", outline: "none", transition: "border-color 0.18s" }}
                  onFocus={e => e.currentTarget.style.borderColor = "var(--brand)"}
                  onBlur={e =>  e.currentTarget.style.borderColor = "var(--border)"}
                />
              </div>
            </Field>

            <Field label="Excerpt" hint="A short summary shown on the blog index page. 1–2 sentences.">
              <Textarea value={excerpt} onChange={setExcerpt} placeholder="Brief summary of this post..." rows={2} />
            </Field>

            <Field label="Content">
              <RichTextEditor content={content} onChange={setContent} brandColor={brandColor} placeholder="Start writing your post..." />
            </Field>
          </div>

          {/* Sidebar */}
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto" }}>

            {/* Publish actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                onClick={() => handleSave("published")}
                disabled={saving || !title || !slug}
                style={{ width: "100%", padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 700, color: "#fff", background: (saving || !title || !slug) ? "var(--muted)" : `linear-gradient(135deg, var(--signal-green), #00b060)`, border: "none", borderRadius: "8px", cursor: (saving || !title || !slug) ? "not-allowed" : "pointer", transition: "all 0.2s" }}
              >
                {saving ? <div style={{ width: "12px", height: "12px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> : saved ? <CheckCircle2 size={13} /> : <Globe2 size={13} />}
                {saved ? "Published!" : "Publish"}
              </button>
              <button
                onClick={() => handleSave("draft")}
                disabled={saving || !title || !slug}
                style={{ width: "100%", padding: "9px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "8px", cursor: (saving || !title || !slug) ? "not-allowed" : "pointer", transition: "all 0.18s" }}
              >
                <Lock size={12} /> Save Draft
              </button>
            </div>

            {/* Category */}
            <div>
              <label style={{ display: "block", fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>Category</label>
              <select value={category} onChange={e => setCategory(e.target.value as PostCategory)}
                style={{ width: "100%", padding: "9px 12px", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--text-primary)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "7px", outline: "none", cursor: "pointer" }}
              >
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            {/* SEO fields */}
            <div style={{ padding: "14px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "9px" }}>
              <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: brandColor, letterSpacing: "0.1em", marginBottom: "12px" }}>SEO SETTINGS</div>

              <Field label="Focus Keyword">
                <Input value={focusKeyword} onChange={setFocusKeyword} placeholder="primary keyword" />
              </Field>
              <Field label="Meta Title" hint={`${metaTitle.length}/60 chars`}>
                <Input value={metaTitle || title} onChange={setMetaTitle} placeholder="SEO title (defaults to post title)" />
              </Field>
              <Field label="Meta Description" hint={`${metaDescription.length}/160 chars`}>
                <Textarea value={metaDescription} onChange={setMetaDescription} placeholder="SEO description..." rows={3} />
              </Field>
            </div>

            {/* Options */}
            <div style={{ padding: "14px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "9px" }}>
              <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.1em", marginBottom: "12px" }}>OPTIONS</div>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)} style={{ width: "14px", height: "14px", accentColor: brandColor }} />
                <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--text-secondary)" }}>Featured post</span>
              </label>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function BlogAdminPage() {
  const [brandColor, setBrandColor] = useState("#3b82f6");
  const [posts,      setPosts]      = useState<BlogPost[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [editPost,   setEditPost]   = useState<BlogPost | null | "new">(null);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("rvivme-brand");
    if (stored) setBrandColor(stored);
  }, []);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Sign in to manage posts."); setLoading(false); return; }

      const { data, error: dbErr } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("author_id", user.id)
        .order("updated_at", { ascending: false });

      if (dbErr) throw dbErr;
      setPosts((data ?? []) as BlogPost[]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  async function handleDelete(id: string) {
    const { error: deleteErr } = await supabase.from("blog_posts").delete().eq("id", id);
    if (!deleteErr) setPosts(prev => prev.filter(p => p.id !== id));
  }

  async function handleStatusChange(id: string, newStatus: PostStatus) {
    const { error: updateErr } = await supabase
      .from("blog_posts")
      .update({
        status:       newStatus,
        published_at: newStatus === "published" ? new Date().toISOString() : undefined,
      } as never)
      .eq("id", id);
    if (!updateErr) setPosts(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "32px 24px 80px", maxWidth: "1280px", margin: "0 auto" }}>

      {/* Header */}
      <motion.div variants={pv(0)} initial="hidden" animate="visible" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "clamp(1.5rem,3vw,2rem)", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1, marginBottom: "6px" }}>Blog Admin</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
              {posts.filter(p => p.status === "published").length} PUBLISHED · {posts.filter(p => p.status === "draft").length} DRAFTS
            </span>
            <Link href="/blog" target="_blank" style={{ display: "flex", alignItems: "center", gap: "4px", fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: brandColor, textDecoration: "none", letterSpacing: "0.06em" }}>
              <ExternalLink size={10} /> VIEW PUBLIC BLOG
            </Link>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={loadPosts} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 14px", fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-secondary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer", letterSpacing: "0.06em" }}>
            <RefreshCw size={11} style={{ animation: loading ? "spin 0.7s linear infinite" : "none" }} /> REFRESH
          </button>
          <button onClick={() => setEditPost("new")} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "10px 18px", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 700, color: "#fff", background: `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 60%, #000))`, border: "none", borderRadius: "9px", cursor: "pointer", boxShadow: "0 0 18px var(--brand-glow)", transition: "all 0.2s" }}>
            <Plus size={14} strokeWidth={2.5} /> New Post
          </button>
        </div>
      </motion.div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", background: "rgba(255,171,0,0.08)", border: "1px solid rgba(255,171,0,0.25)", borderRadius: "8px", marginBottom: "20px" }}>
          <AlertCircle size={14} color="var(--signal-amber)" />
          <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", color: "var(--signal-amber)" }}>{error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {[1,2,3].map(i => <div key={i} style={{ height: "60px", background: "linear-gradient(90deg, var(--card) 25%, var(--muted) 50%, var(--card) 75%)", backgroundSize: "200% 100%", borderRadius: "12px", animation: "shimmer 1.4s ease-in-out infinite" }} />)}
        </div>
      ) : (
        <>
          <BlogKpis posts={posts} brandColor={brandColor} />
          <PostsTable posts={posts} brandColor={brandColor} onEdit={p => setEditPost(p)} onDelete={handleDelete} onStatusChange={handleStatusChange} />
        </>
      )}

      <AnimatePresence>
        {editPost !== null && (
          <PostEditor
            post={editPost === "new" ? null : editPost as BlogPost}
            onClose={() => setEditPost(null)}
            onSaved={loadPosts}
            brandColor={brandColor}
          />
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>
    </div>
  );
}
