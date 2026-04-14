// app/api/dataforseo/serp/route.ts
// =============================================================================
// AI Marketing Labs — DataForSEO SERP API Route
// Live SERP position checking + AI Overview detection
// Used by dashboard projection and keyword detail views
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
    const { keywords, domain, location_code = 2826 } = await request.json();

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json(
        { error: "keywords array is required" },
        { status: 400 }
      );
    }

    if (keywords.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 keywords per request" },
        { status: 400 }
      );
    }

    // Build tasks array — one task per keyword
    const tasks = keywords.map((kw: string) => ({
      keyword:       kw,
      location_code,
      language_code: "en",
      device:        "desktop",
      os:            "windows",
      depth:         10,  // Check top 10 results
    }));

    const data = await dfsPost(
      "/serp/google/organic/live/regular",
      tasks
    );

    const results = (data?.tasks ?? []).map((task: any) => {
      if (task?.status_code !== 20000) {
        return {
          keyword:    task?.data?.keyword ?? "",
          position:   null,
          url:        null,
          aiOverview: false,
          featured:   false,
          error:      task?.status_message,
        };
      }

      const items     = task?.result?.[0]?.items ?? [];
      const keyword   = task?.data?.keyword ?? "";

      // Find where our domain ranks in the results
      let position    = null;
      let rankingUrl  = null;

      if (domain) {
        const domainClean = domain.replace(/^https?:\/\/(www\.)?/, "");
        for (const item of items) {
          if (
            item.type === "organic" &&
            item.url?.includes(domainClean)
          ) {
            position   = item.rank_group;
            rankingUrl = item.url;
            break;
          }
        }
      }

      // Detect AI Overview presence (featured_snippet or ai_overview type)
      const hasAiOverview = items.some(
        (item: any) =>
          item.type === "ai_overview" ||
          item.type === "featured_snippet" ||
          item.type === "knowledge_graph"
      );

      // Detect featured snippet
      const hasFeatured = items.some(
        (item: any) => item.type === "featured_snippet"
      );

      // Top 3 organic results for context
      const topResults = items
        .filter((item: any) => item.type === "organic")
        .slice(0, 3)
        .map((item: any) => ({
          position: item.rank_group,
          url:      item.url,
          title:    item.title,
        }));

      return {
        keyword,
        position,
        url:        rankingUrl,
        aiOverview: hasAiOverview,
        featured:   hasFeatured,
        topResults,
      };
    });

    return NextResponse.json({
      success: true,
      results,
    });

  } catch (err: any) {
    console.error("[dataforseo/serp]", err.message);
    return NextResponse.json(
      { error: err.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}

// Convenience GET for single keyword check
// Usage: /api/dataforseo/serp?keyword=seo+tools&domain=example.com
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword");
  const domain  = searchParams.get("domain");

  if (!keyword) {
    return NextResponse.json(
      { error: "keyword query param required" },
      { status: 400 }
    );
  }

  try {
    const tasks = [
      {
        keyword,
        location_code: 2826,
        language_code: "en",
        device:        "desktop",
        os:            "windows",
        depth:         10,
      },
    ];

    const data    = await dfsPost("/serp/google/organic/live/regular", tasks);
    const task    = data?.tasks?.[0];
    const items   = task?.result?.[0]?.items ?? [];
    const domainClean = domain?.replace(/^https?:\/\/(www\.)?/, "") ?? "";

    let position   = null;
    let rankingUrl = null;

    if (domainClean) {
      for (const item of items) {
        if (item.type === "organic" && item.url?.includes(domainClean)) {
          position   = item.rank_group;
          rankingUrl = item.url;
          break;
        }
      }
    }

    const topResults = items
      .filter((item: any) => item.type === "organic")
      .slice(0, 3)
      .map((item: any) => ({
        position: item.rank_group,
        url:      item.url,
        title:    item.title,
      }));

    return NextResponse.json({
      success: true,
      results: [
        {
          keyword,
          position,
          url:        rankingUrl,
          aiOverview: items.some((i: any) => i.type === "ai_overview" || i.type === "featured_snippet"),
          featured:   items.some((i: any) => i.type === "featured_snippet"),
          topResults,
        },
      ],
    });
  } catch (err: any) {
    console.error("[dataforseo/serp GET]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
