// app/blog/rss.xml/route.ts
// =============================================================================
// AI Marketing Lab — RSS 2.0 feed for the public blog
//
// Serves every published post at /blog/rss.xml.
//
// Why this exists beyond "blogs have feeds":
//   * It's the input for automation bridges (IFTTT / Zapier / Make) that can
//     watch a feed and create a Blogger post from each new item. Blogger has
//     no native "import from RSS" — see docs in the cross-posting notes.
//   * Feed readers and aggregators.
//
// Content is emitted in <content:encoded> as CDATA so HTML posts survive
// intact; <description> carries the plain-text excerpt for readers that only
// render that.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { resolveBaseUrl } from "@/lib/site";

export const revalidate = 900; // 15 minutes — feeds don't need to be instant.

function baseUrl(): string {
  // Centralised: the apex used to be the fallback here, and it does not
  // serve the site — every RSS link and shared Open Graph URL landed on a
  // certificate warning. See lib/site.ts.
  return resolveBaseUrl();
}

/** Escape the five XML predefined entities for use in element text. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * CDATA can't contain the literal sequence "]]>". Split it across two sections
 * so the payload survives verbatim.
 */
function cdata(s: string): string {
  return `<![CDATA[${s.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

type FeedRow = {
  slug:         string;
  title:        string;
  excerpt:      string | null;
  content:      string | null;
  category:     string | null;
  author_name:  string | null;
  published_at: string | null;
  updated_at:   string | null;
};

export async function GET() {
  const base = baseUrl();
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let items: FeedRow[] = [];

  if (url && anon) {
    const sb = createClient(url, anon, { auth: { persistSession: false } });
    const { data } = await sb
      .from("blog_posts")
      .select("slug, title, excerpt, content, category, author_name, published_at, updated_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(50);
    items = (data as FeedRow[] | null) ?? [];
  }

  const lastBuild = items[0]?.published_at
    ? new Date(items[0].published_at).toUTCString()
    : new Date().toUTCString();

  const body = items.map(p => {
    const link = `${base}/blog/${p.slug}`;
    const date = p.published_at ? new Date(p.published_at).toUTCString() : "";
    return [
      "    <item>",
      `      <title>${xmlEscape(p.title)}</title>`,
      `      <link>${xmlEscape(link)}</link>`,
      // isPermaLink=false: the slug URL is stable, but we identify by it rather
      // than promising it resolves as a GUID.
      `      <guid isPermaLink="false">${xmlEscape(link)}</guid>`,
      date ? `      <pubDate>${date}</pubDate>` : "",
      p.author_name ? `      <dc:creator>${cdata(p.author_name)}</dc:creator>` : "",
      p.category ? `      <category>${xmlEscape(p.category)}</category>` : "",
      `      <description>${cdata(p.excerpt ?? "")}</description>`,
      p.content ? `      <content:encoded>${cdata(p.content)}</content:encoded>` : "",
      "    </item>",
    ].filter(Boolean).join("\n");
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AI Marketing Lab — Intelligence</title>
    <link>${xmlEscape(`${base}/blog`)}</link>
    <description>SEO, GEO and content strategy notes from AI Marketing Lab.</description>
    <language>en-GB</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${xmlEscape(`${base}/blog/rss.xml`)}" rel="self" type="application/rss+xml"/>
${body}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type":  "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=900, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
