// app/api/dataforseo/backlinks/route.ts
// =============================================================================
// AI Marketing Lab — Backlinks Overview
// Uses DataForSEO backlinks summary endpoint.
//
// The backlinks API is a paid add-on on DataForSEO and not every plan has it.
// When the account lacks access, DFS returns either HTTP 40000/403-ish, or an
// OK HTTP response with task.status_code 40100 and a message like:
//   "Access denied. Visit Plans and Subscriptions to activate your
//    subscription and get access to this API: …"
// We detect this and surface a structured { success:false, reason:"plan_access" }
// response so the UI can render a calm "not on your plan" state instead of a
// red / amber error banner.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";

const DFS_BASE = "https://api.dataforseo.com/v3";

function basicAuth() {
  const login = process.env.DATAFORSEO_LOGIN;
  const pass  = process.env.DATAFORSEO_PASSWORD;
  if (!login || !pass) throw new Error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set");
  return "Basic " + Buffer.from(`${login}:${pass}`).toString("base64");
}

function isPlanAccessMessage(msg: string | undefined): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    m.includes("access denied") ||
    m.includes("plans and subscriptions") ||
    m.includes("endpoint not accessible") ||
    m.includes("not available on your plan") ||
    m.includes("activate your subscription")
  );
}

export async function GET(request: NextRequest) {
  try {
    const domain = new URL(request.url).searchParams.get("domain");
    if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

    const res = await fetch(`${DFS_BASE}/backlinks/summary/live`, {
      method:  "POST",
      headers: { Authorization: basicAuth(), "Content-Type": "application/json" },
      body:    JSON.stringify([{
        target:             domain,
        include_subdomains: true,
        internal_list_limit: 10,
      }]),
    });

    // Non-2xx responses can still carry plan-access signals in the body.
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      if (res.status === 401 || res.status === 403 || isPlanAccessMessage(text)) {
        return NextResponse.json({
          success: false,
          reason:  "plan_access",
          message: "Backlinks data is not included in your DataForSEO plan.",
        });
      }
      throw new Error(`DataForSEO ${res.status}: ${text.slice(0, 180)}`);
    }

    const data = await res.json();
    const task = data?.tasks?.[0];

    if (task?.status_code !== 20000) {
      const msg = task?.status_message as string | undefined;
      // 40100 = access denied on this endpoint, 40500 family = plan gating.
      if (task?.status_code === 40100 || task?.status_code === 40500 || isPlanAccessMessage(msg)) {
        return NextResponse.json({
          success: false,
          reason:  "plan_access",
          message: "Backlinks data is not included in your DataForSEO plan.",
        });
      }
      throw new Error(`DFS ${task?.status_code ?? "?"}: ${msg ?? "Backlinks task failed"}`);
    }

    const result = task?.result?.[0] ?? {};

    return NextResponse.json({
      success:          true,
      domain,
      backlinks:        result.backlinks           ?? 0,
      referringDomains: result.referring_domains   ?? 0,
      domainRank:       result.rank                ?? 0,
      brokenBacklinks:  result.broken_backlinks    ?? 0,
      brokenPages:      result.broken_pages        ?? 0,
      referringIPs:     result.referring_ips       ?? 0,
      dofollow:         result.backlinks_spam_score ?? 0,
      newBacklinks:     result.new_backlinks_14d   ?? 0,
      lostBacklinks:    result.lost_backlinks_14d  ?? 0,
    });

  } catch (err: any) {
    console.error("[backlinks]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
