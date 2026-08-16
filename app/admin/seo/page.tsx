// app/admin/seo/page.tsx
// ============================================================================
// Per-route metadata overrides.
//
// The route list is hardcoded rather than discovered. Next has no runtime API
// for enumerating routes, and guessing from the filesystem would list things
// nobody should be editing (API handlers, auth callbacks). An explicit list is
// also the honest one: these are the pages where changing a title actually
// affects search.
// ============================================================================

import { getSeoOverrides } from "@/lib/site-content";
import { saveSeoOverride } from "../actions";
import { AdminForm, Field, TriState, Card } from "../ui";

export const dynamic = "force-dynamic";

/** Routes worth overriding, with what the code currently says. */
const ROUTES: { route: string; codeTitle: string; note: string }[] = [
  { route: "/",          codeTitle: "AI Marketing Lab — SEO & GEO Intelligence Platform", note: "Homepage. Title is used verbatim, without the brand suffix." },
  { route: "/blog",      codeTitle: "Blog",             note: "Blog index. Individual posts set their own metadata in the blog editor." },
  { route: "/portfolio", codeTitle: "Portfolio",        note: "Currently noindex, nofollow and hidden from the nav." },
  { route: "/privacy",   codeTitle: "Privacy Notice",   note: "" },
  { route: "/terms",     codeTitle: "Terms of Service", note: "" },
];

export default async function AdminSeo() {
  const overrides = await getSeoOverrides();

  return (
    <div>
      <p style={{
        fontFamily: "var(--font-body)", fontSize: "13px",
        color: "var(--text-reading)", lineHeight: 1.7, margin: "0 0 18px",
      }}>
        Empty fields inherit whatever the code says, shown as the placeholder.
        Titles get <code>— AI Marketing Lab</code> appended automatically, so
        write just the page name.
      </p>

      {ROUTES.map(({ route, codeTitle, note }) => {
        const o = overrides[route];
        const overridden = !!o;
        return (
          <Card
            key={route}
            title={route}
            description={[note, overridden ? "Currently overridden." : ""].filter(Boolean).join(" ")}
          >
            <AdminForm action={saveSeoOverride}>
              <input type="hidden" name="route" value={route} />
              <Field
                label="Title" name="title"
                defaultValue={o?.title} placeholder={codeTitle}
              />
              <Field
                label="Meta description" name="description" textarea rows={2}
                defaultValue={o?.description}
                placeholder="Inherits the description compiled into the page"
                hint="Around 140–160 characters. Longer gets truncated in results."
              />
              <Field
                label="Canonical URL" name="canonical"
                defaultValue={o?.canonical} placeholder={route}
                hint="Only change this if the page genuinely duplicates another."
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "12px" }}>
                <TriState
                  label="Allow indexing" name="robots_index"
                  defaultValue={o?.robots_index ?? null}
                  hint="No = removed from search results."
                />
                <TriState
                  label="Follow links" name="robots_follow"
                  defaultValue={o?.robots_follow ?? null}
                />
              </div>
              <Field
                label="Social title" name="og_title"
                defaultValue={o?.og_title}
                placeholder="Defaults to the page title"
                hint="Shown when the link is shared on LinkedIn, Slack, WhatsApp or X."
              />
              <Field
                label="Social description" name="og_description" textarea rows={2}
                defaultValue={o?.og_description}
                placeholder="Defaults to the meta description"
              />
              <Field
                label="Social image URL" name="og_image"
                defaultValue={o?.og_image}
                placeholder="Defaults to the generated card"
                hint="1200×630 works everywhere."
              />
              <Field
                label="Structured data (JSON-LD)" name="json_ld" textarea rows={5} mono
                defaultValue={o?.json_ld ? JSON.stringify(o.json_ld, null, 2) : ""}
                placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "Organization"\n}'}
                hint="Validated as JSON before saving. Leave empty for none."
              />
            </AdminForm>
          </Card>
        );
      })}
    </div>
  );
}
