import { NextResponse, type NextRequest } from "next/server";
import {
  dfsPost,
  extractErrorMessage,
  type DataForSeoSerpItem,
} from "@/lib/dataforseo";

type SerpResponseItem = {
  aiOverview: boolean;
  error?: string;
  featured: boolean;
  keyword: string;
  position: number | null;
  topResults: Array<{
    position: number | undefined;
    title: string | undefined;
    url: string | undefined;
  }>;
  url: string | null;
};

function normalizeDomain(domain: string) {
  return domain.replace(/^https?:\/\/(www\.)?/, "");
}

function findResultForDomain(items: DataForSeoSerpItem[], domain?: string) {
  if (!domain) {
    return { position: null, rankingUrl: null };
  }

  const domainClean = normalizeDomain(domain);

  for (const item of items) {
    if (item.type === "organic" && item.url?.includes(domainClean)) {
      return {
        position: item.rank_group ?? null,
        rankingUrl: item.url ?? null,
      };
    }
  }

  return { position: null, rankingUrl: null };
}

function createTopResults(items: DataForSeoSerpItem[]) {
  return items
    .filter((item) => item.type === "organic")
    .slice(0, 3)
    .map((item) => ({
      position: item.rank_group,
      title: item.title,
      url: item.url,
    }));
}

function createSerpResult(keyword: string, items: DataForSeoSerpItem[], domain?: string): SerpResponseItem {
  const { position, rankingUrl } = findResultForDomain(items, domain);

  return {
    keyword,
    position,
    url: rankingUrl,
    aiOverview: items.some((item) =>
      item.type === "ai_overview" || item.type === "featured_snippet" || item.type === "knowledge_graph",
    ),
    featured: items.some((item) => item.type === "featured_snippet"),
    topResults: createTopResults(items),
  };
}

export async function POST(request: NextRequest) {
  try {
    const { keywords, domain, location_code = 2826 } = (await request.json()) as {
      domain?: string;
      keywords?: string[];
      location_code?: number;
    };

    if (!Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: "keywords array is required" }, { status: 400 });
    }

    if (keywords.length > 100) {
      return NextResponse.json({ error: "Maximum 100 keywords per request" }, { status: 400 });
    }

    const tasks = keywords.map((keyword) => ({
      keyword,
      location_code,
      language_code: "en",
      device: "desktop",
      os: "windows",
      depth: 10,
    }));

    const data = await dfsPost<DataForSeoSerpItem>("/serp/google/organic/live/regular", tasks);

    const results = (data.tasks ?? []).map((task) => {
      if (task.status_code !== 20000) {
        return {
          keyword: task.data?.keyword ?? "",
          position: null,
          url: null,
          aiOverview: false,
          featured: false,
          error: task.status_message,
          topResults: [],
        };
      }

      return createSerpResult(task.data?.keyword ?? "", task.result?.[0]?.items ?? [], domain);
    });

    return NextResponse.json({ success: true, results });
  } catch (error) {
    const message = extractErrorMessage(error);
    console.error("[dataforseo/serp]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword");
  const domain = searchParams.get("domain") ?? undefined;

  if (!keyword) {
    return NextResponse.json({ error: "keyword query param required" }, { status: 400 });
  }

  try {
    const data = await dfsPost<DataForSeoSerpItem>("/serp/google/organic/live/regular", [
      {
        keyword,
        location_code: 2826,
        language_code: "en",
        device: "desktop",
        os: "windows",
        depth: 10,
      },
    ]);

    const task = data.tasks?.[0];
    const items = task?.result?.[0]?.items ?? [];

    return NextResponse.json({
      success: true,
      results: [createSerpResult(keyword, items, domain)],
    });
  } catch (error) {
    const message = extractErrorMessage(error);
    console.error("[dataforseo/serp GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
