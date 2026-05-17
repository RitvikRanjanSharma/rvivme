// app/api/cron/check-alerts/route.ts
// =============================================================================
// AI Marketing Lab — Daily alert evaluation
// =============================================================================
// Runs at 04:30 UTC after the rank-snapshot job has populated yesterday's
// data. For every enabled `alerts` row we:
//
//   1. Evaluate the rule against the user's data (rankings, audits).
//   2. If it fires, insert a row into `notifications`.
//   3. If `email_enabled` is on, also send a transactional email via Resend.
//
// Rule evaluation is intentionally simple — we want a small number of
// trustworthy signals, not every theoretical alert. New rules go here.
//
// The alerts.last_evaluated_at column is updated regardless so we can see
// "the cron is alive" even when nothing fired.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { verifyCron, getServiceSupabase } from "@/lib/cron";
import { sendEmail, alertEmail } from "@/lib/email";

export const maxDuration = 120;
export const dynamic     = "force-dynamic";

type AlertRow = {
  id:            string;
  user_id:       string;
  rule_type:
    | "rank_drop" | "rank_gain" | "traffic_drop" | "traffic_spike"
    | "new_keyword" | "lost_keyword" | "audit_critical"
    | "broken_page" | "manual";
  threshold:     number | null;
  enabled:       boolean;
  email_enabled: boolean;
};

type FiredAlert = {
  alert_id:  string;
  user_id:   string;
  severity:  "info" | "success" | "warning" | "error";
  title:     string;
  body:      string;
  link_href: string;
};

const APP_URL = process.env.APP_URL ?? "https://aimarketinglab.co.uk";

