// app/api/dataforseo/competitors/route.ts
// =============================================================================
// RVIVME — DataForSEO Competitors API Route
// Discovers competitor domains via keyword overlap analysis
// Returns domain metrics: authority, traffic estimate, keyword count
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";

const DFS_BASE = "https://api.dataforseo.com/v3";

function basicAuth(): string {
  const login    = process.env.DATAFORSEO_LOGIN!;
  const password = process.env.DATAFORSEO_PASSWORD!;
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

async function dfsPost(endpoint: string, body: unknown) {
  const res = await fetch(`${DFS_BASE}${endpoint}`, {
    method:  "POST",
    headers: {
      "Authorization": basicAuth(),
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`DataForSEO error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function POST(request: NextRequest) {
  try {
    const { domain, limit = 10 } = await request.json();

    if (!domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    // Step 1: Get competitor domains via organic competitors endpoint
    const competitorData = await dfsPost(
      "/dataforseo_labs/google/competitors_domain/live",
      [
        {
          target:        domain,
          location_code: 2826,   // United Kingdom
          language_code: "en",
          limit,
          filters: [
            ["metrics.organic.count", ">", 10],
          ],
          order_by: ["metrics.organic.count,desc"],
        },
      ]
    );

    const compTask = competitorData?.tasks?.[0];

    if (compTask?.status_code !== 20000) {
      throw new Error(compTask?.status_message ?? "Competitors task failed");
    }

    const compItems = compTask?.result?.[0]?.items ?? [];

    // Step 2: Get domain metrics for each competitor
    const competitorDomains = compItems
      .map((c: any) => c.domain)
      .filter(Boolean)
      .slice(0, limit);

    let metricsMap: Record<string, any> = {};

    if (competitorDomains.length > 0) {
      const metricsData = await dfsPost(
        "/dataforseo_labs/google/bulk_traffic_estimation/live",
        [
          {
            targets:       competitorDomains,
            location_code: 2826,
            language_code: "en",
          },
        ]
      );

      const metricsTask = metricsData?.tasks?.[0];
      if (metricsTask?.status_code === 20000) {
        const metricsItems = metricsTask?.result?.[0]?.items ?? [];
        metricsItems.forEach((m: any) => {
          metricsMap[m.target] = m;
        });
      }
    }

    // Normalise to our internal shape
    const competitors = compItems.map((item: any) => {
      const metrics  = metricsMap[item.domain] ?? {};
      const organic  = metrics?.metrics?.organic ?? {};
      const overlap  = item.metrics?.organic?.count ?? 0;
      const yourKws  = compTask?.result?.[0]?.target_metrics?.organic?.count ?? 1;
      const overlapPct = Math.min(
        100,
        Math.round((overlap / Math.max(yourKws, 1)) * 100)
      );

      return {
        domain:           item.domain ?? "",
        competitor_url:   `https://${item.domain}`,
        discovered_via_ai:false,
        domain_authority: Math.round(metrics?.domain_rank ?? 0),
        monthly_traffic:  Math.round(organic?.etv ?? 0),
        keywords:         Math.round(organic?.count ?? 0),
        overlap:          overlapPct,
        content_gap:      Math.max(0, Math.round((organic?.count ?? 0) - yourKws)),
        threat:           overlapPct > 60 ? "critical"
                          : overlapPct > 40 ? "high"
                          : overlapPct > 20 ? "medium"
                          : "low",
        trend: "stable",
      };
    });

    return NextResponse.json({
      success:     true,
      domain,
      competitors,
    });

  } catch (err: any) {
    console.error("[dataforseo/competitors]", err.message);
    return NextResponse.json(
      { error: err.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
