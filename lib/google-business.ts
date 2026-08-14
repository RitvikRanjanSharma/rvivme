// lib/google-business.ts
// =============================================================================
// AI Marketing Lab — Google Business Profile
//
// THE THING TO UNDERSTAND BEFORE READING THIS FILE
//
// Unlike Search Console and Analytics, the Business Profile APIs are gated
// twice over, and a user can be blocked at either gate while everything else
// in their account works perfectly:
//
//   Gate 1 — the business.manage OAuth scope. Restricted; the user has to
//            grant it explicitly, and we ask only when they open Local.
//   Gate 2 — API access approval. Google reviews an application form BY HAND
//            and enables the APIs on the Cloud project. Until that's granted,
//            every call returns 403 no matter how valid the token is.
//
// Gate 2 is the one that surprises people. A developer with a working OAuth
// flow and a perfectly good token still gets nothing, and Google's error body
// doesn't say "you haven't been approved" in plain words. So the whole point
// of the classification below is to tell the user precisely which gate they're
// behind and what to do about it, rather than showing a generic failure.
//
// Docs: https://developers.google.com/my-business/content/prereqs
// =============================================================================

const ACCOUNTS_API    = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO_API        = "https://mybusinessbusinessinformation.googleapis.com/v1";
const PERFORMANCE_API = "https://businessprofileperformance.googleapis.com/v1";

/** Every way a Business Profile call can fail, each with a different remedy. */
export type BusinessFailure =
  | "not_connected"       // no Google connection at all
  | "scope_missing"       // connected, but business.manage was never granted
  | "api_not_enabled"     // the API isn't enabled on the Cloud project
  | "access_not_granted"  // enabled, but Google hasn't approved API access
  | "no_profile"          // approved, but this Google account manages no profile
  | "rate_limited"
  | "api_error";

export type BusinessResult<T> =
  | { ok: true;  data: T }
  | { ok: false; reason: BusinessFailure; message: string };

/**
 * Turn Google's error body into the specific gate the caller is behind.
 *
 * Google returns 403 for several unrelated conditions and distinguishes them
 * only in prose inside the error message, so this is string matching by
 * necessity rather than by choice. Each branch is ordered most-specific first.
 */
function classifyError(status: number, body: string): { reason: BusinessFailure; message: string } {
  const text = body.toLowerCase();

  if (status === 429 || text.includes("quota") || text.includes("rate limit")) {
    return {
      reason: "rate_limited",
      message: "Google is rate-limiting Business Profile requests. Try again shortly.",
    };
  }

  if (status === 403 || status === 401) {
    // "has not been used in project X before or it is disabled"
    if (text.includes("has not been used in project") || text.includes("is disabled")) {
      return {
        reason: "api_not_enabled",
        message: "The Business Profile APIs aren't enabled on your Google Cloud project yet.",
      };
    }
    if (text.includes("insufficient") || text.includes("scope")) {
      return {
        reason: "scope_missing",
        message: "Your Google connection doesn't include Business Profile permission.",
      };
    }
    // The default reading of a 403 here: token is fine, project is fine, but
    // Google hasn't approved this project for Business Profile API access.
    return {
      reason: "access_not_granted",
      message: "Google hasn't approved this project for Business Profile API access yet.",
    };
  }

  return {
    reason: "api_error",
    message: `Business Profile API returned ${status}.`,
  };
}

async function call<T>(url: string, accessToken: string): Promise<BusinessResult<T>> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      // These endpoints are slow; a short timeout produces confusing failures.
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const { reason, message } = classifyError(res.status, body);
      console.warn("[google-business]", res.status, reason, body.slice(0, 300));
      return { ok: false, reason, message };
    }

    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: "api_error",
      message: msg.includes("timeout") || msg.includes("abort")
        ? "Google didn't respond in time."
        : "Couldn't reach the Business Profile API.",
    };
  }
}

// ─── accounts and locations ──────────────────────────────────────────────────

export type BusinessAccount = { name: string; accountName?: string; type?: string };

export type BusinessLocation = {
  name:         string;   // "locations/12345"
  title?:       string;
  storefrontAddress?: {
    addressLines?:  string[];
    locality?:      string;
    postalCode?:    string;
    regionCode?:    string;
  };
  websiteUri?:  string;
  phoneNumbers?: { primaryPhone?: string };
  regularHours?: { periods?: unknown[] };
  categories?:  { primaryCategory?: { displayName?: string } };
  profile?:     { description?: string };
  latlng?:      { latitude?: number; longitude?: number };
  serviceArea?: unknown;
};

export async function listAccounts(accessToken: string): Promise<BusinessResult<BusinessAccount[]>> {
  const r = await call<{ accounts?: BusinessAccount[] }>(`${ACCOUNTS_API}/accounts`, accessToken);
  if (!r.ok) return r;
  const accounts = r.data.accounts ?? [];
  if (accounts.length === 0) {
    return {
      ok: false,
      reason: "no_profile",
      message: "This Google account doesn't manage any Business Profiles.",
    };
  }
  return { ok: true, data: accounts };
}

/** readMask is mandatory on this endpoint — omitting it is a 400, not a default. */
const LOCATION_FIELDS = [
  "name", "title", "storefrontAddress", "websiteUri", "phoneNumbers",
  "regularHours", "categories", "profile", "latlng", "serviceArea",
].join(",");