export async function GET(req: NextRequest) {
  const guard = verifyCron(req);
  if (guard) return guard;

  const startedAt = Date.now();
  const sb = getServiceSupabase();

  const { data: alerts, error: alertsErr } = await sb
    .from("alerts")
    .select("id, user_id, rule_type, threshold, enabled, email_enabled")
    .eq("enabled", true);

  if (alertsErr) {
    return NextResponse.json({ success: false, error: alertsErr.message }, { status: 500 });
  }

  const summary = {
    alerts_evaluated:   alerts?.length ?? 0,
    notifications_sent: 0,
    emails_sent:        0,
    email_failed:       0,
    errors:             [] as { alert_id: string; reason: string }[],
  };

  for (const a of (alerts ?? []) as AlertRow[]) {
    try {
      const fired = await evaluate(sb, a);
      // Always update last_evaluated_at, even if nothing fires
      await sb.from("alerts").update({ last_evaluated_at: new Date().toISOString() } as never).eq("id", a.id);

      for (const f of fired) {
        // Insert notification
        const { data: noteRow, error: noteErr } = await sb
          .from("notifications")
          .insert({
            user_id:   f.user_id,
            alert_id:  f.alert_id,
            severity:  f.severity,
            title:     f.title,
            body:      f.body,
            link_href: f.link_href,
          } as never)
          .select("id")
          .single();
        if (noteErr || !noteRow) {
          summary.errors.push({ alert_id: a.id, reason: `notify: ${noteErr?.message ?? "no row"}` });
          continue;
        }
        summary.notifications_sent++;

        // Send email if enabled
        if (a.email_enabled) {
          const email = await sendEmailForAlert(sb, f);
          if (email.success) {
            summary.emails_sent++;
            await sb.from("notifications")
              .update({ emailed_at: new Date().toISOString() } as never)
              .eq("id", noteRow.id);
          } else if (email.reason !== "not_configured") {
            summary.email_failed++;
            summary.errors.push({ alert_id: a.id, reason: `email: ${email.error ?? email.reason}` });
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      summary.errors.push({ alert_id: a.id, reason: msg });
    }
  }

  return NextResponse.json({
    success:     true,
    duration_ms: Date.now() - startedAt,
    ...summary,
  });
}

// ---------------------------------------------------------------------------
// Rule evaluators
// ---------------------------------------------------------------------------
async function evaluate(
  sb: ReturnType<typeof getServiceSupabase>,
  alert: AlertRow,
): Promise<FiredAlert[]> {
  switch (alert.rule_type) {
    case "rank_drop":      return evaluateRankDrop(sb, alert);
    case "rank_gain":      return evaluateRankGain(sb, alert);
    case "audit_critical": return evaluateAuditCritical(sb, alert);
    case "new_keyword":    return evaluateNewKeyword(sb, alert);
    case "lost_keyword":   return evaluateLostKeyword(sb, alert);
    // The traffic / broken-page / manual rules are wired up later when we
    // have the underlying tracking. Keep them harmless no-ops for now so an
    // enabled-but-unimplemented alert doesn't crash the whole cron.
    default:               return [];
  }
}

// Rank drop: keyword dropped by >= threshold places between today and 7d ago.
async function evaluateRankDrop(
  sb: ReturnType<typeof getServiceSupabase>,
  alert: AlertRow,
): Promise<FiredAlert[]> {
  const threshold = alert.threshold ?? 5;
  const today    = new Date().toISOString().slice(0, 10);
  const weekAgo  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: rows } = await sb
    .from("keyword_rankings_history")
    .select("keyword, position, captured_on")
    .eq("user_id", alert.user_id)
    .in("captured_on", [today, weekAgo]);

  if (!rows || rows.length === 0) return [];

  // Build map keyword -> {today, weekAgo}
  const byKw = new Map<string, { today?: number; weekAgo?: number }>();
  for (const r of rows) {
    const e = byKw.get(r.keyword) ?? {};
    if (r.captured_on === today) e.today = r.position;
    else if (r.captured_on === weekAgo) e.weekAgo = r.position;
    byKw.set(r.keyword, e);
  }

  const fired: FiredAlert[] = [];
  for (const [keyword, e] of byKw) {
    if (e.today == null || e.weekAgo == null) continue;
    // Position numbers are smaller-is-better, so a drop means today > weekAgo.
    const delta = e.today - e.weekAgo;
    if (delta >= threshold && e.weekAgo < 101) {
      fired.push({
        alert_id:  alert.id,
        user_id:   alert.user_id,
        severity:  "warning",
        title:     `Rank drop: "${keyword}"`,
        body:      `Position fell ${delta} places (${e.weekAgo} → ${e.today}) over the last 7 days. Worth a look — content quality, lost backlinks, or a new competitor are the usual causes.`,
        link_href: `${APP_URL}/keywords`,
      });
    }
  }
  return fired;
}

// Rank gain: keyword improved by >= threshold places between today and 7d ago.
async function evaluateRankGain(
  sb: ReturnType<typeof getServiceSupabase>,
  alert: AlertRow,
): Promise<FiredAlert[]> {
  const threshold = alert.threshold ?? 10;
  const today    = new Date().toISOString().slice(0, 10);
  const weekAgo  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: rows } = await sb
    .from("keyword_rankings_history")
    .select("keyword, position, captured_on")
    .eq("user_id", alert.user_id)
    .in("captured_on", [today, weekAgo]);

  if (!rows || rows.length === 0) return [];
  const byKw = new Map<string, { today?: number; weekAgo?: number }>();
  for (const r of rows) {
    const e = byKw.get(r.keyword) ?? {};
    if (r.captured_on === today) e.today = r.position;
    else if (r.captured_on === weekAgo) e.weekAgo = r.position;
    byKw.set(r.keyword, e);
  }

  const fired: FiredAlert[] = [];
  for (const [keyword, e] of byKw) {
    if (e.today == null || e.weekAgo == null) continue;
    const delta = e.weekAgo - e.today;
    if (delta >= threshold && e.today < 101) {
      fired.push({
        alert_id:  alert.id,
        user_id:   alert.user_id,
        severity:  "success",
        title:     `Rank gain: "${keyword}"`,
        body:      `Up ${delta} places (${e.weekAgo} → ${e.today}) over the last 7 days. Whatever you did, do more of it.`,
        link_href: `${APP_URL}/keywords`,
      });
    }
  }
  return fired;
}

// Audit critical: latest completed audit has any errors.
async function evaluateAuditCritical(
  sb: ReturnType<typeof getServiceSupabase>,
  alert: AlertRow,
): Promise<FiredAlert[]> {
  const { data: latest } = await sb
    .from("site_audits")
    .select("id, errors_count, overall_score, started_at")
    .eq("user_id", alert.user_id)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest || !latest.errors_count || latest.errors_count === 0) return [];

  // Don't re-fire on the same audit twice. Look for an existing notification
  // tied to this alert that was created after this audit started.
  const { data: existing } = await sb
    .from("notifications")
    .select("id")
    .eq("alert_id", alert.id)
    .gt("created_at", latest.started_at)
    .limit(1);
  if (existing && existing.length > 0) return [];

  return [{
    alert_id:  alert.id,
    user_id:   alert.user_id,
    severity:  "error",
    title:     `Audit found ${latest.errors_count} critical issue${latest.errors_count === 1 ? "" : "s"}`,
    body:      `Your latest site audit flagged ${latest.errors_count} error-level finding${latest.errors_count === 1 ? "" : "s"}. Score: ${latest.overall_score ?? "—"}/100.`,
    link_href: `${APP_URL}/audit`,
  }];
}

