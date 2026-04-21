// app/api/dataforseo/domain-metrics/route.ts
// =============================================================================
// AI Marketing Lab — Domain Metrics
// Given a list of domains, returns keyword count + monthly traffic + domain rank
// for each. Used by the competitors page to show numbers for manually-added
// competitors (which competitors_domain endpoint would never surface).
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { dfsPost, extractErrorMessage, type DataForSeoTrafficItem } from "@/lib/dataforseo";

export async function POST(request: NextRequest) {
  try {
    const { domains } = (await request.json()) as { domains?: string[] };

    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return NextResponse.json({ error: "domains (non-empty array) is required" }, { status: 400 });
    }

    const cleaned = domains
      .map(d => String(d).trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, ""))
      .filter(Boolean);

    if (cleaned.length === 0) {
      return NextResponse.json({ metrics: {} });
    }

    const data = await dfsPost<DataForSeoTrafficItem>(
      "/dataforseo_labs/google/bulk_traffic_estimation/live",
      [{ targets: cleaned, location_code: 2826, language_code: "en" }],
    );

    const items = data.tasks?.[0]?.result?.[0]?.items ?? [];
    const metrics: Record<string, { domain: string; domain_authority: number; monthly_traffic: number; keywords: number; }> = {};

    for (const item of items) {
      if (!item.target) continue;
      const organic = item.metrics?.organic;
      metrics[item.target] = {
        domain:           item.target,
        domain_authority: Math.round(item.domain_rank ?? 0),
        monthly_traffic:  Math.round(organic?.etv   ?? 0),
        keywords:         Math.round(organic?.count ?? 0),
      };
    }

    // Ensure every requested domain has a row, even if the API returned none.
    for (const d of cleaned) {
      if (!metrics[d]) {
        metrics[d] = { domain: d, domain_authority: 0, monthly_traffic: 0, keywords: 0 };
      }
    }

    return NextResponse.json({ success: true, metrics });
  } catch (error) {
    const message = extractErrorMessage(error);
    console.error("[dataforseo/domain-metrics]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
