"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Link2 } from "lucide-react";
import { supabase, type Database as AppDatabase } from "@/lib/supabase";

type BlogPost = AppDatabase["public"]["Tables"]["blog_posts"]["Row"];

function formatDate(value: string | null) {
  if (!value) return "Draft";
  return new Date(value).toLocaleDateString("en-GB", { dateStyle: "medium" });
}

function renderBlocks(content: string) {
  return content
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block, index) => {
      if (block.startsWith("## ")) {
        return (
          <h2 key={index} style={{ fontFamily: "var(--font-display)", fontSize: "1.9rem", letterSpacing: "-0.05em", margin: "28px 0 12px" }}>
            {block.slice(3)}
          </h2>
        );
      }

      if (block.startsWith("### ")) {
        return (
          <h3 key={index} style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", letterSpacing: "-0.04em", margin: "24px 0 10px" }}>
            {block.slice(4)}
          </h3>
        );
      }

      if (block.split("\n").every((line) => line.startsWith("- "))) {
        return (
          <ul key={index} style={{ color: "var(--text-secondary)", lineHeight: 1.8, paddingLeft: "20px" }}>
            {block.split("\n").map((line) => (
              <li key={line}>{line.slice(2)}</li>
            ))}
          </ul>
        );
      }

      return (
        <p key={index} style={{ color: "var(--text-secondary)", lineHeight: 1.9, margin: "0 0 16px" }}>
          {block}
        </p>
      );
    });
}

export default function BlogPostPage() {
  const params = useParams();
  const slug = useMemo(() => {
    return typeof params.slug === "string" ? params.slug : Array.isArray(params.slug) ? params.slug[0] : "";
  }, [params.slug]);

  const [copied, setCopied] = useState(false);
  const [post, setPost] = useState<BlogPost | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPost() {
      const { data } = await supabase.from("blog_posts").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
      const primaryPost = data as BlogPost | null;
      setPost(primaryPost);

      if (primaryPost) {
        const { data: related } = await supabase
          .from("blog_posts")
          .select("*")
          .eq("status", "published")
          .neq("slug", slug)
          .order("published_at", { ascending: false })
          .limit(3);
        setRelatedPosts((related ?? []) as BlogPost[]);
      }

      setLoading(false);
    }

    if (slug) {
      void loadPost();
    }
  }, [slug]);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return <div style={{ margin: "0 auto", maxWidth: "960px", padding: "48px 24px 80px" }}>Loading post...</div>;
  }

  if (!post) {
    return <div style={{ margin: "0 auto", maxWidth: "960px", padding: "48px 24px 80px" }}>Post not found.</div>;
  }

  return (
    <div style={{ margin: "0 auto", maxWidth: "960px", padding: "48px 24px 80px" }}>
      <Link href="/blog" style={{ alignItems: "center", color: "var(--text-secondary)", display: "inline-flex", gap: "8px", marginBottom: "24px", textDecoration: "none" }}>
        <ArrowLeft size={16} />
        Back to blog
      </Link>

      <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
        <span style={{ background: "rgba(var(--brand-rgb), 0.12)", border: "1px solid rgba(var(--brand-rgb), 0.24)", borderRadius: "999px", color: "var(--brand)", fontSize: "0.75rem", padding: "4px 8px" }}>
          {post.category.replaceAll("_", " ")}
        </span>
        {post.featured ? (
          <span style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "999px", color: "var(--text-secondary)", fontSize: "0.75rem", padding: "4px 8px" }}>
            Featured
          </span>
        ) : null}
      </div>

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.2rem, 6vw, 4.2rem)", letterSpacing: "-0.07em", margin: 0 }}>{post.title}</h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", lineHeight: 1.8, margin: "16px 0 0" }}>{post.excerpt}</p>

      <div style={{ color: "var(--text-tertiary)", display: "flex", gap: "16px", margin: "20px 0 32px", flexWrap: "wrap" }}>
        <span>{formatDate(post.published_at)}</span>
        <span>{post.read_time_minutes} min read</span>
        <span>{post.view_count.toLocaleString("en-GB")} views</span>
      </div>

      <button
        type="button"
        onClick={() => void copyLink()}
        style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "999px", color: "var(--text-secondary)", display: "flex", gap: "8px", marginBottom: "30px", padding: "10px 14px" }}
      >
        {copied ? <CheckCircle2 size={16} /> : <Link2 size={16} />}
        {copied ? "Copied" : "Copy link"}
      </button>

      <article>{renderBlocks(post.content)}</article>

      <section style={{ marginTop: "40px" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", letterSpacing: "-0.05em" }}>Related posts</h2>
        <div style={{ display: "grid", gap: "14px", marginTop: "16px" }}>
          {relatedPosts.map((item) => (
            <Link
              key={item.id}
              href={`/blog/${item.slug}`}
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "20px", color: "inherit", padding: "16px 18px", textDecoration: "none" }}
            >
              <div style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", letterSpacing: "-0.04em" }}>{item.title}</div>
              <div style={{ color: "var(--text-secondary)", marginTop: "6px" }}>{item.excerpt}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
