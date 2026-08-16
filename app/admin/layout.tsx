// app/admin/layout.tsx
// ============================================================================
// The operator panel gate.
//
// This is a Server Component and the check runs before any child renders, so a
// non-admin never receives the admin markup at all — not hidden with CSS, not
// unmounted after a flash. That matters more than it sounds: a client-side gate
// ships the whole editor to the browser and then hides it.
//
// It asks the DATABASE (is_site_admin()) rather than comparing against the
// NEXT_PUBLIC_ email list, so this gate and the RLS policies that actually
// protect the data can never disagree. If this says yes, writes will succeed;
// if it says no, showing an editor would only produce failures.
//
// notFound() rather than a "403 Forbidden" page is deliberate. An authorisation
// error confirms the panel exists at this URL; a 404 tells someone probing
// exactly as much as a route that was never there.
// ============================================================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSiteAdmin } from "@/lib/site-admin";

export const metadata: Metadata = {
  title: "Admin",
  // Belt and braces with the robots.txt disallow. If this URL is ever reached
  // some other way, it still must not be indexed.
  robots: { index: false, follow: false },
};

// Always evaluated per request. A cached admin gate is a gate that can be
// served to the wrong person.
export const dynamic = "force-dynamic";

const TABS = [
  { href: "/admin",           label: "Overview"  },
  { href: "/admin/seo",       label: "SEO"       },
  { href: "/admin/content",   label: "Content"   },
  { href: "/admin/files",     label: "Files"     },
  { href: "/admin/redirects", label: "Redirects" },
  { href: "/admin/blog",      label: "Blog"      },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const check = await requireSiteAdmin();
  if (!check.ok) notFound();

  return (
    <div style={{
      background: "var(--bg)", minHeight: "100vh",
      padding: "32px 24px 80px", maxWidth: "1100px", margin: "0 auto",
    }}>
      <div style={{ marginBottom: "22px" }}>
        <h1 className="aiml-page-title" style={{
          fontFamily: "var(--font-display)", fontSize: "clamp(1.6rem,3.2vw,2.4rem)",
          letterSpacing: "-0.04em", lineHeight: 1.05, fontWeight: 400,
          color: "var(--text-primary)", marginBottom: "6px",
        }}>
          Site admin
        </h1>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: "11px",
          color: "var(--text-tertiary)", letterSpacing: "0.06em",
        }}>
          {check.email.toUpperCase()} · CHANGES ARE LIVE
        </div>
      </div>

      <nav style={{
        display: "flex", gap: "4px", flexWrap: "wrap",
        borderBottom: "1px solid var(--border)", marginBottom: "24px",
        paddingBottom: "10px",
      }}>
        {TABS.map(t => (
          <Link key={t.href} href={t.href} style={{
            fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.06em",
            textTransform: "uppercase", color: "var(--text-secondary)",
            textDecoration: "none", padding: "8px 12px", borderRadius: "8px",
          }}>
            {t.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
