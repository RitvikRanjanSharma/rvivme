// lib/email.ts
// =============================================================================
// AI Marketing Lab — Transactional email via Resend
// =============================================================================
// Tiny wrapper around Resend's REST API. We don't pull in the resend SDK
// because (a) we're using one endpoint and (b) every dep we add is a dep we
// have to keep current. POST https://api.resend.com/emails is a one-line
// fetch.
//
// Required env:
//   RESEND_API_KEY      — your Resend API key
//   RESEND_FROM_EMAIL   — verified sender (e.g. "AI Marketing Lab <hello@aimarketinglab.co.uk>")
//   APP_URL             — public base URL, used to build deep links in emails
//
// If RESEND_API_KEY is unset, sendEmail() resolves with success:false and a
// reason of "not_configured". Callers (cron jobs) treat that as a soft
// no-op so the rest of the pipeline still runs.
// =============================================================================

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type EmailResult =
  | { success: true; id: string }
  | { success: false; reason: "not_configured" | "send_failed"; error?: string };

export async function sendEmail(opts: {
  to:      string | string[];
  subject: string;
  html:    string;
  text?:   string;
  replyTo?: string;
}): Promise<EmailResult> {
  const key  = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "AI Marketing Lab <hello@aimarketinglab.co.uk>";
  if (!key) return { success: false, reason: "not_configured" };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        from,
        to:       Array.isArray(opts.to) ? opts.to : [opts.to],
        subject:  opts.subject,
        html:     opts.html,
        text:     opts.text ?? stripHtml(opts.html),
        reply_to: opts.replyTo,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { success: false, reason: "send_failed", error: `${res.status} ${body.slice(0, 200)}` };
    }
    const json = await res.json().catch(() => ({} as { id?: string }));
    return { success: true, id: json.id ?? "unknown" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, reason: "send_failed", error: msg };
  }
}

// ---------------------------------------------------------------------------
// Templates. All templates are intentionally plain — Resend renders HTML in
// most clients, but we keep the styling inline and conservative so Outlook /
// Apple Mail / Gmail webview all render the same thing. No external CSS.
// ---------------------------------------------------------------------------

const APP_URL = process.env.APP_URL ?? "https://aimarketinglab.co.uk";

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#0b0b0c;color:#e9e9ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0c;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#141416;border:1px solid #26262a;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:24px 28px 8px 28px;">
          <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#a0a0a8;">AI Marketing Lab</div>
        </td></tr>
        <tr><td style="padding:8px 28px 28px 28px;color:#e9e9ec;font-size:15px;line-height:1.55;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #26262a;color:#7c7c84;font-size:12px;line-height:1.5;">
          You're getting this because you signed up at <a href="${APP_URL}" style="color:#a0a0a8;">aimarketinglab.co.uk</a>.<br>
          <a href="${APP_URL}/settings" style="color:#a0a0a8;">Manage email preferences</a> ·
          <a href="${APP_URL}/privacy" style="color:#a0a0a8;">Privacy</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function welcomeEmail(opts: { name?: string }): { subject: string; html: string } {
  const name = opts.name?.trim() ? opts.name.trim().split(" ")[0] : "there";
  const subject = "Welcome to AI Marketing Lab";
  const body = `
    <h1 style="margin:0 0 12px 0;font-size:22px;color:#fff;">Hey ${escapeHtml(name)},</h1>
    <p>Thanks for joining the AI Marketing Lab beta. The tool is built to help small UK businesses
    track keyword rankings, find competitor gaps, and surface AI-actionable next steps — without
    needing an SEO agency on retainer.</p>
    <p style="margin:16px 0 0 0;"><strong>Three things to do first:</strong></p>
    <ol>
      <li>Connect Search Console so we can pull your real ranking data.</li>
      <li>Add three competitors — we'll diff their keyword footprint against yours.</li>
      <li>Run a site audit. Most sites have 5–10 quick wins on the first scan.</li>
    </ol>
    <p style="margin:24px 0;">
      <a href="${APP_URL}/onboarding" style="display:inline-block;padding:11px 20px;background:#7c5cff;color:#fff;border-radius:8px;text-decoration:none;font-weight:500;">Open the dashboard</a>
    </p>
    <p style="color:#a0a0a8;font-size:13px;margin-top:24px;">
      Hit reply if anything looks broken or confusing — every reply hits my inbox during the beta.
    </p>`;
  return { subject, html: shell(subject, body) };
}

