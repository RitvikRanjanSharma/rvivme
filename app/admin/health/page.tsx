// app/admin/health/page.tsx
// ============================================================================
// Data health — is every source actually returning rows?
//
// WHY THIS EXISTS
//
// Almost every "the app is broken" moment in this project has turned out to be
// a data problem wearing a code problem's clothes: a migration that hadn't
// run, an env var that wasn't set, a cron that had never fired, a Google
// property connected but empty. Each one cost a debugging session that a
// single screen could have answered in seconds.
//
// It also answers a question that has to be settled BEFORE building anything
// that joins GA4 to Search Console: a join is only as good as the thinner of
// its two inputs, and a joined view built against an empty property looks
// broken for reasons that have nothing to do with the code.
//
// The server half reports facts from our own database. The client half calls
// the same API routes the dashboard uses, because those carry the caller's
// session — which is also what makes this honest: it tests the exact path the
// product uses, not a privileged shortcut that could succeed where the real
// one fails.
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { requireSiteAdmin } from "@/lib/site-admin";
import { HealthProbes } from "./probes";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

/**
 * Counts and freshness straight from Postgres.
 *
 * Uses the service role deliberately: this is an operator diagnostic and needs
 * to see rows regardless of whose they are. It is safe here and only here
 * because the page is already behind requireSiteAdmin(), and the key never
 * reaches the browser — everything below renders on the server.
 */
async function dbFacts() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const sb = createClient(url, key, { auth: { persistSession: false } });

  async function count(table: string): Promise<number | null> {
    const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
    return error ? null : count ?? 0;
  }
  async function latest(table: string, col: string): Promise<string | null> {
    const { data, error } = await sb.from(table).select(col).order(col, { ascending: false }).limit(1);
    if (error || !data?.length) return null;
    return String((data[0] as unknown as Row)[col] ?? "") || null;
  }

  const [
    rankRows, rankLatest, audits, auditLatest, crawlerHits, crawlerLatest, users, connections,
  ] = await Promise.all([
    count("keyword_rankings_history"),
    latest("keyword_rankings_history", "captured_on"),
    count("site_audits"),
    latest("site_audits", "created_at"),
    count("ai_crawler_hits"),
    latest("ai_crawler_hits", "hit_at").catch(() => null),
    count("users"),
    count("google_connections"),
  ]);

  return { rankRows, rankLatest, audits, auditLatest, crawlerHits, crawlerLatest, users, connections };
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export default async function AdminHealth() {
  const check = await requireSiteAdmin();
  const facts = await dbFacts();

  const envs: { key: string; set: boolean; why: string }[] = [
    { key: "GOOGLE_PSI_API_KEY",      set: !!process.env.GOOGLE_PSI_API_KEY,      why: "Core Web Vitals in the site audit." },
    { key: "INTERNAL_LOG_SECRET",     set: !!process.env.INTERNAL_LOG_SECRET,     why: "AI crawler logging records nothing without it." },
    { key: "ANTHROPIC_API_KEY",       set: !!process.env.ANTHROPIC_API_KEY,       why: "Strategy generation and blog summaries." },
    { key: "RESEND_API_KEY",          set: !!process.env.RESEND_API_KEY,          why: "Alert and digest emails. Silently skipped if unset." },
    { key: "BING_WEBMASTER_API_KEY",  set: !!process.env.BING_WEBMASTER_API_KEY,  why: "Bing positions and keywords. Not yet wired up." },
    { key: "CRON_SECRET",             set: !!process.env.CRON_SECRET,             why: "Scheduled jobs reject unauthenticated calls without it." },
    { key: "GA4_SERVICE_ACCOUNT_KEY", set: !!process.env.GA4_SERVICE_ACCOUNT_KEY, why: "Legacy shared fallback for GA4/GSC." },
  ];

  const rankAge = daysAgo(facts?.rankLatest ?? null);

  return (
    <div>
      <p style={{
        fontFamily: "var(--font-body)", fontSize: "13px",
        color: "var(--text-reading)", lineHeight: 1.7, margin: "0 0 20px",
      }}>
        Signed in as {check.ok ? check.email : "—"}. Everything below is measured,
        not assumed. The Google checks run through the same API routes the
        dashboard uses, so if they pass here they will work there.
      </p>

      {/* Client-side because these routes need the browser's session cookie. */}
      <HealthProbes />

      <Section title="Stored data">
        <Metric
          label="Rank history rows"
          value={facts?.rankRows ?? "—"}
          detail={
            facts?.rankLatest
              ? `latest capture ${facts.rankLatest}${rankAge !== null ? ` (${rankAge}d ago)` : ""}`
              : "no snapshots yet"
          }
          bad={facts?.rankRows === 0 || (rankAge !== null && rankAge > 2)}
          note={
            facts?.rankRows === 0
              ? "The daily snapshot has never produced a row. Either no keywords are tracked, or the cron is not running."
              : rankAge !== null && rankAge > 2
                ? "The last snapshot is more than two days old — the 03:20 cron may have stopped."
                : undefined
          }
        />
        <Metric label="Site audits run"  value={facts?.audits ?? "—"}
                detail={facts?.auditLatest ? `latest ${facts.auditLatest.slice(0, 10)}` : "never run"}
                bad={facts?.audits === 0} />
        <Metric label="AI crawler hits" value={facts?.crawlerHits ?? "—"}
                detail={facts?.crawlerHits === 0 ? "none recorded" : "recording"}
                note={
                  facts?.crawlerHits === 0
                    ? "Expected until a real bot visits. Bots crawl on their own schedule — days, not hours."
                    : undefined
                } />
        <Metric label="Users"                value={facts?.users ?? "—"} detail="" />
        <Metric label="Google connections"   value={facts?.connections ?? "—"}
                detail={facts?.connections === 0 ? "nobody has connected Google" : "stored OAuth grants"}
                bad={facts?.connections === 0} />
      </Section>

      <Section title="Server environment">
        {envs.map(e => (
          <Metric
            key={e.key}
            label={e.key}
            value={e.set ? "set" : "not set"}
            detail={e.why}
            bad={!e.set}
            mono
          />
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: "14px", padding: "18px", marginBottom: "16px",
    }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: "9.5px", letterSpacing: "0.12em",
        textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "12px",
      }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>{children}</div>
    </div>
  );
}

function Metric({ label, value, detail, bad, note, mono }: {
  label: string; value: React.ReactNode; detail?: string;
  bad?: boolean; note?: string; mono?: boolean;
}) {
  return (
    <div style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <span style={{
          fontFamily: mono ? "var(--font-mono)" : "var(--font-body)",
          fontSize: mono ? "12px" : "13px", color: "var(--text-primary)",
        }}>
          {label}
        </span>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: "12px",
          color: bad ? "var(--signal-amber)" : "var(--text-secondary)",
        }}>
          {value}{detail ? ` · ${detail}` : ""}
        </span>
      </div>
      {note && (
        <div style={{
          fontFamily: "var(--font-body)", fontSize: "12px",
          color: "var(--text-tertiary)", lineHeight: 1.55, marginTop: "4px",
        }}>
          {note}
        </div>
      )}
    </div>
  );
}
