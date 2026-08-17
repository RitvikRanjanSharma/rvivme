// app/api/site-audit/route.ts
// =============================================================================
// AI Marketing Lab — Site Audit API
// =============================================================================
// POST /api/site-audit  body: { domain?: string }
//   Kicks off a fresh audit for the caller. Inserts a "running" row into
//   site_audits, runs the crawler synchronously (audits typically finish in
//   30-90s with PSI), then upserts the completed row + findings.
//
// GET  /api/site-audit
//   Returns the latest audit + findings for the caller, used by the dashboard
//   audit panel and the dedicated /audit page.
//
// Audits are quota-limited via lib/quota.ts under the `psi` provider so a
// rogue user can't burn through PSI's daily cap.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import { runAudit, type AuditResult } from "@/lib/site-audit";
import { checkAndIncrement } from "@/lib/quota";
import { enrich, byImpact } from "@/lib/audit-guide";
import { ssrfReason } from "@/lib/site-fetch";
import type { Database } from "@/lib/supabase";

type FindingInsert = Database["public"]["Tables"]["audit_findings"]["Insert"];

// SSRF: the hostname check lives in lib/site-fetch.ts.
//
// This route used to carry its own copy — a third implementation of the same
// control, alongside the ones in the crawler view and the crawler audit. Three
// copies of a security check is not three checks: it is three places a fix can
// land in two of. The richer parts of this one (protocol check, IPv6 loopback,
// human-readable reasons) were folded into the shared version rather than
// dropped.

// Audits can take longer than 60s on slow targets; bump where supported.
export const maxDuration = 120;
export const dynamic     = "force-dynamic";

export async function POST(req: NextRequest) {
  const caller = await getCallerOrNull();
  if (!caller) {
    return NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 });
  }

  // Quota check (PSI is the costly bit)
  const q = await checkAndIncrement(caller.supabase, caller.user.id, "psi", { endpoint: "/api/site-audit" });
  if (!q.allowed) {
    return NextResponse.json(
      { success: false, reason: "quota_exceeded", message: `Daily audit limit reached (${q.cap}). Try again tomorrow.` },
      { status: 200 },
    );
  }

  // Resolve the domain to audit. Body wins; otherwise fall back to the
  // user's stored website_url.
  let domain: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.domain === "string") domain = body.domain;
  } catch { /* no body — fine */ }

  if (!domain) {
    const { data } = await caller.supabase
      .from("users").select("website_url").eq("id", caller.user.id).maybeSingle();
    domain = (data as { website_url?: string } | null)?.website_url ?? null;
  }
  if (!domain || domain === "https://example.com") {
    return NextResponse.json(
      { success: false, reason: "no_domain", message: "Set your website URL in Settings before running an audit." },
      { status: 200 },
    );
  }

  // SSRF guard. Without this a malicious caller can submit
  // `http://169.254.169.254/...` (AWS metadata), `http://localhost:5432`
  // (Postgres), or any RFC1918 internal host. We block them before runAudit
  // calls fetch().
  const reason = ssrfReason(domain);
  if (reason) {
    return NextResponse.json(
      { success: false, reason: "blocked", message: reason },
      { status: 400 },
    );
  }

  // Insert running row. Re-type the destructured result because the `as
  // never` insert cast collapses `data` to `never`, which would break
  // `auditRow.id` access further down.
  const startResult = await caller.supabase
    .from("site_audits")
    .insert({ user_id: caller.user.id, domain, status: "running" } as never)
    .select("id")
    .single() as { data: { id: string } | null; error: { message: string } | null };
  const auditRow  = startResult.data;
  const insertErr = startResult.error;
  if (insertErr || !auditRow) {
    // A missing table is by far the most common cause here and the least
    // guessable from the outside — Postgres says 'relation "site_audits" does
    // not exist', which the UI previously flattened to "try again in a
    // moment". It is not a transient failure and retrying will never help, so
    // it gets its own reason and says which migration provides the table.
    const raw     = insertErr?.message ?? "insert_failed";
    const missing = /relation .* does not exist|could not find the table/i.test(raw);
    // The FK on site_audits.user_id points at public.users. Violating it means
    // the caller has an auth session but no profile row — the signup-trigger
    // bug fixed in migration 015. Raw Postgres constraint text is useless to
    // the person reading it, and it is not a problem with their website.
    const noProfile = /violates foreign key constraint .*user_id/i.test(raw);

    return NextResponse.json({
      success: false,
      reason:  noProfile ? "no_profile_row" : missing ? "missing_tables" : "insert_failed",
      message: noProfile
        ? "Your account is missing its profile record, so there is nothing to attach the audit to. Reload the page — the app repairs this automatically. If it persists, sign out and back in."
        : missing
          ? "The audit tables haven't been created in the database yet. Run supabase/migrations/007_seo_foundations.sql."
          : `Couldn't start the audit: ${raw}`,
      error:   raw,
    }, { status: 500 });
  }

  let result: AuditResult;
  try {
    result = await runAudit(domain);
  } catch (e: any) {
    const raw = String(e?.message ?? e);
    await caller.supabase
      .from("site_audits")
      .update({ status: "failed", error_message: raw, completed_at: new Date().toISOString() } as never)
      .eq("id", auditRow.id);
    // Carry the real reason out. The crawl failing because a site is
    // unreachable is a different problem from a bug in the crawler, and the
    // user can only act on the first if we say which it was.
    return NextResponse.json({
      success: false,
      reason:  "crawl_failed",
      message: `Couldn't scan ${domain}: ${raw}`,
      error:   raw,
    }, { status: 500 });
  }

  // Persist completed audit + findings
  const errors   = result.findings.filter(f => f.severity === "error").length;
  const warnings = result.findings.filter(f => f.severity === "warning").length;
  const notices  = result.findings.filter(f => f.severity === "notice").length;

  // The result of this update used to be discarded. If it failed — and it did,
  // on a float being written to an INTEGER column — the row kept its
  // insert-time defaults while the findings insert below still succeeded, so a
  // finished audit rendered as "0 pages crawled, score 0" with a full list of
  // findings underneath it. A write that can half-succeed must be checked.
  const { error: updateErr } = await caller.supabase
    .from("site_audits")
    .update({
      status:               "completed",
      // runAudit resolves apex vs www; store what it actually crawled so the
      // summary line and the finding URLs agree.
      domain:               result.domain,
      overall_score:        result.overall_score,
      pages_crawled:        result.pages_crawled,
      errors_count:         errors,
      warnings_count:       warnings,
      notices_count:        notices,
      performance_score:    result.performance,
      accessibility_score:  result.accessibility,
      best_practices_score: result.best_practices,
      seo_score:            result.seo,
      lcp_ms:               result.lcp_ms,
      cls:                  result.cls,
      inp_ms:               result.inp_ms,
      meta:                 result.meta,
      completed_at:         new Date().toISOString(),
    } as never)
    .eq("id", auditRow.id);

  if (updateErr) {
    await caller.supabase
      .from("site_audits")
      .update({ status: "failed", error_message: `summary write failed: ${updateErr.message}`, completed_at: new Date().toISOString() } as never)
      .eq("id", auditRow.id);
    return NextResponse.json({
      success: false,
      reason:  "save_failed",
      message: `The scan finished but the result couldn't be saved: ${updateErr.message}`,
      error:   updateErr.message,
    }, { status: 500 });
  }

  if (result.findings.length) {
    // Explicit FindingInsert[] typing — same Supabase v12 typing quirk that
    // bit /api/alerts. Without the annotation the inferred array element
    // collapses to `never` and the build fails.
    const findingRows: FindingInsert[] = result.findings.map(f => ({
      audit_id: auditRow.id,
      user_id:  caller.user.id,
      rule:     f.rule,
      severity: f.severity,
      category: f.category,
      page_url: f.page_url ?? null,
      message:  f.message,
      detail:   f.detail ?? null,
    }));
    await caller.supabase.from("audit_findings").insert(findingRows as never);
  }

  return NextResponse.json({ success: true, audit_id: auditRow.id, ...result });
}