export function alertEmail(opts: {
  title:    string;
  body:     string;
  severity: "info" | "success" | "warning" | "error";
  linkHref?: string;
  linkText?: string;
}): { subject: string; html: string } {
  const subject = `[AI Marketing Lab] ${opts.title}`;
  const tone = {
    info:    "#7aa3ff",
    success: "#52c87a",
    warning: "#f0b657",
    error:   "#ef6b6b",
  }[opts.severity];
  const body = `
    <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${tone};font-weight:600;">
      ${opts.severity}
    </div>
    <h1 style="margin:8px 0 12px 0;font-size:20px;color:#fff;">${escapeHtml(opts.title)}</h1>
    <p style="white-space:pre-wrap;">${escapeHtml(opts.body)}</p>
    ${opts.linkHref ? `
      <p style="margin:24px 0;">
        <a href="${escapeAttr(opts.linkHref)}" style="display:inline-block;padding:10px 18px;background:#7c5cff;color:#fff;border-radius:8px;text-decoration:none;font-weight:500;">
          ${escapeHtml(opts.linkText ?? "Open in dashboard")}
        </a>
      </p>` : ""}`;
  return { subject, html: shell(subject, body) };
}

export function weeklyDigestEmail(opts: {
  domain:        string;
  rankWins:      { keyword: string; from: number; to: number }[];
  rankLosses:    { keyword: string; from: number; to: number }[];
  newKeywords:   string[];
  auditScore:    number | null;
  auditIssues:   number;
  trafficChange: number | null; // percent
}): { subject: string; html: string } {
  const subject = `Your week on ${opts.domain}`;
  const arrow = (delta: number) => delta > 0 ? "▲" : delta < 0 ? "▼" : "·";
  const tableStyle = "width:100%;border-collapse:collapse;font-size:13px;margin:8px 0 16px 0;";
  const cell = "padding:8px 10px;border-bottom:1px solid #26262a;";

  const winsRows = opts.rankWins.length === 0
    ? `<tr><td style="${cell}color:#7c7c84;" colspan="3">No movers up. That happens.</td></tr>`
    : opts.rankWins.slice(0, 6).map(w => `
        <tr>
          <td style="${cell}">${escapeHtml(w.keyword)}</td>
          <td style="${cell}color:#a0a0a8;">${w.from} → ${w.to}</td>
          <td style="${cell}color:#52c87a;text-align:right;">${arrow(w.from - w.to)} ${Math.abs(w.from - w.to)}</td>
        </tr>`).join("");
  const lossesRows = opts.rankLosses.length === 0
    ? `<tr><td style="${cell}color:#7c7c84;" colspan="3">No drops worth flagging — nice.</td></tr>`
    : opts.rankLosses.slice(0, 6).map(l => `
        <tr>
          <td style="${cell}">${escapeHtml(l.keyword)}</td>
          <td style="${cell}color:#a0a0a8;">${l.from} → ${l.to}</td>
          <td style="${cell}color:#ef6b6b;text-align:right;">${arrow(l.from - l.to)} ${Math.abs(l.from - l.to)}</td>
        </tr>`).join("");

  const trafficLine = opts.trafficChange == null
    ? `<span style="color:#7c7c84;">No GSC data this week.</span>`
    : `Traffic ${opts.trafficChange >= 0 ? "up" : "down"} <strong style="color:${opts.trafficChange >= 0 ? "#52c87a" : "#ef6b6b"};">${Math.abs(opts.trafficChange)}%</strong> vs the prior 7 days.`;

  const auditLine = opts.auditScore == null
    ? `No audit run this week — <a href="${APP_URL}/audit" style="color:#a0a0a8;">run one now</a>.`
    : `Last audit score: <strong style="color:#fff;">${opts.auditScore}/100</strong> (${opts.auditIssues} issues open).`;

  const body = `
    <h1 style="margin:0 0 12px 0;font-size:22px;color:#fff;">Your week on ${escapeHtml(opts.domain)}</h1>
    <p style="margin:0 0 18px 0;">${trafficLine}</p>

    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a0a0a8;margin-top:18px;">Movers up</div>
    <table style="${tableStyle}">${winsRows}</table>

    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a0a0a8;">Movers down</div>
    <table style="${tableStyle}">${lossesRows}</table>

    ${opts.newKeywords.length > 0 ? `
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a0a0a8;">New rankings</div>
      <p style="margin:8px 0 16px 0;">${opts.newKeywords.slice(0, 8).map(escapeHtml).join(", ")}</p>` : ""}

    <p style="margin:18px 0;">${auditLine}</p>

    <p style="margin:24px 0;">
      <a href="${APP_URL}/dashboard" style="display:inline-block;padding:10px 18px;background:#7c5cff;color:#fff;border-radius:8px;text-decoration:none;font-weight:500;">Open dashboard</a>
    </p>`;
  return { subject, html: shell(subject, body) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c),
  );
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
