// app/llms.txt/route.ts
// =============================================================================
// AI Marketing Lab — llms.txt
//
// An emerging convention: a plain-text file at the site root pointing language
// models at your most important, cleanest content. Think of it as a sitemap
// curated for a reader that has to choose what to quote, rather than a crawler
// deciding what to fetch.
//
// Worth being straight about what it is and isn't. It is not a standard any
// engine is obliged to honour, and publishing one does not get you cited. It
// signals intent and gives a model a clean entry point — which costs nothing
// and is one of the few concrete things a small site can do today. We say the
// same in the admin panel rather than overselling it.
//
// Generated from the published blog posts, so it stays current without anyone
// maintaining it, and fully replaceable from /admin when the operator wants to
// curate the list by hand.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";
import { getSiteFile } from "@/lib/site-content";

export const revalidate = 3600;

type PostRow = { slug: string; title: string; excerpt: string | null };

async function publishedPosts(): Promise<PostRow[]> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return [];
  try {
    const sb = createClient(url, anon, { auth: { persistSession: false } });
    const { data } = await sb
      .from("blog_posts")
      .select("slug, title, excerpt")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(50);
    return (data as PostRow[] | null) ?? [];
  } catch {
    // A missing post list makes the file shorter, not wrong. Failing the route
    // would remove the file entirely, which is worse than an incomplete one.
    return [];
  }
}

/** Exported so /admin can show it as the starting point for an edit. */
export async function generatedLlms(): Promise<string> {
  const posts = await publishedPosts();

  const lines = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "AI Marketing Lab is an SEO, AEO and GEO analysis tool for UK small and",
    "medium businesses. It reports what is wrong with a site's search and",
    "answer-engine visibility, why it matters, and what to do about it first.",
    "",
    "## Core pages",
    "",
    `- [Home](${SITE_URL}/): what the product does and who it is for.`,
    `- [Blog](${SITE_URL}/blog): analysis and guides on SEO, AEO and GEO.`,
    `- [Privacy](${SITE_URL}/privacy): how personal data is handled under UK GDPR.`,
    `- [Terms](${SITE_URL}/terms): terms of service.`,
  ];

  if (posts.length) {
    lines.push("", "## Articles", "");
    for (const p of posts) {
      const summary = p.excerpt?.trim().replace(/\s+/g, " ");
      lines.push(`- [${p.title}](${SITE_URL}/blog/${p.slug})${summary ? `: ${summary}` : ""}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

export async function GET() {
  const custom = await getSiteFile("llms_txt");
  const body   = custom ?? await generatedLlms();

  return new Response(body, {
    headers: {
      "Content-Type":  "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