export async function GET() {
  const caller = await getCallerOrNull();
  if (!caller) {
    return NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 });
  }

  const latestRes = await caller.supabase
    .from("site_audits")
    .select("*")
    .eq("user_id", caller.user.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latest = latestRes.data as { id: string } | null;

  if (!latest) {
    return NextResponse.json({ success: true, audit: null, findings: [] });
  }

  // A run that was killed mid-flight leaves status "running" forever: the
  // process died, so no catch block wrote a failure. Presenting that as a
  // finished audit is how "0 pages crawled, score 0" appeared next to a full
  // findings list. Anything still running after this long is dead.
  const STALL_MINUTES = 5;
  const row = latestRes.data as { id: string; status?: string; started_at?: string } | null;
  const stalled =
    row?.status === "running" &&
    !!row.started_at &&
    Date.now() - new Date(row.started_at).getTime() > STALL_MINUTES * 60_000;

  const findingsRes = await caller.supabase
    .from("audit_findings")
    .select("*")
    .eq("audit_id", latest.id)
    .order("severity", { ascending: true });
  // Reasoning is attached on READ, not stored per row.
  //
  // RULE_GUIDE is static and keyed by rule id, so persisting a copy of it
  // alongside every finding would duplicate the text, freeze old audits with
  // whatever wording shipped that day, and need a migration to add the columns.
  // Enriching here means improving an explanation improves every past audit
  // too, and nothing about the schema has to change.
  const findings = ((findingsRes.data ?? []) as Array<{ rule: string; severity?: string }>)
    .map(enrich)
    .sort(byImpact);

  return NextResponse.json({
    success: true,
    audit:   latestRes.data,
    findings,
    // Surfaced separately from `audit` so the UI can say the last run didn't
    // finish rather than reporting its placeholder numbers as results.
    stalled,
    running: row?.status === "running" && !stalled,
  });
}
