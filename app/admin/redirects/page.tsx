// app/admin/redirects/page.tsx
// ============================================================================
// Runtime redirects.
//
// The delay warning is prominent because it is the one place in this panel
// where a save does NOT take effect immediately — see lib/redirect-cache.ts for
// why that trade is the right one when something is consulted on every request.
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { saveRedirect } from "../actions";
import { AdminForm, Field, Card } from "../ui";

export const dynamic = "force-dynamic";

type Row = {
  source: string; destination: string; status_code: number;
  enabled: boolean; note: string | null;
};

async function allRedirects(): Promise<Row[]> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return [];
  try {
    const sb = createClient(url, anon, { auth: { persistSession: false } });
    // Disabled rules included here, unlike the serving path: the panel is where
    // you turn one back on, so hiding them would strand them.
    const { data } = await sb.from("redirects").select("*").order("source");
    return (data as Row[] | null) ?? [];
  } catch {
    return [];
  }
}

export default async function AdminRedirects() {
  const rows = await allRedirects();

  return (
    <div>
      <p style={{
        fontFamily: "var(--font-body)", fontSize: "13px",
        color: "var(--text-reading)", lineHeight: 1.7, margin: "0 0 18px",
      }}>
        Matching is on the exact path — no wildcards. Query strings are carried
        across, so campaign links keep working. <strong>Changes here can take up
        to a minute</strong> to apply everywhere, because redirects are cached in
        memory rather than queried on every request.
      </p>

      <Card title="Add or update a redirect">
        <AdminForm action={saveRedirect} submitLabel="Save redirect">
          <Field
            label="From" name="source" placeholder="/old-page"
            hint="Path on this site, starting with /"
          />
          <Field
            label="To" name="destination" placeholder="/new-page"
            hint="A path on this site, or a full https:// URL elsewhere."
          />
          <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em",
              textTransform: "uppercase", color: "var(--text-tertiary)",
            }}>
              Type
            </span>
            <select name="status_code" defaultValue="308" style={{
              fontFamily: "var(--font-body)", fontSize: "13px",
              color: "var(--text-primary)", background: "var(--surface)",
              border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 11px",
            }}>
              <option value="308">Permanent (308) — passes ranking to the new URL</option>
              <option value="301">Permanent (301) — the older permanent code</option>
              <option value="307">Temporary (307) — keeps ranking on the old URL</option>
              <option value="302">Temporary (302) — the older temporary code</option>
            </select>
            <span style={{
              fontFamily: "var(--font-body)", fontSize: "11.5px",
              color: "var(--text-tertiary)", lineHeight: 1.5,
            }}>
              Use permanent unless the move is genuinely temporary — a temporary
              redirect tells search engines to keep indexing the old URL.
            </span>
          </label>
          <Field label="Note" name="note" placeholder="Why this exists" />
        </AdminForm>
      </Card>

      {rows.length > 0 && (
        <Card title={`Existing (${rows.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {rows.map(r => (
              <div key={r.source} style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                gap: "10px", flexWrap: "wrap", padding: "8px 0",
                borderBottom: "1px solid var(--border-subtle)",
                opacity: r.enabled ? 1 : 0.5,
              }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-primary)" }}>
                  {r.source} → {r.destination}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)" }}>
                  {r.status_code}{r.enabled ? "" : " · DISABLED"}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
