// lib/google-trends.ts
// =============================================================================
// AI Marketing Lab — Google Trends helper (direct HTTP)
//
// Why no npm dependency:
//   The obvious pick would be `google-trends-api`, but our build environment
//   can't reach the public npm registry. The library is a thin wrapper around
//   Trends' JSON endpoints anyway — we replicate that here with `fetch`.
//
// Endpoints used (all public, no auth required):
//   /trends/api/explore                 → returns a bundle of widget tokens
//   /trends/api/widgetdata/multiline    → interest over time
//   /trends/api/widgetdata/relatedsearches → top + rising related queries
//   /trends/api/dailytrends             → today's trending searches
//
// All of these prefix their JSON response with `)]}',\n` (XSSI protection).
// We strip that prefix before JSON.parse.
//
// Caveats:
//   - Trends is rate-limited per IP. Returning a calm "unavailable" state when
//     Google 429s is intentional — we don't want to burn retries here.
//   - No SLA; Google has broken this shape historically. Wrap every call in
//     try/catch at the route level.
// =============================================================================
//
// If you ever want to swap to the npm lib: `npm i google-trends-api` and
// replace the `fetch` calls below. The response shapes match so the helpers
// (getInterestOverTime, getRelatedQueries, getTrendingNow) stay stable.
// =============================================================================

const TRENDS_BASE = "https://trends.google.com/trends/api";

// Google uses location codes a UK user would actually recognise; mapping kept
// here instead of inline at the call sites so the rest of the codebase never
// has to guess "UK" vs "GB".
export const TRENDS_GEO = {
  UK: "GB",
  US: "US",
  CA: "CA",
  AU: "AU",
  WORLD: "",
} as const;

export type TrendsGeo = (typeof TRENDS_GEO)[keyof typeof TRENDS_GEO];

// Sensible default — aligns with GSC default country in our app.
const DEFAULT_GEO: TrendsGeo = TRENDS_GEO.UK;

// ─── low-level fetch helpers ─────────────────────────────────────────────────

/** Strip the `)]}',` XSSI prefix Google adds to all Trends JSON responses. */
function stripXssi(body: string): string {
  return body.replace(/^\)\]\}',?\s*/, "");
}

/** Pretty error for logs / banners. */
function err(context: string, e: unknown): Error {
  return new Error(`Google Trends ${context} failed: ${(e as Error).message ?? e}`);
}

