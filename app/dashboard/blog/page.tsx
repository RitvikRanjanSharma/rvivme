"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, Search } from "lucide-react";
import { supabase, type Database as AppDatabase } from "@/lib/supabase";

type BlogPost = AppDatabase["public"]["Tables"]["blog_posts"]["Row"];
type PostStatus = BlogPost["status"];

function formatDate(value: string | null) {
  if (!value) return "Draft";
  return new Date(value).toLocaleDateString("en-GB", { dateStyle: "medium" });
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "20px", padding: "18px" }}>
      <p style={{ color: "var(--text-tertiary)", fontSize: "0.8rem", margin: 0 }}>{label}</p>
      <p style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", letterSpacing: "-0.05em", margin: "8px 0 0" }}>{value}</p>
    </div>
  );
}

export default function BlogAdminPage() {
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("rvivme-brand");
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBrandColor(stored);
    }
  }, []);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setStatusMessage("Sign in to manage posts.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.from("blog_posts").select("*").eq("author_id", user.id).order("updated_at", { ascending: false });
    if (error) {
      setStatusMessage(error.message);
    } else {
      setPosts((data ?? []) as BlogPost[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPosts();
  }, [loadPosts]);

  const filteredPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return posts;
    return posts.filter((post) => post.title.toLowerCase().includes(normalizedQuery) || (post.focus_keyword ?? "").toLowerCase().includes(normalizedQuery));
  }, [posts, query]);

  const stats = useMemo(() => {
    const published = posts.filter((post) => post.status === "published");
    const drafts = posts.filter((post) => post.status === "draft");
    const totalViews = published.reduce((sum, post) => sum + post.view_count, 0);

    return [
      { label: "Posts", value: posts.length.toString() },
      { label: "Published", value: published.length.toString() },
      { label: "Drafts", value: drafts.length.toString() },
      { label: "Views", value: totalViews.toLocaleString("en-GB") },
    ];
  }, [posts]);

  async function createDraft() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setStatusMessage("Sign in to create a post.");
      return;
    }

    const slug = `draft-${Date.now()}`;
    const { error } = await supabase.from("blog_posts").insert({
      author_id: user.id,
      title: "Untitled draft",
      slug,
      excerpt: "Add an excerpt for this draft.",
      content: "## Draft heading\n\nStart writing here.",
      status: "draft",
      category: "seo_strategy",
      author_name: "AI Marketing Labs Editorial",
    } as never);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setStatusMessage("Draft created.");
    void loadPosts();
  }

  async function cycleStatus(post: BlogPost) {
    const nextStatus: PostStatus = post.status === "draft" ? "published" : post.status === "published" ? "archived" : "draft";
    const { error } = await supabase.from("blog_posts").update({ status: nextStatus } as never).eq("id", post.id);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setStatusMessage(`Post moved to ${nextStatus}.`);
    void loadPosts();
  }

  return (
    <div style={{ margin: "0 auto", maxWidth: "1280px", padding: "40px 24px 80px" }}>
      <div style={{ alignItems: "end", display: "flex", flexWrap: "wrap", gap: "18px", justifyContent: "space-between", marginBottom: "28px" }}>
        <div>
          <p style={{ color: "var(--brand)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", margin: 0, textTransform: "uppercase" }}>
            Dashboard blog
          </p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 5vw, 3.6rem)", letterSpacing: "-0.06em", margin: "10px 0 0" }}>
            Real blog post management.
          </h1>
        </div>

        <button
          type="button"
          onClick={() => void createDraft()}
          style={{ alignItems: "center", background: "linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 55%, #081018))", border: "none", borderRadius: "999px", color: "#fff", display: "flex", gap: "8px", padding: "12px 16px" }}
        >
          <Plus size={16} />
          New draft
        </button>
      </div>

      {statusMessage ? (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "18px", color: "var(--text-secondary)", marginBottom: "18px", padding: "14px 16px" }}>
          {statusMessage}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: "24px" }}>
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={loading ? "..." : stat.value} />
        ))}
      </div>

      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "24px", padding: "20px" }}>
        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "space-between", marginBottom: "18px" }}>
          <label style={{ alignItems: "center", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "999px", display: "flex", gap: "8px", padding: "10px 14px" }}>
            <Search size={15} color="var(--text-tertiary)" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search posts"
              style={{ background: "transparent", border: "none", color: "var(--text-primary)", outline: "none", width: "220px" }}
            />
          </label>
          <Link href="/blog" style={{ color: brandColor, textDecoration: "none" }}>
            View public blog
          </Link>
        </div>

        {loading ? (
          <div style={{ color: "var(--text-secondary)" }}>Loading posts...</div>
        ) : filteredPosts.length === 0 ? (
          <div style={{ color: "var(--text-secondary)" }}>No posts found for this account.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["Title", "Status", "Keyword", "Published", "Views", "Actions"].map((heading) => (
                    <th
                      key={heading}
                      style={{ borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", letterSpacing: "0.08em", padding: "12px 10px", textAlign: "left", textTransform: "uppercase" }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPosts.map((post) => (
                  <tr key={post.id}>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>
                      <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{post.title}</div>
                      <div style={{ color: "var(--text-tertiary)", fontSize: "0.85rem", marginTop: "4px" }}>{post.slug}</div>
                    </td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>{post.status}</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>{post.focus_keyword ?? "None"}</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>{formatDate(post.published_at)}</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>{post.view_count.toLocaleString("en-GB")}</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>
                      <div style={{ display: "flex", gap: "10px" }}>
                        <button type="button" onClick={() => void cycleStatus(post)} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "999px", color: "var(--text-secondary)", padding: "8px 12px" }}>
                          Cycle status
                        </button>
                        {post.status === "published" ? (
                          <Link href={`/blog/${post.slug}`} style={{ alignItems: "center", color: brandColor, display: "inline-flex", gap: "6px", textDecoration: "none" }}>
                            Open
                            <ExternalLink size={14} />
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
