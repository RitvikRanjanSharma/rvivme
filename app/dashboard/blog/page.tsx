"use client";

// app/dashboard/blog/page.tsx
// =============================================================================
// AI Marketing Labs — Blog Admin Panel (Dashboard)
// Post management · SEO scoring · Publish controls · Analytics per post
// =============================================================================

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Plus, Eye, Edit3, Trash2, Search,
  TrendingUp, Clock, Tag, CheckCircle2, AlertCircle,
  Globe2, Lock, Calendar, BarChart3, Zap, ExternalLink,
  ChevronDown, Filter, RefreshCw, Archive,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type PostStatus = "draft" | "scheduled" | "published" | "archived";

interface AdminPost {
  id:             string;
  slug:           string;
  title:          string;
  category:       string;
  status:         PostStatus;
  read_time:      number;
  view_count:     number;
  focus_keyword:  string;
  seo_score:      number;
  published_at:   string | null;
  updated_at:     string;
  tags:           string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────────────────
const ADMIN_POSTS: AdminPost[] = [
  { id: "1", slug: "generative-engine-optimisation-enterprise-guide", title: "Generative Engine Optimisation: The Definitive Enterprise Guide for 2026", category: "geo_optimisation", status: "published", read_time: 14, view_count: 2841, focus_keyword: "generative engine optimisation", seo_score: 94, published_at: "2026-04-10", updated_at: "2026-04-12", tags: ["GEO", "AI Search"] },
  { id: "2", slug: "technical-seo-core-web-vitals-2026", title: "Core Web Vitals in 2026: What Has Changed and What Your Site Must Do Now", category: "technical_seo", status: "published", read_time: 9, view_count: 1204, focus_keyword: "core web vitals 2026", seo_score: 88, published_at: "2026-04-08", updated_at: "2026-04-08", tags: ["Technical SEO", "Google"] },
  { id: "3", slug: "hatfield-uk-business-digital-strategy-2026", title: "Hatfield UK Business District: A Digital Strategy Review for Q2 2026", category: "business_insights", status: "published", read_time: 7, view_count: 892, focus_keyword: "Hatfield UK business digital strategy", seo_score: 81, published_at: "2026-04-06", updated_at: "2026-04-07", tags: ["Hatfield UK", "Business"] },
  { id: "4", slug: "dataforseo-api-integration-seo-platforms", title: "How We Integrated DataForSEO to Power Real-Time Keyword Intelligence", category: "platform_updates", status: "published", read_time: 11, view_count: 674, focus_keyword: "DataForSEO API integration", seo_score: 91, published_at: "2026-04-04", updated_at: "2026-04-04", tags: ["DataForSEO", "AI Marketing Labs"] },
  { id: "5", slug: "topical-authority-content-clusters-guide", title: "Building Topical Authority: The Hub-and-Spoke Content Cluster Framework", category: "content_marketing", status: "scheduled", read_time: 12, view_count: 0, focus_keyword: "topical authority content clusters", seo_score: 87, published_at: "2026-04-18", updated_at: "2026-04-13", tags: ["Content Strategy", "SEO"] },
  { id: "6", slug: "competitor-backlink-gap-analysis-methodology", title: "Competitor Backlink Gap Analysis: A Systematic Methodology for Link Acquisition", category: "seo_strategy", status: "draft", read_time: 8, view_count: 0, focus_keyword: "competitor backlink gap analysis", seo_score: 72, published_at: null, updated_at: "2026-04-13", tags: ["Link Building"] },
  { id: "7", slug: "ai-overview-optimisation-schema-markup", title: "AI Overview Optimisation: How Schema Markup Increases Citation Probability by 34%", category: "geo_optimisation", status: "draft", read_time: 10, view_count: 0, focus_keyword: "AI overview optimisation schema markup", seo_score: 65, published_at: null, updated_at: "2026-04-12", tags: ["GEO", "Technical SEO"] },
  { id: "8", slug: "AI Marketing Labs-platform-case-study-organic-growth", title: "Case Study: 85% Organic Traffic Growth in 6 Months Using AI Marketing Labs Intelligence", category: "case_studies", status: "archived", read_time: 13, view_count: 3104, focus_keyword: "organic traffic growth case study", seo_score: 96, published_at: "2026-03-25", updated_at: "2026-04-01", tags: ["Case Study", "AI Marketing Labs"] },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const SP = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const;
function pv(delay = 0) {
  return { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { ...SP, delay } } };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function statusConfig(s: PostStatus): { label: string; color: string; bg: string; border: string; icon: React.ElementType } {
  return {
    published: { label: "Published", color: "var(--signal-green)", bg: "rgba(0,230,118,0.10)",  border: "rgba(0,230,118,0.25)",  icon: Globe2       },
    scheduled: { label: "Scheduled", color: "var(--signal-amber)", bg: "rgba(255,171,0,0.10)", border: "rgba(255,171,0,0.25)", icon: Calendar     },
    draft:     { label: "Draft",     color: "var(--text-tertiary)", bg: "var(--card)",          border: "var(--border)",         icon: Lock         },
    archived:  { label: "Archived",  color: "var(--text-tertiary)", bg: "var(--card)",          border: "var(--border)",         icon: Archive      },
  }[s];
}

function seoScoreColor(score: number): string {
  if (score >= 90) return "var(--signal-green)";
  if (score >= 75) return "var(--signal-amber)";
  if (score >= 60) return "var(--brand)";
  return "var(--signal-red)";
}

function categoryLabel(id: string): string {
  const map: Record<string, string> = {
    seo_strategy: "SEO Strategy", geo_optimisation: "GEO",
    technical_seo: "Technical SEO", content_marketing: "Content",
    business_insights: "Business", platform_updates: "Platform",
    case_studies: "Case Studies", industry_news: "News",
  };
  return map[id] ?? id;
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", ...style }}>{children}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI strip
// ─────────────────────────────────────────────────────────────────────────────
function BlogKpis({ posts, brandColor }: { posts: AdminPost[]; brandColor: string }) {
  const published = posts.filter(p => p.status === "published");
  const totalViews = published.reduce((s, p) => s + p.view_count, 0);
  const avgSeo = Math.round(posts.reduce((s, p) => s + p.seo_score, 0) / posts.length);
  const drafts = posts.filter(p => p.status === "draft").length;

  const kpis = [
    { label: "Total Posts",      value: posts.length,      suffix: "",  color: brandColor        },
    { label: "Published",        value: published.length,  suffix: "",  color: "var(--signal-green)" },
    { label: "Total Views",      value: totalViews,        suffix: "",  color: brandColor         },
    { label: "Avg SEO Score",    value: avgSeo,            suffix: "/100", color: seoScoreColor(avgSeo) },
    { label: "Drafts Pending",   value: drafts,            suffix: "",  color: "var(--signal-amber)" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", marginBottom: "24px" }}>
      {kpis.map((k, i) => (
        <motion.div key={k.label} variants={pv(0.08 + i * 0.06)} initial="hidden" animate="visible">
          <Panel style={{ padding: "16px 18px" }}>
            <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "24px", fontWeight: 500, color: k.color, letterSpacing: "-0.02em", lineHeight: 1, marginBottom: "4px" }}>
              {k.value.toLocaleString()}{k.suffix}
            </div>
            <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>
              {k.label}
            </div>
          </Panel>
        </motion.div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEO score bar
// ─────────────────────────────────────────────────────────────────────────────
function SeoBar({ score }: { score: number }) {
  const color = seoScoreColor(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ width: "44px", height: "4px", background: "var(--border)", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score}%`, background: color, borderRadius: "2px" }} />
      </div>
      <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color, fontWeight: 500, minWidth: "26px" }}>
        {score}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Post table
// ─────────────────────────────────────────────────────────────────────────────
function PostsTable({ posts, brandColor, onEdit, onDelete, onStatusChange }: {
  posts:          AdminPost[];
  brandColor:     string;
  onEdit:         (p: AdminPost) => void;
  onDelete:       (id: string) => void;
  onStatusChange: (id: string, status: PostStatus) => void;
}) {
  const [filter,  setFilter]  = useState<PostStatus | "all">("all");
  const [search,  setSearch]  = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);

  const filtered = posts
    .filter(p => filter === "all" || p.status === filter)
    .filter(p => search === "" || p.title.toLowerCase().includes(search.toLowerCase()) || p.focus_keyword.toLowerCase().includes(search.toLowerCase()));

  const statuses: (PostStatus | "all")[] = ["all", "published", "scheduled", "draft", "archived"];

  return (
    <motion.div variants={pv(0.3)} initial="hidden" animate="visible">
      <Panel>
        {/* Toolbar */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          {/* Status filters */}
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {statuses.map(s => {
              const active = filter === s;
              const count  = s === "all" ? posts.length : posts.filter(p => p.status === s).length;
              return (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  style={{
                    fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", fontWeight: 500,
                    color: active ? brandColor : "var(--text-tertiary)",
                    background: active ? `rgba(var(--brand-rgb),0.10)` : "transparent",
                    border: `1px solid ${active ? `rgba(var(--brand-rgb),0.25)` : "var(--border)"}`,
                    borderRadius: "5px", padding: "4px 10px", cursor: "pointer",
                    letterSpacing: "0.08em", textTransform: "uppercase", transition: "all 0.15s",
                  }}
                >
                  {s === "all" ? "All" : s} ({count})
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div style={{ display: "flex", alignItems: "center", gap: "7px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "7px", padding: "6px 12px" }}>
            <Search size={12} color="var(--text-tertiary)" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search posts..."
              style={{ background: "transparent", border: "none", outline: "none", fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", color: "var(--text-primary)", width: "160px" }}
            />
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Post Title", "Status", "Category", "Focus Keyword", "SEO Score", "Views", "Updated", "Actions"].map(h => (
                  <th key={h} style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", fontWeight: 500, color: "var(--text-tertiary)", letterSpacing: "0.12em", textTransform: "uppercase", padding: "10px 14px", textAlign: "left", borderBottom: "1px solid var(--border)", background: "var(--surface)", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((post, i) => {
                const sc = statusConfig(post.status);
                const StatusIcon = sc.icon;
                return (
                  <tr
                    key={post.id}
                    style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                  >
                    {/* Title */}
                    <td style={{ padding: "12px 14px", maxWidth: "300px" }}>
                      <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3, marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {post.title}
                      </div>
                      <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: "6px" }}>
                        <Clock size={9} />
                        {post.read_time} min
                        {post.tags.slice(0, 2).map(t => (
                          <span key={t} style={{ padding: "1px 5px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "3px", fontSize: "9px" }}>{t}</span>
                        ))}
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", fontWeight: 500, color: sc.color, background: sc.bg, border: `1px solid ${sc.border}`, padding: "3px 8px", borderRadius: "100px", letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                        <StatusIcon size={8} />
                        {sc.label}
                      </span>
                    </td>

                    {/* Category */}
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                        {categoryLabel(post.category)}
                      </span>
                    </td>

                    {/* Focus keyword */}
                    <td style={{ padding: "12px 14px", maxWidth: "180px" }}>
                      <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: brandColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                        {post.focus_keyword}
                      </span>
                    </td>

                    {/* SEO score */}
                    <td style={{ padding: "12px 14px" }}>
                      <SeoBar score={post.seo_score} />
                    </td>

                    {/* Views */}
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Eye size={10} color="var(--text-tertiary)" />
                        <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "12px", color: "var(--text-secondary)" }}>
                          {post.view_count.toLocaleString()}
                        </span>
                      </div>
                    </td>

                    {/* Updated */}
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                        {formatDate(post.updated_at)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                        {/* Edit */}
                        <button
                          onClick={() => onEdit(post)}
                          title="Edit"
                          style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", color: "var(--text-tertiary)", transition: "all 0.15s" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = brandColor; (e.currentTarget as HTMLElement).style.color = brandColor; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; }}
                        >
                          <Edit3 size={11} />
                        </button>

                        {/* Preview */}
                        {post.status === "published" && (
                          <Link
                            href={`/blog/${post.slug}`}
                            target="_blank"
                            title="View live"
                            style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text-tertiary)", transition: "all 0.15s", textDecoration: "none" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--signal-green)"; (e.currentTarget as HTMLElement).style.color = "var(--signal-green)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; }}
                          >
                            <ExternalLink size={11} />
                          </Link>
                        )}

                        {/* Publish / Unpublish */}
                        {post.status === "draft" && (
                          <button
                            onClick={() => onStatusChange(post.id, "published")}
                            title="Publish"
                            style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.25)", borderRadius: "6px", cursor: "pointer", color: "var(--signal-green)", transition: "all 0.15s" }}
                          >
                            <Globe2 size={11} />
                          </button>
                        )}

                        {/* Delete */}
                        {confirm === post.id ? (
                          <div style={{ display: "flex", gap: "3px" }}>
                            <button onClick={() => { onDelete(post.id); setConfirm(null); }} style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", color: "#fff", background: "var(--signal-red)", border: "none", borderRadius: "5px", padding: "4px 7px", cursor: "pointer", letterSpacing: "0.06em" }}>DEL</button>
                            <button onClick={() => setConfirm(null)} style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "9px", color: "var(--text-tertiary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "5px", padding: "4px 7px", cursor: "pointer" }}>NO</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirm(post.id)}
                            title="Delete"
                            style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", color: "var(--text-tertiary)", transition: "all 0.15s" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--signal-red)"; (e.currentTarget as HTMLElement).style.color = "var(--signal-red)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; }}
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
            SHOWING {filtered.length} OF {posts.length} POSTS
          </span>
        </div>
      </Panel>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// New/Edit post modal
// ─────────────────────────────────────────────────────────────────────────────
function PostModal({ post, onClose, onSave, brandColor }: {
  post:       AdminPost | null;
  onClose:    () => void;
  onSave:     (data: Partial<AdminPost>) => void;
  brandColor: string;
}) {
  const isNew = !post;
  const [title,    setTitle]    = useState(post?.title         ?? "");
  const [slug,     setSlug]     = useState(post?.slug          ?? "");
  const [keyword,  setKeyword]  = useState(post?.focus_keyword ?? "");
  const [category, setCategory] = useState(post?.category      ?? "seo_strategy");
  const [status,   setStatus]   = useState<PostStatus>(post?.status ?? "draft");
  const [tags,     setTags]     = useState(post?.tags.join(", ") ?? "");
  const [saving,   setSaving]   = useState(false);

  function autoSlug(t: string) {
    return t.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
  }

  async function handleSave() {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    onSave({ title, slug, focus_keyword: keyword, category, status, tags: tags.split(",").map(t => t.trim()).filter(Boolean) });
    setSaving(false);
    onClose();
  }

  const FIELD_STYLE = {
    width: "100%", padding: "9px 12px",
    fontFamily: "var(--font-inter), sans-serif", fontSize: "13px",
    color: "var(--text-primary)", background: "var(--card)",
    border: "1px solid var(--border)", borderRadius: "7px",
    outline: "none", boxSizing: "border-box" as const,
    transition: "border-color 0.18s",
  };

  const Label = ({ children }: { children: React.ReactNode }) => (
    <label style={{ display: "block", fontFamily: "var(--font-inter), sans-serif", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "5px" }}>
      {children}
    </label>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "24px" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ ...SP }}
        onClick={e => e.stopPropagation()}
        style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "28px", width: "100%", maxWidth: "560px", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "22px" }}>
          <div style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "16px", fontWeight: 800, color: "var(--text-primary)" }}>
            {isNew ? "New Post" : "Edit Post"}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: "18px", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <Label>Post Title *</Label>
            <input value={title} onChange={e => { setTitle(e.target.value); if (isNew) setSlug(autoSlug(e.target.value)); }} placeholder="Enter post title..." style={FIELD_STYLE}
              onFocus={e => (e.currentTarget.style.borderColor = brandColor)} onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")} />
          </div>

          <div>
            <Label>URL Slug *</Label>
            <input value={slug} onChange={e => setSlug(autoSlug(e.target.value))} placeholder="url-slug-here" style={{ ...FIELD_STYLE, fontFamily: "var(--font-dm-mono), monospace" }}
              onFocus={e => (e.currentTarget.style.borderColor = brandColor)} onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")} />
            <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
              Public URL: /blog/{slug || "your-slug"}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <Label>Category</Label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...FIELD_STYLE, cursor: "pointer" }}>
                {["seo_strategy", "geo_optimisation", "technical_seo", "content_marketing", "business_insights", "platform_updates", "case_studies", "industry_news"].map(c => (
                  <option key={c} value={c}>{c.replace("_", " ").replace(/^\w/, l => l.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Status</Label>
              <select value={status} onChange={e => setStatus(e.target.value as PostStatus)} style={{ ...FIELD_STYLE, cursor: "pointer" }}>
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div>
            <Label>Focus Keyword</Label>
            <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="primary target keyword" style={{ ...FIELD_STYLE, fontFamily: "var(--font-dm-mono), monospace" }}
              onFocus={e => (e.currentTarget.style.borderColor = brandColor)} onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")} />
          </div>

          <div>
            <Label>Tags (comma-separated)</Label>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="SEO, GEO, Content Strategy" style={FIELD_STYLE}
              onFocus={e => (e.currentTarget.style.borderColor = brandColor)} onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")} />
          </div>

          <div style={{ padding: "14px", background: `rgba(var(--brand-rgb),0.05)`, border: `1px solid rgba(var(--brand-rgb),0.15)`, borderRadius: "8px" }}>
            <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: brandColor, letterSpacing: "0.08em", marginBottom: "6px" }}>
              CONTENT EDITOR
            </div>
            <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              Full rich text editor integration (TipTap / MDX) would be connected here in production. The post body is stored in the <code style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px" }}>content</code> column of <code style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px" }}>blog_posts</code>.
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", paddingTop: "4px" }}>
            <button
              onClick={handleSave}
              disabled={!title || !slug}
              style={{ flex: 1, padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 700, color: "#fff", background: (!title || !slug) ? "var(--muted)" : `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 60%, #000))`, border: "none", borderRadius: "8px", cursor: (!title || !slug) ? "not-allowed" : "pointer", boxShadow: (!title || !slug) ? "none" : "0 0 16px var(--brand-glow)", transition: "all 0.2s" }}
            >
              {saving
                ? <div style={{ width: "12px", height: "12px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                : <><Zap size={13} strokeWidth={2.5} />{isNew ? "Create Post" : "Save Changes"}</>
              }
            </button>
            <button onClick={onClose} style={{ padding: "10px 16px", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer" }}>
              Cancel
            </button>
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
  const [posts,      setPosts]      = useState<AdminPost[]>(ADMIN_POSTS);
  const [editPost,   setEditPost]   = useState<AdminPost | null | "new">(null);

  useEffect(() => {
    const stored = localStorage.getItem("AI Marketing Labs-brand");
    if (stored) setBrandColor(stored);
  }, []);

  function handleDelete(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id));
  }

  function handleStatusChange(id: string, status: PostStatus) {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, status, published_at: status === "published" ? new Date().toISOString().slice(0, 10) : p.published_at } : p));
  }

  function handleSave(data: Partial<AdminPost>) {
    if (editPost === "new") {
      const newPost: AdminPost = {
        id:            String(Date.now()),
        slug:          data.slug ?? "",
        title:         data.title ?? "",
        category:      data.category ?? "seo_strategy",
        status:        data.status ?? "draft",
        read_time:     5,
        view_count:    0,
        focus_keyword: data.focus_keyword ?? "",
        seo_score:     60,
        published_at:  data.status === "published" ? new Date().toISOString().slice(0, 10) : null,
        updated_at:    new Date().toISOString().slice(0, 10),
        tags:          data.tags ?? [],
      };
      setPosts(prev => [newPost, ...prev]);
    } else if (editPost) {
      setPosts(prev => prev.map(p => p.id === editPost.id ? { ...p, ...data, updated_at: new Date().toISOString().slice(0, 10) } : p));
    }
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "32px 24px 80px", maxWidth: "1280px", margin: "0 auto" }}>

      {/* Header */}
      <motion.div variants={pv(0)} initial="hidden" animate="visible" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-syne), sans-serif", fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1, marginBottom: "6px" }}>
            Blog Admin
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
              {posts.filter(p => p.status === "published").length} PUBLISHED · {posts.filter(p => p.status === "draft").length} DRAFTS
            </span>
            <Link href="/blog" target="_blank" style={{ display: "flex", alignItems: "center", gap: "4px", fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: brandColor, textDecoration: "none", letterSpacing: "0.06em" }}>
              <ExternalLink size={10} /> VIEW PUBLIC BLOG
            </Link>
          </div>
        </div>

        <button
          onClick={() => setEditPost("new")}
          style={{ display: "flex", alignItems: "center", gap: "7px", padding: "10px 18px", fontFamily: "var(--font-inter), sans-serif", fontSize: "13px", fontWeight: 700, color: "#fff", background: `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 60%, #000))`, border: "none", borderRadius: "9px", cursor: "pointer", boxShadow: "0 0 18px var(--brand-glow)", transition: "all 0.2s" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 0 30px var(--brand-glow)"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 0 18px var(--brand-glow)"}
        >
          <Plus size={14} strokeWidth={2.5} />
          New Post
        </button>
      </motion.div>

      {/* KPIs */}
      <BlogKpis posts={posts} brandColor={brandColor} />

      {/* Posts table */}
      <PostsTable
        posts={posts}
        brandColor={brandColor}
        onEdit={setEditPost}
        onDelete={handleDelete}
        onStatusChange={handleStatusChange}
      />

      {/* Modal */}
      <AnimatePresence>
        {editPost !== null && (
          <PostModal
            post={editPost === "new" ? null : editPost as AdminPost}
            onClose={() => setEditPost(null)}
            onSave={handleSave}
            brandColor={brandColor}
          />
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
