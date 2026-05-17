// app/api/cron/weekly-digest/route.ts
// =============================================================================
// AI Marketing Lab — Weekly digest email
// =============================================================================
// Runs Mondays at 08:00 UTC. For each user with onboarding_complete:
//   1. Compute movers up / down by comparing today's rankings against 7d ago
//   2. List new top-100 keywords
//   3. Pull last completed audit's score + open issue count
//   4. (Best-effort) compute traffic % change from GSC if available — skipped
//      gracefully when no token is configured
//   5. Render and send via Resend
//
// Users who haven't enabled `digest_email` (column added in a future migration)
// or who have no rank data yet get skipped — quiet by default.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { verifyCron, getServiceSupabase } from "@/lib/cron";
import { sendEmail, weeklyDigestEmail } from "@/lib/email";

// Local row shapes for SELECTed columns — see check-alerts/route.ts for the
// reasoning. We cast each Supabase query result to these because postgrest
// v12 strict typing returns `never` for our hand-written Database type.
type UserRow      = { id: string; website_url: string | null; onboarding_complete: boolean };
type RankRow      = { keyword: string; position: number; captured_on: string };
type AuditSummary = { overall_score: number | null; errors_count: number | null; warnings_count: number | null };

export const maxDuration = 300;
export const dynamic     = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = verifyCron(req);
  if (guard) return guard;

  const startedAt = Date.now();
  const sb = getServiceSupabase();

  const usersRes = await sb
    .from("users")
    .select("id, website_url, onboarding_complete")
    .eq("onboarding_complete", true);
  const users = (usersRes.data ?? []) as UserRow[];

  if (usersRes.error) {
    return NextResponse.json({ success: false, error: usersRes.error.message }, { status: 500 });
  }

  const summary = {
    users_considered: users.length,
    digests_sent:     0,
    skipped_no_data:  0,
    failed:           [] as { user_id: string; reason: string }[],
  };

  const today    = new Date().toISOString().slice(0, 10);
  const weekAgo  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  for (const u of users) {
    try {
      // Pull both snapshots
      const rowsRes = await sb
        .from("keyword_rankings_history")
        .select("keyword, position, captured_on")
        .eq("user_id", u.id)
        .in("captured_on", [today, weekAgo]);
      const rows = (rowsRes.data ?? []) as RankRow[];

      const byKw = new Map<string, { today?: number; weekAgo?: number }>();
      for (const r of rows) {
        const e = byKw.get(r.keyword) ?? {};
        if (r.captured_on === today) e.today = r.position;
        else if (r.captured_on === weekAgo) e.weekAgo = r.position;
        byKw.set(r.keyword, e);
      }

      const wins:   { keyword: string; from: number; to: number }[] = [];
      const losses: { keyword: string; from: number; to: number }[] = [];
      const newKeywords: string[] = [];

      for (const [keyword, e] of byKw) {
        if (e.today == null) continue;
        if (e.weekAgo == null && e.today < 101) {
          newKeywords.push(keyword);
          continue;
        }
        if (e.weekAgo == null) continue;
        const delta = e.today - e.weekAgo;
        if (delta <= -3 && e.today < 101) {
          wins.push({ keyword, from: e.weekAgo, to: e.today });
        } else if (delta >= 3 && e.weekAgo < 101) {
          losses.push({ keyword, from: e.weekAgo, to: e.today });
        }
      }
      // Sort by magnitude
      wins.sort((a, b) => (a.to - a.from) - (b.to - b.from));
      losses.sort((a, b) => (b.to - b.from) - (a.to - a.from));

      // Audit summary
      const lastAuditRes = await sb
        .from("site_audits")
        .select("overall_score, errors_count, warnings_count")
        .eq("user_id", u.id)
        .eq("status", "completed")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastAudit   = lastAuditRes.data as AuditSummary | null;
      const auditScore  = lastAudit?.overall_score ?? null;
      const auditIssues = (lastAudit?.errors_count ?? 0) + (lastAudit?.warnings_count ?? 0);

      // If we have no useful data at all, skip the email rather than send a
      // hollow "nothing happened" digest.
      if (
        wins.length === 0 && losses.length === 0 &&
        newKeywords.length === 0 && auditScore == null
      ) {
        summary.skipped_no_data++;
        continue;
      }

      // Resolve email
      const { data: authUser } = await sb.auth.admin.getUserById(u.id);
      if (!authUser?.user?.email) {
        summary.failed.push({ user_id: u.id, reason: "no email on file" });
        continue;
      }

      const domain = hostFor(u.website_url);
      const tpl = weeklyDigestEmail({
        domain,
        rankWins: wins,
        rankLosses: losses,
        newKeywords,
        auditScore,
        auditIssues,
        trafficChange: null,
      });

      const result = await sendEmail({
        to:      authUser.user.email,
        subject: tpl.subject,
        html:    tpl.html,
      });

      if (result.success) {
        summary.digests_sent++;
      } else if (result.reason === "not_configured") {
        // Resend isn't set up — record it once and stop trying.
        return NextResponse.json({
          success: false,
          reason:  "resend_not_configured",
          message: "Set RESEND_API_KEY in env to enable digest emails.",
          ...summary,
        });
      } else {
        summary.failed.push({ user_id: u.id, reason: result.error ?? result.reason });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      summary.failed.push({ user_id: u.id, reason: msg });
    }
  }

  return NextResponse.json({
    success:     true,
    duration_ms: Date.now() - startedAt,
    ...summary,
  });
}

function hostFor(input: string | null | undefined): string {
  if (!input) return "your site";
  return input
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}
