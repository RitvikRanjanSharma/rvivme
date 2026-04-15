"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Rss, Search } from "lucide-react";
import { supabase, type Database as AppDatabase } from "@/lib/supabase";

type BlogPost = AppDatabase["public"]["Tables"]["blog_posts"]["Row"];

function formatDate(value: string | null) {
  if (!value) return "Draft";
  return new Date(value).toLocaleDateString("en-GB", { dateStyle: "medium" });
}

export default function BlogIndexPage() {
  const [email, setEmail] = useState("");
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadPosts() {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("status", "published")
        .order("featured", { ascending: false })
        .order("published_at", { ascending: false });

      const publishedPosts = (data ?? []) as BlogPost[];

      if (error) {
        setStatusMessage(error.message);
      } else {
        setPosts(publishedPosts);
      }

      setLoading(false);
    }

    void loadPosts();
  }, []);

  const filteredPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return posts;

    return posts.filter((post) => {
      return (
        post.title.toLowerCase().includes(normalizedQuery) ||
        post.excerpt.toLowerCase().includes(normalizedQuery) ||
        (post.focus_keyword ?? "").toLowerCase().includes(normalizedQuery)
      );
    });
  }, [posts, query]);

  async function subscribe() {
    if (!email.includes("@")) {
      setStatusMessage("Enter a valid email address.");
      return;
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/newsletter_subscribers`, {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        email,
        source: "blog",
      }),
    });

    if (!response.ok) {
      setStatusMessage("Unable to save subscription right now.");
      return;
    }

    setSubscribed(true);
    setEmail("");
    setStatusMessage("Subscribed successfully.");
  }

  return (
    <div style={{ margin: "0 auto", maxWidth: "1280px", padding: "48px 24px 80px" }}>
      <div style={{ marginBottom: "30px" }}>
        <p style={{ color: "var(--brand)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", margin: 0, textTransform: "uppercase" }}>
          Blog
        </p>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.2rem, 6vw, 4.4rem)", letterSpacing: "-0.07em", margin: "10px 0 0" }}>
          Live editorial feed.
        </h1>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, margin: "14px 0 0", maxWidth: "60ch" }}>
          This page now reads from your `blog_posts` table instead of the old mock array. Published posts appear automatically.
        </p>
      </div>

      <div
        style={{
          alignItems: "center",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "999px",
          display: "flex",
          gap: "10px",
          marginBottom: "28px",
          padding: "12px 16px",
        }}
      >
        <Search size={16} color="var(--text-tertiary)" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search articles"
          style={{ background: "transparent", border: "none", color: "var(--text-primary)", outline: "none", width: "100%" }}
        />
      </div>

      {statusMessage ? (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "18px", color: "var(--text-secondary)", marginBottom: "18px", padding: "14px 16px" }}>
          {statusMessage}
        </div>
      ) : null}

      {loading ? (
        <div style={{ color: "var(--text-secondary)" }}>Loading posts...</div>
      ) : filteredPosts.length === 0 ? (
        <div style={{ color: "var(--text-secondary)" }}>No published posts found yet.</div>
      ) : (
        <div style={{ display: "grid", gap: "18px", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          {filteredPosts.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.slug}`}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "24px",
                color: "inherit",
                padding: "22px",
                textDecoration: "none",
              }}
            >
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
                {post.featured ? (
                  <span style={{ background: "rgba(var(--brand-rgb), 0.12)", border: "1px solid rgba(var(--brand-rgb), 0.24)", borderRadius: "999px", color: "var(--brand)", fontSize: "0.75rem", padding: "4px 8px" }}>
                    Featured
                  </span>
                ) : null}
                <span style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "999px", color: "var(--text-secondary)", fontSize: "0.75rem", padding: "4px 8px" }}>
                  {post.category.replaceAll("_", " ")}
                </span>
              </div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", letterSpacing: "-0.05em", margin: 0 }}>{post.title}</h2>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, margin: "12px 0 0" }}>{post.excerpt}</p>
              <div style={{ color: "var(--text-tertiary)", display: "flex", gap: "14px", marginTop: "18px" }}>
                <span>{formatDate(post.published_at)}</span>
                <span>{post.read_time_minutes} min read</span>
                <span>{post.view_count.toLocaleString("en-GB")} views</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <section
        style={{
          background: "linear-gradient(135deg, rgba(var(--brand-rgb),0.12), rgba(var(--brand-rgb),0.04))",
          border: "1px solid rgba(var(--brand-rgb),0.2)",
          borderRadius: "28px",
          marginTop: "40px",
          padding: "26px",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: "8px", marginBottom: "8px" }}>
          <Rss size={16} color="var(--brand)" />
          <span style={{ color: "var(--brand)", fontFamily: "var(--font-mono)", fontSize: "0.8rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Newsletter
          </span>
        </div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", letterSpacing: "-0.05em", margin: 0 }}>Subscribe for updates</h2>
        <p style={{ color: "var(--text-secondary)", margin: "10px 0 18px" }}>
          Inserts now go to `newsletter_subscribers`.
        </p>
        {subscribed ? (
          <div style={{ alignItems: "center", color: "#22c55e", display: "flex", gap: "8px" }}>
            <CheckCircle2 size={16} />
            Subscription saved.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="your@email.com"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "999px", color: "var(--text-primary)", flex: "1 1 280px", padding: "12px 16px" }}
            />
            <button
              type="button"
              onClick={() => void subscribe()}
              style={{ background: "linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 55%, #081018))", border: "none", borderRadius: "999px", color: "#fff", padding: "12px 18px" }}
            >
              Subscribe
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