// New keyword: keywords that have a row today but no row 7 days ago.
async function evaluateNewKeyword(
  sb: ReturnType<typeof getServiceSupabase>,
  alert: AlertRow,
): Promise<FiredAlert[]> {
  const today    = new Date().toISOString().slice(0, 10);
  const weekAgo  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: todayRows }   = await sb
    .from("keyword_rankings_history").select("keyword, position")
    .eq("user_id", alert.user_id).eq("captured_on", today).lt("position", 101);
  const { data: weekAgoRows } = await sb
    .from("keyword_rankings_history").select("keyword")
    .eq("user_id", alert.user_id).eq("captured_on", weekAgo).lt("position", 101);

  if (!todayRows || todayRows.length === 0) return [];
  const past = new Set((weekAgoRows ?? []).map(r => r.keyword));
  const newOnes = todayRows.filter(r => !past.has(r.keyword)).map(r => r.keyword);
  if (newOnes.length === 0) return [];

  return [{
    alert_id:  alert.id,
    user_id:   alert.user_id,
    severity:  "success",
    title:     `${newOnes.length} new keyword${newOnes.length === 1 ? "" : "s"} ranking`,
    body:      `New rankings this week: ${newOnes.slice(0, 8).join(", ")}${newOnes.length > 8 ? "…" : ""}.`,
    link_href: `${APP_URL}/keywords`,
  }];
}

// Lost keyword: keywords that ranked 7d ago but no longer rank today.
async function evaluateLostKeyword(
  sb: ReturnType<typeof getServiceSupabase>,
  alert: AlertRow,
): Promise<FiredAlert[]> {
  const today    = new Date().toISOString().slice(0, 10);
  const weekAgo  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: todayRows }   = await sb
    .from("keyword_rankings_history").select("keyword")
    .eq("user_id", alert.user_id).eq("captured_on", today).lt("position", 101);
  const { data: weekAgoRows } = await sb
    .from("keyword_rankings_history").select("keyword")
    .eq("user_id", alert.user_id).eq("captured_on", weekAgo).lt("position", 101);

  if (!weekAgoRows || weekAgoRows.length === 0) return [];
  const present = new Set((todayRows ?? []).map(r => r.keyword));
  const lost = weekAgoRows.filter(r => !present.has(r.keyword)).map(r => r.keyword);
  if (lost.length === 0) return [];

  return [{
    alert_id:  alert.id,
    user_id:   alert.user_id,
    severity:  "warning",
    title:     `${lost.length} keyword${lost.length === 1 ? "" : "s"} dropped out of top 100`,
    body:      `These were ranking last week and have since fallen off: ${lost.slice(0, 8).join(", ")}${lost.length > 8 ? "…" : ""}.`,
    link_href: `${APP_URL}/keywords`,
  }];
}

// ---------------------------------------------------------------------------
// Email helper — fetches the user's email from auth.users via service role.
// ---------------------------------------------------------------------------
async function sendEmailForAlert(
  sb: ReturnType<typeof getServiceSupabase>,
  fired: FiredAlert,
) {
  const { data, error } = await sb.auth.admin.getUserById(fired.user_id);
  if (error || !data?.user?.email) {
    return { success: false as const, reason: "send_failed" as const, error: "no email on file" };
  }
  const tpl = alertEmail({
    title:     fired.title,
    body:      fired.body,
    severity:  fired.severity,
    linkHref:  fired.link_href,
    linkText:  "Open in dashboard",
  });
  return sendEmail({
    to:      data.user.email,
    subject: tpl.subject,
    html:    tpl.html,
  });
}
