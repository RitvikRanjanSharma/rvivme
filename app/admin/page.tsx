// app/admin/page.tsx — overview
// ============================================================================
// What is currently overridden, at a glance.
//
// The panel's main risk is forgetting something is set. An override is
// invisible on the site itself — the page just quietly says something different
// from the code — so the first screen exists to answer "what have I changed?"
// before anything else.
// ============================================================================

import Link from "next/link";
import { getSeoOverrides, getContentBlocks, getRedirects, getSiteFile } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const [seo, blocks, redirects, robots, llms] = await Promise.all([
    getSeoOverrides(), getContentBlocks(), getRedirects(),
    getSiteFile("robots_txt"), getSiteFile("llms_txt"),
  ]);

  const seoRoutes = Object.keys(seo).sort();
  const blockKeys = Object.keys(blocks).sort();

  const stats = [
    { label: "Routes with SEO overrides", value: seoRoutes.length, href: "/admin/seo" },
    { label: "Edited copy blocks",        value: blockKeys.length, href: "/admin/content" },
    { label: "Active redirects",          value: redirects.length, href: "/admin/redirects" },
    {
      label: "Custom files",
      value: [robots && "robots.txt", llms && "llms.txt"].filter(Boolean).join(", ") || "none",
      href:  "/admin/files",
    },
  ];

  return (
    <div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
        gap: "12px", marginBottom: "24px",
      }}>
        {stats.map(s => (
          <Link key={s.label} href={s.href} style={{
            background: "var(--card)", border: "1px solid var(--border)",
            borderRadius: "12px", padding: "16px", textDecoration: "none",
            display: "block",
          }}>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: "22px",
              color: "var(--text-primary)", marginBottom: "4px",
            }}>
              {s.value}
            </div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--text-tertiary)",
            }}>
              {s.label}
            </div>
          </Link>
        ))}
      </div>

      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: "14px", padding: "18px",
      }}>
        <div style={{
          fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 500,
          color: "var(--text-primary)", marginBottom: "8px",
        }}>
          How this works
        </div>
        <p style={{
          fontFamily: "var(--font-body)", fontSize: "12.5px",
          color: "var(--text-reading)", lineHeight: 1.7, margin: 0,
        }}>
          Everything here is an <strong>overlay on the code</strong>. A field you
          leave empty keeps whatever is compiled into the site, so clearing a
          value reverts to the shipped version rather than blanking the page.
          Nothing here can leave the site with an empty heading or a missing
          title.
        </p>
        <p style={{
          fontFamily: "var(--font-body)", fontSize: "12.5px",
          color: "var(--text-reading)", lineHeight: 1.7, margin: "10px 0 0",
        }}>
          Edits appear immediately, with one exception: <strong>redirects</strong> are
          cached in memory for up to a minute because they are consulted on every
          request, so a new rule can take that long to take effect everywhere.
        </p>
      </div>

      {seoRoutes.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: "9.5px", letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "8px",
          }}>
            Currently overridden
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {seoRoutes.map(r => (
              <span key={r} style={{
                fontFamily: "var(--font-mono)", fontSize: "11px",
                color: "var(--text-secondary)", background: "var(--muted)",
                border: "1px solid var(--border)", borderRadius: "6px",
                padding: "4px 8px",
              }}>
                {r}
                {seo[r].robots_index === false && (
                  <strong style={{ color: "var(--signal-red)" }}> · noindex</strong>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
