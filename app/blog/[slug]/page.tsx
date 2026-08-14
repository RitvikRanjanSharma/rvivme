// app/blog/[slug]/page.tsx
// =============================================================================
// AI Marketing Lab — Blog Post (server shell)
//
// This file exists to emit per-post Open Graph / Twitter card metadata. Those
// tags MUST be present in the server-rendered HTML: LinkedIn, Slack, X,
// WhatsApp and friends fetch the URL with a plain HTTP crawler that does not
// execute JavaScript. Previously this route was a single "use client"
// component, so a shared link had no title, description or image — LinkedIn
// rendered a bare URL.
//
// The interactive UI lives in ./post-view.tsx.
// =============================================================================

import type { Metadata } from "next";
import { resolveBaseUrl } from "@/lib/site";
import { createClient } from "@supabase/supabase-js";
import PostView from "./post-view";

// Public, anon-key read. Blog posts are world-readable, so no session needed —
// and using the cookie-aware client here would opt the route out of caching.
function publicSupabase() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, { auth: { persistSession: false } });
}

/** Absolute base URL — OG tags must use absolute URLs, relative ones are ignored. */
function baseUrl(): string {
  // Centralised: the apex used to be the fallback here, and it does not
  // serve the site — every RSS link and shared Open Graph URL landed on a
  // certificate warning. See lib/site.ts.
  return resolveBaseUrl();
}

type PostMeta = {
  title:            string;
  excerpt:          string | null;
  meta_title:       string | null;
  meta_description: string | null;
  author_name:      string | null;
  published_at:     string | null;
  updated_at:       string | null;
  category:         string | null;
  focus_keyword:    string | null;
  content:          string | null;
};

async function fetchPost(slug: string): Promise<PostMeta | null> {
  const sb = publicSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("blog_posts")
    .select("title, excerpt, meta_title, meta_description, author_name, published_at, updated_at, category, focus_keyword, content")
    .eq("slug", slug)
    .eq("status", "published")
    .single();
  return (data as PostMeta | null) ?? null;
}

/**
 * Pull the first image out of the post body to use as the social preview.
 * Falls back to the site-wide OG image when the post has none.
 * Data-URL images are skipped — crawlers can't fetch them.
 */
function firstImageFrom(content: string | null): string | null {
  if (!content) return null;
  const m = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  const src = m?.[1];
  if (!src || src.startsWith("data:")) return null;
  if (src.startsWith("http")) return src;
  if (src.startsWith("/"))    return `${baseUrl()}${src}`;
  return null;
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchPost(slug);
  const base = baseUrl();
  const url  = `${base}/blog/${slug}`;

  if (!post) {
    return {
      title: "Post not found — AI Marketing Lab",
      robots: { index: false, follow: true },
      alternates: { canonical: url },
    };
  }

  const title       = post.meta_title       || post.title;
  const description = post.meta_description || post.excerpt || "";
  // /og-default.png never existed, so posts without an inline image shared with
  // a broken preview. app/opengraph-image.tsx generates this route at request
  // time — there is no file to forget to commit.
  const image       = firstImageFrom(post.content) ?? `${base}/opengraph-image`;

  return {
    title,
    description,
    alternates: { canonical: url },
    // openGraph.type "article" is what makes LinkedIn show the byline and
    // published date rather than treating it as a generic website card.
    openGraph: {
      type:        "article",
      url,
      title,
      description,
      siteName:    "AI Marketing Lab",
      locale:      "en_GB",
      images:      [{ url: image, width: 1200, height: 630, alt: post.title }],
      publishedTime: post.published_at ?? undefined,
      modifiedTime:  post.updated_at   ?? undefined,
      authors:       post.author_name ? [post.author_name] : undefined,
    },
    twitter: {
      card:        "summary_large_image",
      title,
      description,
      images:      [image],
    },
    keywords: post.focus_keyword ? [post.focus_keyword] : undefined,
    authors:  post.author_name ? [{ name: post.author_name }] : undefined,
  };
}

export default function BlogPostPage() {
  // PostView reads the slug from useParams and fetches client-side, which keeps
  // the existing view-count and share behaviour unchanged.
  return <PostView />;
}
