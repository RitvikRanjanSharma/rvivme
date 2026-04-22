// app/api/dataforseo/domain-metrics/route.ts
// =============================================================================
// AI Marketing Lab — Domain Metrics
// Given a list of domains, returns keyword count + monthly traffic + a pseudo
// domain-authority score for each. Used by the competitors page to show numbers
// for manually-added competitors (which competitors_domain would never surface).
//
// Notes
// -----
// * DataForSEO's `bulk_traffic_estimation` endpoint does NOT return a real
//   domain_rank field on the Standard plan — the true DR metric lives behind
//   the Backlinks subscription. We derive a 0–100 pseudo-DA from ranked
//   keyword count, which is a decent proxy for the purpose of the UI.
//
// * Our primary location is UK (2826) because the product itself is UK-first,
//   but for US-headquartered competitors (e.g. semrush.com) UK data is often
//   close to zero. When the UK call returns an empty row for a target, we
//   retry that target against US (2840) so the authority column isn't just a
//   sea of zeros.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { dfsPost, extractErrorMessage, type DataForSeoTrafficItem } from "@/lib/dataforseo";

type Metric = {
  domain:           string;
  domain_authority: number;
  monthly_traffic:  number;
  keywords:         number;
};

/** Log-scaled 0–100 pseudo-DA derived from ranked keyword count. */
function pseudoDa(count: number, etv: number): number {
  if (!count && !etv) return 0;
  // Keyword count dominates; etv nudges the score up for high-traffic domains.
  const base  = Math.log10(Math.max(count, 1)) * 15;      // 0 → 0, 1k → 45, 100k → 75
  const boost = Math.min(15, Math.log10(Math.max(etv, 1)) * 3);
  return Math.min(100, Math.round(base + boost));
}

async function bulkTraffic(targets: string[], location_code: number) {
  const data = await dfsPost<DataForSeoTrafficItem>(
    "/dataforseo_labs/google/bulk_traffic_estimation/live",
    [{ targets, location_code, language_code: "en" }],
  );
  const task = data.tasks?.[0];
  if (task?.status_code && task.status_code !== 20000) {
    // Non-fatal — log and return empty so we can still respond with zero rows
    // rather than failing the whole request.
    console.warn(`[domain-metrics] DFS ${location_code}: ${task.status_code} ${task.status_message ?? ""}`);
    return [] as DataForSeoTrafficItem[];
  }
  return task?.result?.[0]?.items ?? [];
}

function toMetric(item: DataForSeoTrafficItem): Metric {
  const organic = item.metrics?.organic ?? {};
  const etv     = Number(organic.etv ?? 0);
  const count   = Number(organic.count ?? 0);
  // If the endpoint DOES happen to return a real domain_rank, prefer it;
  // otherwise fall back to our computed pseudo-DA.
  const raw     = Number((item as { domain_rank?: number }).domain_rank ?? 0);
  const da      = raw > 0 ? Math.min(100, Math.round(raw / 10)) : pseudoDa(count, etv);
  return {
    domain:           item.target ?? "",
    domain_authority: da,
    monthly_traffic:  Math.round(etv),
    keywords:         Math.round(count),
  };
}

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
      return NextResponse.json({ success: true, metrics: {} });
    }

    // Pass 1: UK (primary market).
    const ukItems = await bulkTraffic(cleaned, 2826);
    const metrics: Record<string, Metric> = {};
    for (const it of ukItems) {
      if (!it.target) continue;
      metrics[it.target] = toMetric(it);
    }

    // Pass 2: for any target that came back empty (no keywords, no traffic),
    // retry with US data so US-HQ competitors get meaningful numbers.
    const emptyTargets = cleaned.filter(d => {
      const m = metrics[d];
      return !m || (m.keywords === 0 && m.monthly_traffic === 0);
    });

    if (emptyTargets.length > 0) {
      const usItems = await bulkTraffic(emptyTargets, 2840);
      for (const it of usItems) {
        if (!it.target) continue;
        const fresh = toMetric(it);
        // Only overwrite if the US data is actually richer.
        if (fresh.keywords > 0 || fresh.monthly_traffic > 0) {
          metrics[it.target] = fresh;
        }
      }
    }

    // Ensure every requested domain has a row, even if both passes returned
    // nothing — the UI shouldn't have to handle missing keys.
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
