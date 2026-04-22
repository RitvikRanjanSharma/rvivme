// app/api/dataforseo/competitors/route.ts
// =============================================================================
// AI Marketing Lab — Competitor Discovery
// Returns AI-discovered competitors with authority + traffic + overlap metrics.
//
// Implementation
// --------------
// 1. `competitors_domain/live`        → list of rival domains + their overlap
// 2. `bulk_traffic_estimation/live`   → etv + ranked kw count per domain
// 3. Pseudo-DA derived from keyword count (DR behind Backlinks plan)
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import {
  dfsPost,
  extractErrorMessage,
  type DataForSeoCompetitorItem,
  type DataForSeoTrafficItem,
} from "@/lib/dataforseo";

function pseudoDa(count: number, etv: number): number {
  if (!count && !etv) return 0;
  const base  = Math.log10(Math.max(count, 1)) * 15;
  const boost = Math.min(15, Math.log10(Math.max(etv, 1)) * 3);
  return Math.min(100, Math.round(base + boost));
}

export async function POST(request: NextRequest) {
  try {
    const { domain, limit = 10 } = (await request.json()) as {
      domain?: string;
      limit?: number;
    };

    if (!domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    const competitorData = await dfsPost<DataForSeoCompetitorItem>(
      "/dataforseo_labs/google/competitors_domain/live",
      [
        {
          target: domain,
          location_code: 2826,
          language_code: "en",
          limit,
          filters: [["metrics.organic.count", ">", 10]],
          order_by: ["metrics.organic.count,desc"],
        },
      ],
    );

    const competitorTask = competitorData.tasks?.[0];

    if (competitorTask?.status_code !== 20000) {
      throw new Error(competitorTask?.status_message ?? "Competitors task failed");
    }

    const competitorResult = competitorTask.result?.[0];
    const competitorItems = competitorResult?.items ?? [];
    const competitorDomains = competitorItems
      .map((item) => item.domain)
      .filter((item): item is string => Boolean(item))
      .slice(0, limit);

    const metricsMap: Record<string, DataForSeoTrafficItem> = {};

    if (competitorDomains.length > 0) {
      const metricsData = await dfsPost<DataForSeoTrafficItem>(
        "/dataforseo_labs/google/bulk_traffic_estimation/live",
        [
          {
            targets: competitorDomains,
            location_code: 2826,
            language_code: "en",
          },
        ],
      );

      const metricsTask = metricsData.tasks?.[0];
      const metricsItems = metricsTask?.result?.[0]?.items ?? [];

      for (const item of metricsItems) {
        if (item.target) {
          metricsMap[item.target] = item;
        }
      }
    }

    const yourKeywords = competitorResult?.target_metrics?.organic?.count ?? 1;

    const competitors = competitorItems.map((item) => {
      const domainName = item.domain ?? "";
      const metrics = metricsMap[domainName];
      const organic = metrics?.metrics?.organic;
      const etv     = Number(organic?.etv ?? 0);
      const kwCount = Number(organic?.count ?? 0);
      const overlap = item.metrics?.organic?.count ?? 0;
      const overlapPct = Math.min(100, Math.round((overlap / Math.max(yourKeywords, 1)) * 100));

      // Prefer a real domain_rank if DFS returns one, otherwise compute pseudo-DA
      // from the data we do have.
      const raw = Number((metrics as { domain_rank?: number } | undefined)?.domain_rank ?? 0);
      const da  = raw > 0 ? Math.min(100, Math.round(raw / 10)) : pseudoDa(kwCount, etv);

      return {
        competitor_url: `https://${domainName}`,
        content_gap: Math.max(0, Math.round(kwCount - yourKeywords)),
        discovered_via_ai: false,
        domain: domainName,
        domain_authority: da,
        keywords: Math.round(kwCount),
        monthly_traffic: Math.round(etv),
        overlap: overlapPct,
        threat:
          overlapPct > 60 ? "critical" : overlapPct > 40 ? "high" : overlapPct > 20 ? "medium" : "low",
        trend: "stable" as const,
      };
    });

    return NextResponse.json({
      success: true,
      domain,
      competitors,
    });
  } catch (error) {
    const message = extractErrorMessage(error);
    console.error("[dataforseo/competitors]", message);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
