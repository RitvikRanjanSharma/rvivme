// app/api/dataforseo/backlinks/route.ts
// =============================================================================
// AI Marketing Labs — Backlinks Overview
// Uses DataForSEO backlinks summary endpoint
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";

const DFS_BASE = "https://api.dataforseo.com/v3";

function basicAuth() {
  return "Basic " + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");
}

export async function GET(request: NextRequest) {
  try {
    const domain = new URL(request.url).searchParams.get("domain");
    if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

    const res = await fetch(`${DFS_BASE}/backlinks/summary/live`, {
      method: "POST",
      headers: { "Authorization": basicAuth(), "Content-Type": "application/json" },
      body: JSON.stringify([{
        target:               domain,
        include_subdomains:   true,
        include_indirect_links: true,
        internal_list_limit:  10,
      }]),
    });

    if (!res.ok) throw new Error(`DataForSEO ${res.status}`);
    const data = await res.json();
    const task = data?.tasks?.[0];

    if (task?.status_code !== 20000) {
      throw new Error(task?.status_message ?? "Backlinks task failed");
    }

    const result = task?.result?.[0] ?? {};

    return NextResponse.json({
      success:          true,
      domain,
      backlinks:        result.backlinks            ?? 0,
      referringDomains: result.referring_domains    ?? 0,
      domainRank:       result.rank                 ?? 0,
      brokenBacklinks:  result.broken_backlinks      ?? 0,
      brokenPages:      result.broken_pages          ?? 0,
      referringIPs:     result.referring_ips         ?? 0,
      dofollow:         result.backlinks_spam_score   ?? 0,
      newBacklinks:     result.new_backlinks_14d      ?? 0,
      lostBacklinks:    result.lost_backlinks_14d     ?? 0,
    });

  } catch (err: any) {
    console.error("[backlinks]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