export async function listLocations(
  accessToken: string,
  accountName: string,
): Promise<BusinessResult<BusinessLocation[]>> {
  const url = `${INFO_API}/${accountName}/locations?readMask=${encodeURIComponent(LOCATION_FIELDS)}&pageSize=100`;
  const r = await call<{ locations?: BusinessLocation[] }>(url, accessToken);
  if (!r.ok) return r;
  return { ok: true, data: r.data.locations ?? [] };
}

// ─── performance ─────────────────────────────────────────────────────────────

/**
 * The metrics worth a strategist's attention.
 *
 * Impressions are split four ways by Google (maps/search × desktop/mobile),
 * and that split is the interesting part: a business strong on Maps but weak
 * on Search has a different problem from one where it's reversed.
 */
export const BUSINESS_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "BUSINESS_CONVERSATIONS",
] as const;

export type BusinessMetric = (typeof BUSINESS_METRICS)[number];

export type MetricTotals = Partial<Record<BusinessMetric, number>>;

type TimeSeriesResponse = {
  multiDailyMetricTimeSeries?: Array<{
    dailyMetricTimeSeries?: Array<{
      dailyMetric?: string;
      timeSeries?: { datedValues?: Array<{ value?: string }> };
    }>;
  }>;
};

function dateParams(prefix: string, d: Date): string {
  return [
    `${prefix}.year=${d.getUTCFullYear()}`,
    `${prefix}.month=${d.getUTCMonth() + 1}`,
    `${prefix}.day=${d.getUTCDate()}`,
  ].join("&");
}

/**
 * Daily metrics for a location, summed over the window.
 *
 * Google returns each metric as a series of dated values with `value` absent
 * on zero days — not zero, absent. Treating a missing value as anything other
 * than zero would quietly inflate every total.
 */
export async function fetchLocationPerformance(
  accessToken: string,
  locationName: string,
  days = 30,
): Promise<BusinessResult<{ totals: MetricTotals; days: number }>> {
  const end   = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);

  // The location id alone is required here, not the full "locations/x" path.
  const locationId = locationName.replace(/^locations\//, "");

  const url =
    `${PERFORMANCE_API}/locations/${locationId}:fetchMultiDailyMetricsTimeSeries` +
    `?${BUSINESS_METRICS.map(m => `dailyMetrics=${m}`).join("&")}` +
    `&${dateParams("dailyRange.start_date", start)}` +
    `&${dateParams("dailyRange.end_date", end)}`;

  const r = await call<TimeSeriesResponse>(url, accessToken);
  if (!r.ok) return r;

  const totals: MetricTotals = {};
  for (const multi of r.data.multiDailyMetricTimeSeries ?? []) {
    for (const series of multi.dailyMetricTimeSeries ?? []) {
      const metric = series.dailyMetric as BusinessMetric | undefined;
      if (!metric) continue;
      const sum = (series.timeSeries?.datedValues ?? [])
        .reduce((acc, dv) => acc + Number(dv.value ?? 0), 0);
      totals[metric] = (totals[metric] ?? 0) + sum;
    }
  }

  return { ok: true, data: { totals, days } };
}

// ─── profile completeness ────────────────────────────────────────────────────

export type ProfileGap = {
  id:     string;
  label:  string;
  filled: boolean;
  why:    string;
  weight: number;
};

/**
 * Score a profile on the fields that actually affect local ranking and
 * conversion, with the reason attached to each.
 *
 * Google's own dashboard shows a completeness percentage without explaining
 * which gaps matter. Hours and categories move rankings; a description
 * essentially doesn't. Weighting them equally would send someone to spend an
 * afternoon on the wrong thing.
 */
export function scoreProfile(loc: BusinessLocation): { score: number; gaps: ProfileGap[] } {
  const gaps: ProfileGap[] = [
    {
      id: "category",
      label: "Primary category set",
      filled: Boolean(loc.categories?.primaryCategory?.displayName),
      why: "The single highest-impact field on the profile. Your primary category is most of how Google decides which searches you're eligible to appear for — the wrong one makes you invisible for the right queries.",
      weight: 3,
    },
    {
      id: "hours",
      label: "Opening hours",
      filled: Boolean(loc.regularHours?.periods?.length),
      why: "Profiles without hours are filtered out of \"open now\" searches entirely, which is a large share of local intent — especially on mobile.",
      weight: 3,
    },
    {
      id: "phone",
      label: "Phone number",
      filled: Boolean(loc.phoneNumbers?.primaryPhone),
      why: "Calls are the primary conversion for most local businesses. No number means the call button doesn't appear.",
      weight: 2,
    },
    {
      id: "website",
      label: "Website link",
      filled: Boolean(loc.websiteUri),
      why: "Links the profile to your site, which is how the two reinforce each other in Google's understanding of your business.",
      weight: 2,
    },
    {
      id: "address",
      label: "Address or service area",
      filled: Boolean(loc.storefrontAddress?.addressLines?.length || loc.serviceArea),
      why: "Without one of these, Google can't place you geographically and you won't surface in proximity searches at all.",
      weight: 3,
    },
    {
      id: "description",
      label: "Business description",
      filled: Boolean(loc.profile?.description),
      why: "Helps a human choose you once they've found you. Worth filling in, but it carries little ranking weight — do it after the fields above.",
      weight: 1,
    },
  ];

  const earned   = gaps.filter(g => g.filled).reduce((s, g) => s + g.weight, 0);
  const possible = gaps.reduce((s, g) => s + g.weight, 0);

  return { score: Math.round((earned / possible) * 100), gaps };
}
