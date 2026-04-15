// app/sitemap.ts
// =============================================================================
// AI Marketing Labs — Dynamic XML Sitemap
// Static routes + all published blog posts from Supabase
// Revalidates every 12 hours so new posts appear quickly
// =============================================================================

import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = "https://www.aimarketinglab.co.uk";

// Static public routes with priority weights
const STATIC_ROUTES = [
  { path: "/",         priority: 1.0,  changefreq: "weekly"  as const },
  { path: "/blog",     priority: 0.9,  changefreq: "daily"   as const },
];

export const revalidate = 43200; // 12 hours

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = STATIC_ROUTES.map(route => ({
    url:              `${BASE_URL}${route.path}`,
    lastModified:     new Date(),
    changeFrequency:  route.changefreq,
    priority:         route.priority,
  }));

  // Dynamic blog posts from Supabase
  let blogPages: MetadataRoute.Sitemap = [];

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: posts } = await supabase
      .from("blog_posts")
      .select("slug, updated_at, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false });

    if (posts) {
      blogPages = posts.map(post => ({
        url:             `${BASE_URL}/blog/${post.slug}`,
        lastModified:    new Date(post.updated_at ?? post.published_at ?? new Date()),
        changeFrequency: "monthly" as const,
        priority:        0.7,
      }));
    }
  } catch {
    // Silently skip blog posts if Supabase is unavailable
  }

  return [...staticPages, ...blogPages];
}