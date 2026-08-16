// app/admin/files/page.tsx
// ============================================================================
// robots.txt and llms.txt.
//
// Both show the generated version as the placeholder, so the operator can see
// what they are replacing before they replace it — and can revert simply by
// clearing the box.
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { generatedRobots } from "@/app/robots.txt/route";
import { generatedLlms } from "@/app/llms.txt/route";
import { saveSiteFile } from "../actions";
import { AdminForm, Field, Card } from "../ui";

export const dynamic = "force-dynamic";

type FileRow = { key: string; content: string; enabled: boolean };

/**
 * Read directly rather than through getSiteFile().
 *
 * getSiteFile returns null when a row is disabled, which is right for serving
 * but wrong for editing — the operator would find their parked draft gone from
 * the textarea, and reasonably conclude it had been deleted.
 */
async function rawFiles(): Promise<Record<string, FileRow>> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return {};
  try {
    const sb = createClient(url, anon, { auth: { persistSession: false } });
    const { data } = await sb.from("site_files").select("key, content, enabled");
    const map: Record<string, FileRow> = {};
    for (const row of (data as FileRow[] | null) ?? []) map[row.key] = row;
    return map;
  } catch {
    return {};
  }
}

export default async function AdminFiles() {
  const [files, robotsDefault, llmsDefault] = await Promise.all([
    rawFiles(), Promise.resolve(generatedRobots()), generatedLlms(),
  ]);

  return (
    <div>
      <Card
        title="robots.txt"
        description="Served at /robots.txt. Leave empty to use the generated version shown below, which blocks the application routes and points at the sitemap. Saving a version with 'Disallow: /' under 'User-agent: *' is refused — that one line removes the entire site from every search and answer engine."
      >
        <AdminForm action={saveSiteFile}>
          <input type="hidden" name="key" value="robots_txt" />
          <Field
            label="Contents" name="content" textarea rows={12} mono
            defaultValue={files.robots_txt?.content}
            placeholder={robotsDefault}
          />
          <label style={{
            display: "flex", alignItems: "center", gap: "8px",
            fontFamily: "var(--font-body)", fontSize: "12.5px", color: "var(--text-secondary)",
          }}>
            <input type="checkbox" name="enabled" defaultChecked={files.robots_txt?.enabled ?? true} />
            Serve this instead of the generated file
          </label>
        </AdminForm>
      </Card>

      <Card
        title="llms.txt"
        description="Served at /llms.txt — a plain-text pointer for language models to your best content. Worth being straight about it: no engine is obliged to honour this and publishing one will not get you cited. It signals intent and costs nothing. The generated version lists your published posts and stays current on its own."
      >
        <AdminForm action={saveSiteFile}>
          <input type="hidden" name="key" value="llms_txt" />
          <Field
            label="Contents" name="content" textarea rows={14} mono
            defaultValue={files.llms_txt?.content}
            placeholder={llmsDefault}
          />
          <label style={{
            display: "flex", alignItems: "center", gap: "8px",
            fontFamily: "var(--font-body)", fontSize: "12.5px", color: "var(--text-secondary)",
          }}>
            <input type="checkbox" name="enabled" defaultChecked={files.llms_txt?.enabled ?? true} />
            Serve this instead of the generated file
          </label>
        </AdminForm>
      </Card>
    </div>
  );
}
