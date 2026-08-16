"use server";

// app/admin/actions.ts
// ============================================================================
// Every write the admin panel makes.
//
// Server Actions rather than API routes for one concrete reason: updateTag()
// can only be called from an action, and it is what makes an edit visible
// immediately. revalidateTag would serve the previous value while refreshing in
// the background, which in an editor looks exactly like the save failed.
//
// EVERY action re-asserts the admin check. The layout gate already ran, but a
// Server Action is a callable endpoint — it is reachable directly with a forged
// request and does not inherit the page's authorisation. Relying on the layout
// here would be the same class of mistake as trusting a hidden form field.
//
// assertSiteAdmin() throws rather than returning false, so a forgotten check is
// a crash rather than a silent unauthorised write.
// ============================================================================

import { getServerSupabase } from "@/lib/supabase-server";
import { assertSiteAdmin } from "@/lib/site-admin";
import { invalidateSiteContent, normaliseRoute } from "@/lib/site-content";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  const msg = e instanceof Error ? e.message : "Something went wrong.";
  return { ok: false, error: msg };
}

/** Empty string means "no override" — store NULL so the code default wins. */
function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

/** Tri-state: "inherit" leaves the code's value alone. */
function triBool(v: FormDataEntryValue | null): boolean | null {
  const s = typeof v === "string" ? v : "";
  if (s === "true")  return true;
  if (s === "false") return false;
  return null;
}

// ─── SEO overrides ───────────────────────────────────────────────────────────

export async function saveSeoOverride(form: FormData): Promise<ActionResult> {
  try {
    const email = await assertSiteAdmin();
    const sb    = await getServerSupabase();

    const route = normaliseRoute(String(form.get("route") ?? ""));
    if (!route.startsWith("/")) return { ok: false, error: "Route must start with /" };

    // Parsed before writing so malformed JSON is rejected with a message the
    // operator can act on, rather than a database constraint error.
    let jsonLd: unknown = null;
    const rawJson = orNull(form.get("json_ld"));
    if (rawJson) {
      try { jsonLd = JSON.parse(rawJson); }
      catch { return { ok: false, error: "Structured data is not valid JSON." }; }
    }

    // `as never` on the payload — the same cast every other write in this
    // codebase uses. The hand-written Database type in lib/supabase.ts does not
    // satisfy supabase-js's GenericSchema constraint, so postgrest resolves the
    // Insert type to `never`. The row shapes ARE declared there; this is a
    // limitation of the generic, not of the types.
    const { error } = await sb.from("seo_overrides").upsert({
      route,
      title:          orNull(form.get("title")),
      description:    orNull(form.get("description")),
      canonical:      orNull(form.get("canonical")),
      robots_index:   triBool(form.get("robots_index")),
      robots_follow:  triBool(form.get("robots_follow")),
      og_title:       orNull(form.get("og_title")),
      og_description: orNull(form.get("og_description")),
      og_image:       orNull(form.get("og_image")),
      json_ld:        jsonLd,
      updated_by:     email,
    } as never, { onConflict: "route" });

    if (error) return { ok: false, error: error.message };

    invalidateSiteContent();
    // The edited route itself is rendered output, not just cached data, so it
    // needs its own path revalidated as well as the content tag.
    revalidatePath(route);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteSeoOverride(route: string): Promise<ActionResult> {
  try {
    await assertSiteAdmin();
    const sb = await getServerSupabase();
    const normalised = normaliseRoute(route);
    const { error } = await sb.from("seo_overrides").delete().eq("route", normalised);
    if (error) return { ok: false, error: error.message };
    invalidateSiteContent();
    revalidatePath(normalised);
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ─── Content blocks ──────────────────────────────────────────────────────────

export async function saveContentBlock(form: FormData): Promise<ActionResult> {
  try {
    const email = await assertSiteAdmin();
    const sb    = await getServerSupabase();

    const key   = String(form.get("key") ?? "").trim();
    const value = String(form.get("value") ?? "");
    if (!key) return { ok: false, error: "Missing block key." };

    // Blank means "revert to the shipped copy". Deleting the row is how that is
    // expressed — storing an empty string would render a blank space on the
    // page, which is never what someone clearing a field intends.
    if (!value.trim()) {
      const { error } = await sb.from("content_blocks").delete().eq("key", key);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await sb.from("content_blocks").upsert({
        key, value, label: orNull(form.get("label")), updated_by: email,
      } as never, { onConflict: "key" });
      if (error) return { ok: false, error: error.message };
    }

    invalidateSiteContent();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ─── Site files ──────────────────────────────────────────────────────────────

export async function saveSiteFile(form: FormData): Promise<ActionResult> {
  try {
    const email = await assertSiteAdmin();
    const sb    = await getServerSupabase();

    const key = String(form.get("key") ?? "");
    if (key !== "robots_txt" && key !== "llms_txt") {
      return { ok: false, error: "Unknown file." };
    }
    const content = String(form.get("content") ?? "");
    const enabled = form.get("enabled") === "on";

    // A robots.txt that blocks the whole site is the single most damaging thing
    // that can be typed into this panel, and it is one stray character. Refused
    // outright rather than warned about — if it is ever genuinely wanted, it
    // can be done deliberately in code.
    if (key === "robots_txt" && enabled) {
      const blocksEverything = /^\s*disallow:\s*\/\s*$/im.test(content) &&
                               /^\s*user-agent:\s*\*/im.test(content);
      if (blocksEverything) {
        return {
          ok: false,
          error: "That robots.txt contains 'Disallow: /' under 'User-agent: *', which removes the entire site from every search and answer engine. Refused — narrow the rule to the paths you meant.",
        };
      }
    }

    const { error } = await sb.from("site_files").upsert({
      key, content, enabled, updated_by: email,
    } as never, { onConflict: "key" });
    if (error) return { ok: false, error: error.message };

    invalidateSiteContent();
    revalidatePath(key === "robots_txt" ? "/robots.txt" : "/llms.txt");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ─── Redirects ───────────────────────────────────────────────────────────────

export async function saveRedirect(form: FormData): Promise<ActionResult> {
  try {
    const email = await assertSiteAdmin();
    const sb    = await getServerSupabase();

    const source      = normaliseRoute(String(form.get("source") ?? ""));
    const destination = String(form.get("destination") ?? "").trim();
    const status      = Number(form.get("status_code") ?? 308);

    if (!source.startsWith("/"))  return { ok: false, error: "Source must start with /" };
    if (!destination)             return { ok: false, error: "Destination is required." };
    if (![301, 302, 307, 308].includes(status)) {
      return { ok: false, error: "Status must be 301, 302, 307 or 308." };
    }
    // Checked here as well as in the database because a loop takes the route
    // down completely, and a clear message beats a constraint violation.
    if (normaliseRoute(destination) === source) {
      return { ok: false, error: "That redirect points at itself, which would loop forever." };
    }

    const { error } = await sb.from("redirects").upsert({
      source, destination, status_code: status,
      enabled: form.get("enabled") !== "off",
      note:    orNull(form.get("note")),
      updated_by: email,
    } as never, { onConflict: "source" });
    if (error) return { ok: false, error: error.message };

    invalidateSiteContent();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteRedirect(source: string): Promise<ActionResult> {
  try {
    await assertSiteAdmin();
    const sb = await getServerSupabase();
    const { error } = await sb.from("redirects").delete().eq("source", normaliseRoute(source));
    if (error) return { ok: false, error: error.message };
    invalidateSiteContent();
    return { ok: true };
  } catch (e) { return fail(e); }
}
