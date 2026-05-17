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
import type { Database } from "@/lib/supabase";

type FindingInsert = Database["public"]["Tables"]["audit_findings"]["Insert"];

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

  // Insert running row
  const { data: auditRow, error: insertErr } = await caller.supabase
    .from("site_audits")
    .insert({ user_id: caller.user.id, domain, status: "running" } as never)
    .select("id")
    .single();
  if (insertErr || !auditRow) {
    return NextResponse.json({ success: false, error: insertErr?.message ?? "insert_failed" }, { status: 500 });
  }

  let result: AuditResult;
  try {
    result = await runAudit(domain);
  } catch (e: any) {
    await caller.supabase
      .from("site_audits")
      .update({ status: "failed", error_message: String(e?.message ?? e), completed_at: new Date().toISOString() } as never)
      .eq("id", auditRow.id);
    return NextResponse.json({ success: false, error: String(e?.message ?? e) }, { status: 500 });
  }

  // Persist completed audit + findings
  const errors   = result.findings.filter(f => f.severity === "error").length;
  const warnings = result.findings.filter(f => f.severity === "warning").length;
  const notices  = result.findings.filter(f => f.severity === "notice").length;

  await caller.supabase
    .from("site_audits")
    .update({
      status:               "completed",
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

  const { data: latest } = await caller.supabase
    .from("site_audits")
    .select("*")
    .eq("user_id", caller.user.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) {
    return NextResponse.json({ success: true, audit: null, findings: [] });
  }

  const { data: findings } = await caller.supabase
    .from("audit_findings")
    .select("*")
    .eq("audit_id", latest.id)
    .order("severity", { ascending: true });

  return NextResponse.json({ success: true, audit: latest, findings: findings ?? [] });
}
