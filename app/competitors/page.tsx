"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, RefreshCw, ShieldAlert, WifiOff, Zap } from "lucide-react";
import { useDomain } from "@/lib/useDomain";

type ThreatLevel = "critical" | "high" | "low" | "medium";

type Competitor = {
  competitor_url: string;
  content_gap: number;
  domain: string;
  domain_authority: number;
  keywords: number;
  monthly_traffic: number;
  overlap: number;
  threat: ThreatLevel;
  trend: "stable";
};

function formatCount(value: number) {
  return value.toLocaleString("en-GB");
}

function threatColor(threat: ThreatLevel) {
  switch (threat) {
    case "critical":
      return "#ef4444";
    case "high":
      return "#f97316";
    case "medium":
      return "#eab308";
    default:
      return "#22c55e";
  }
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "20px",
        padding: "18px",
      }}
    >
      <p style={{ color: "var(--text-tertiary)", fontSize: "0.8rem", margin: 0 }}>{label}</p>
      <p style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", letterSpacing: "-0.05em", margin: "8px 0 0" }}>{value}</p>
    </div>
  );
}

export default function CompetitorsPage() {
  const { domain, loading: domainLoading } = useDomain();
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("Not synced yet");

  useEffect(() => {
    const stored = window.localStorage.getItem("rvivme-brand");
    if (stored) {
      setBrandColor(stored);
    }
  }, []);

  const fetchCompetitors = useCallback(async () => {
    if (domainLoading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/dataforseo/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, limit: 10 }),
      });

      if (!response.ok) {
        throw new Error(`API error ${response.status}`);
      }

      const data = (await response.json()) as {
        competitors?: Competitor[];
        error?: string;
        success?: boolean;
      };

      if (!data.success) {
        throw new Error(data.error ?? "Unable to load competitors");
      }

      setCompetitors(data.competitors ?? []);
      setLastUpdated(new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to fetch competitors");
      setCompetitors([]);
    } finally {
      setLoading(false);
    }
  }, [domain, domainLoading]);

  useEffect(() => {
    void fetchCompetitors();
  }, [fetchCompetitors]);

  const stats = useMemo(() => {
    const avgOverlap =
      competitors.length > 0 ? Math.round(competitors.reduce((sum, item) => sum + item.overlap, 0) / competitors.length) : 0;
    const highThreat = competitors.filter((item) => item.threat === "critical" || item.threat === "high").length;
    const totalGap = competitors.reduce((sum, item) => sum + item.content_gap, 0);

    return [
      { label: "Competitors found", value: formatCount(competitors.length) },
      { label: "High threat rivals", value: formatCount(highThreat) },
      { label: "Average overlap", value: `${avgOverlap}%` },
      { label: "Estimated content gap", value: formatCount(totalGap) },
    ];
  }, [competitors]);

  return (
    <div style={{ margin: "0 auto", maxWidth: "1280px", padding: "40px 24px 80px" }}>
      <div style={{ alignItems: "end", display: "flex", flexWrap: "wrap", gap: "18px", justifyContent: "space-between", marginBottom: "28px" }}>
        <div>
          <p style={{ color: "var(--brand)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", margin: 0, textTransform: "uppercase" }}>
            Competitor intelligence
          </p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 5vw, 3.6rem)", letterSpacing: "-0.06em", margin: "10px 0 0" }}>
            Rival tracking, without the clutter.
          </h1>
          <p style={{ color: "var(--text-secondary)", margin: "10px 0 0" }}>
            {domainLoading ? "Loading workspace domain..." : `Domain: ${domain}`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchCompetitors()}
          style={{
            alignItems: "center",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "999px",
            color: "var(--text-secondary)",
            display: "flex",
            gap: "8px",
            padding: "12px 16px",
          }}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error ? (
        <div
          style={{
            alignItems: "center",
            background: "rgba(245, 158, 11, 0.12)",
            border: "1px solid rgba(245, 158, 11, 0.26)",
            borderRadius: "18px",
            color: "#f59e0b",
            display: "flex",
            gap: "10px",
            marginBottom: "24px",
            padding: "14px 16px",
          }}
        >
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: "24px" }}>
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={loading ? "..." : stat.value} />
        ))}
      </div>

      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "24px",
          padding: "20px",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "space-between", marginBottom: "18px" }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", letterSpacing: "-0.05em", margin: 0 }}>Competitor registry</h2>
            <p style={{ color: "var(--text-secondary)", margin: "8px 0 0" }}>Last updated: {lastUpdated}</p>
          </div>

          <div
            style={{
              alignItems: "center",
              background: "rgba(var(--brand-rgb), 0.12)",
              border: "1px solid rgba(var(--brand-rgb), 0.24)",
              borderRadius: "999px",
              color: brandColor,
              display: "flex",
              gap: "8px",
              padding: "10px 14px",
            }}
          >
            <ShieldAlert size={15} />
            Live threat view
          </div>
        </div>

        {loading ? (
          <div style={{ color: "var(--text-secondary)", padding: "24px 4px" }}>Loading competitor data...</div>
        ) : competitors.length === 0 ? (
          <div style={{ color: "var(--text-secondary)", padding: "30px 4px", textAlign: "center" }}>
            <WifiOff size={20} style={{ marginBottom: "10px" }} />
            <div>No competitor data available yet.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["Domain", "Threat", "Authority", "Traffic", "Keywords", "Overlap", "Gap", "Open"].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        color: "var(--text-tertiary)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.75rem",
                        letterSpacing: "0.08em",
                        padding: "12px 10px",
                        textAlign: "left",
                        textTransform: "uppercase",
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {competitors.map((item) => (
                  <tr key={item.domain}>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>
                      <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{item.domain}</div>
                      <div style={{ color: "var(--text-tertiary)", fontSize: "0.85rem", marginTop: "4px" }}>{item.competitor_url}</div>
                    </td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>
                      <span
                        style={{
                          background: `${threatColor(item.threat)}1f`,
                          border: `1px solid ${threatColor(item.threat)}40`,
                          borderRadius: "999px",
                          color: threatColor(item.threat),
                          padding: "4px 8px",
                        }}
                      >
                        {item.threat}
                      </span>
                    </td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>{item.domain_authority}/100</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>{formatCount(item.monthly_traffic)}</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>{formatCount(item.keywords)}</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>{item.overlap}%</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>{formatCount(item.content_gap)}</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>
                      <a
                        href={item.competitor_url}
                        rel="noreferrer"
                        target="_blank"
                        style={{ alignItems: "center", color: brandColor, display: "inline-flex", gap: "6px", textDecoration: "none" }}
                      >
                        Visit
                        <ExternalLink size={14} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!loading && competitors.length === 0 ? (
        <div
          style={{
            alignItems: "center",
            background: "rgba(var(--brand-rgb), 0.1)",
            border: "1px solid rgba(var(--brand-rgb), 0.2)",
            borderRadius: "20px",
            display: "flex",
            gap: "10px",
            marginTop: "24px",
            padding: "16px",
          }}
        >
          <Zap size={16} color={brandColor} />
          <span style={{ color: "var(--text-secondary)" }}>
            This usually means the domain is early-stage or DataForSEO is not connected yet. The page is ready for live data as soon as it is.
          </span>
        </div>
      ) : null}
    </div>
  );
}