async function trendsFetch(path: string, params: Record<string, string>): Promise<any> {
  const qs   = new URLSearchParams(params).toString();
  const url  = `${TRENDS_BASE}${path}?${qs}`;
  const res  = await fetch(url, {
    headers: {
      // A real browser-ish UA avoids occasional 429s for "suspicious" clients.
      "User-Agent":
        "Mozilla/5.0 (AI Marketing Lab; +https://aimarketinglab.co.uk) Chrome/124 Safari/537",
      Accept:          "application/json, text/plain, */*",
      "Accept-Language": "en-GB,en;q=0.9",
    },
    // Cache at the edge — Trends data doesn't change every second.
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  }
  const text = await res.text();
  return JSON.parse(stripXssi(text));
}

// ─── explore → widget tokens ─────────────────────────────────────────────────
//
// Every Trends query is a two-step dance:
//   1. POST/GET explore with the query + timeframe + geo → receive a set of
//      "widgets", each with its own token.
//   2. Use the token of the widget you want (TIMESERIES, RELATED_QUERIES, etc.)
//      to fetch the actual data from widgetdata/*.
//
// We cache the explore response for 5 minutes per (keyword, geo, timeframe).
// ─────────────────────────────────────────────────────────────────────────────

type ExploreWidget = {
  id:       string;
  title:    string;
  token:    string;
  request:  object;
};

async function explore(keyword: string, geo: TrendsGeo, timeframe: string): Promise<ExploreWidget[]> {
  const req = {
    comparisonItem: [{ keyword, geo, time: timeframe }],
    category:       0,
    property:       "",
  };
  const data = await trendsFetch("/explore", {
    hl:   "en-GB",
    tz:   "0",
    req:  JSON.stringify(req),
  });
  return (data?.widgets ?? []) as ExploreWidget[];
}

// ─── public helpers ──────────────────────────────────────────────────────────

export type InterestPoint = { date: string; value: number };

/**
 * Interest over time for a single keyword.
 * Returns a normalised 0-100 series (that's Google's own scaling — it's
 * relative to the peak, not absolute search volume).
 */
export async function getInterestOverTime(
  keyword: string,
  geo: TrendsGeo = DEFAULT_GEO,
  timeframe = "today 12-m",
): Promise<InterestPoint[]> {
  try {
    const widgets = await explore(keyword, geo, timeframe);
    const ts      = widgets.find(w => w.id === "TIMESERIES");
    if (!ts) return [];

    const data = await trendsFetch("/widgetdata/multiline", {
      hl:    "en-GB",
      tz:    "0",
      req:   JSON.stringify(ts.request),
      token: ts.token,
    });

    const points = data?.default?.timelineData ?? [];
    return points.map((p: any) => ({
      date:  p.formattedTime ?? p.formattedAxisTime ?? "",
      value: Array.isArray(p.value) ? (p.value[0] ?? 0) : 0,
    }));
  } catch (e) {
    throw err("interest-over-time", e);
  }
}

export type RelatedQuery = { query: string; value: number; link?: string };
export type RelatedQueriesResult = { top: RelatedQuery[]; rising: RelatedQuery[] };

/**
 * Related queries for a seed keyword.
 * - `top`:    the most consistently searched related queries.
 * - `rising`: queries whose interest has grown fastest recently.
 *
 * Rising = the closest thing to "opportunity keywords" — terms that are
 * trending upward right now.
 */
export async function getRelatedQueries(
  keyword: string,
  geo: TrendsGeo = DEFAULT_GEO,
  timeframe = "today 12-m",
): Promise<RelatedQueriesResult> {
  try {
    const widgets = await explore(keyword, geo, timeframe);
    // There are usually two RELATED_QUERIES widgets (top + rising) — Google
    // differentiates them by the `request.restriction.complexKeywordsRestriction`
    // vs the risingIdx boolean in request. Simpler: both map to the same
    // widgetdata endpoint, both tokens work, and the response splits them.
    const rq = widgets.find(w => w.id === "RELATED_QUERIES");
    if (!rq) return { top: [], rising: [] };

    const data = await trendsFetch("/widgetdata/relatedsearches", {
      hl:    "en-GB",
      tz:    "0",
      req:   JSON.stringify(rq.request),
      token: rq.token,
    });

    const rank = data?.default?.rankedList ?? [];
    // rank[0] = top, rank[1] = rising (Google returns them in that order).
    const toQuery = (row: any): RelatedQuery => ({
      query: row?.query ?? "",
      value: Number(row?.value ?? 0),
      link:  row?.link ? `https://trends.google.com${row.link}` : undefined,
    });
    return {
      top:    (rank[0]?.rankedKeyword ?? []).map(toQuery).filter((q: RelatedQuery) => q.query),
      rising: (rank[1]?.rankedKeyword ?? []).map(toQuery).filter((q: RelatedQuery) => q.query),
    };
  } catch (e) {
    throw err("related-queries", e);
  }
}

export type TrendingSearch = {
  title:    string;
  traffic:  string;  // e.g. "20K+"
  articles: Array<{ title: string; url: string; source: string }>;
};

/**
 * Today's trending searches for a country. Pure "what's hot now" signal, not
 * tied to any keyword. Good for a dashboard widget.
 */
export async function getTrendingNow(
  geo: TrendsGeo = DEFAULT_GEO,
): Promise<TrendingSearch[]> {
  try {
    const data = await trendsFetch("/dailytrends", {
      hl:  "en-GB",
      tz:  "0",
      geo: geo || "GB",
      ns:  "15",
    });

    const days = data?.default?.trendingSearchesDays ?? [];
    const today = days[0]?.trendingSearches ?? [];

    return today.map((t: any) => ({
      title:   t?.title?.query ?? "",
      traffic: t?.formattedTraffic ?? "",
      articles: (t?.articles ?? []).slice(0, 3).map((a: any) => ({
        title:  a?.title    ?? "",
        url:    a?.url      ?? "",
        source: a?.source   ?? "",
      })),
    })).filter((t: TrendingSearch) => t.title);
  } catch (e) {
    throw err("trending-now", e);
  }
}

// ─── timeframe presets ───────────────────────────────────────────────────────
//
// Google's timeframe strings are oddly specific — these are the ones the
// Trends UI actually uses. Exported so routes don't need to remember them.
// ─────────────────────────────────────────────────────────────────────────────
export const TRENDS_TIMEFRAMES = {
  "last-day":      "now 1-d",
  "last-7-days":   "now 7-d",
  "last-30-days":  "today 1-m",
  "last-3-months": "today 3-m",
  "last-12-months":"today 12-m",
  "last-5-years":  "today 5-y",
} as const;
export type TrendsTimeframe = keyof typeof TRENDS_TIMEFRAMES;
