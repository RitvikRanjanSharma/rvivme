export const DFS_BASE = "https://api.dataforseo.com/v3";

export type DataForSeoTask<T> = {
  data?: {
    keyword?: string;
  };
  result?: Array<{
    items?: T[];
    target_metrics?: {
      organic?: {
        count?: number;
      };
    };
    total_count?: number;
  }>;
  status_code?: number;
  status_message?: string;
};

export type DataForSeoResponse<T> = {
  tasks?: Array<DataForSeoTask<T>>;
};

export type DataForSeoOrganicMetrics = {
  count?: number;
  etv?: number;
};

export type DataForSeoTrafficItem = {
  domain_rank?: number;
  metrics?: {
    organic?: DataForSeoOrganicMetrics;
  };
  target?: string;
};

export type DataForSeoCompetitorItem = {
  domain?: string;
  metrics?: {
    organic?: {
      count?: number;
    };
  };
};

export type DataForSeoKeywordItem = {
  keyword_data?: {
    keyword?: string;
    keyword_info?: {
      cpc?: number;
      search_volume?: number;
    };
    keyword_properties?: {
      keyword_difficulty?: number;
    };
    search_intent_info?: {
      main_intent?: string;
    };
  };
  ranked_serp_element?: {
    serp_item?: {
      rank_group?: number;
      type?: string;
      url?: string;
    };
  };
};

export type DataForSeoSerpItem = {
  rank_group?: number;
  title?: string;
  type?: string;
  url?: string;
};

export function dfsAuth(): string {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    throw new Error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set in .env.local");
  }

  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

export async function dfsPost<T>(
  endpoint: string,
  body: unknown,
): Promise<DataForSeoResponse<T>> {
  const response = await fetch(`${DFS_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: dfsAuth(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DataForSEO ${response.status}: ${text}`);
  }

  return (await response.json()) as DataForSeoResponse<T>;
}

export async function dfsGet<T>(endpoint: string): Promise<DataForSeoResponse<T>> {
  const response = await fetch(`${DFS_BASE}${endpoint}`, {
    headers: { Authorization: dfsAuth() },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`DataForSEO GET ${response.status}: ${response.statusText}`);
  }

  return (await response.json()) as DataForSeoResponse<T>;
}

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Internal server error";
}

export const LOCATIONS = {
  AU: 2036,
  CA: 2124,
  IN: 2356,
  UK: 2826,
  US: 2840,
} as const;

export function difficultyLabel(score: number): "low" | "medium" | "high" | "very-high" {
  if (score < 30) return "low";
  if (score < 55) return "medium";
  if (score < 75) return "high";
  return "very-high";
}

export function threatLevel(overlapPct: number): "low" | "medium" | "high" | "critical" {
  if (overlapPct > 60) return "critical";
  if (overlapPct > 40) return "high";
  if (overlapPct > 20) return "medium";
  return "low";
}
