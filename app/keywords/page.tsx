"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Search, WifiOff, Zap } from "lucide-react";
import { useDomain } from "@/lib/useDomain";

type Difficulty = "low" | "medium" | "high" | "very-high";
type Intent = "commercial" | "informational" | "navigational" | "transactional";

type ApiKeyword = {
  aiOverview: boolean;
  ctr: number;
  difficulty: number;
  featured: boolean;
  intent: string;
  position: number;
  term: string;
  url: string;
  volume: number;
};

type KeywordRow = {
  aiOverview: boolean;
  ctr: number;
  difficulty: Difficulty;
  featured: boolean;
  intent: Intent;
  position: number;
  term: string;
  url: string;
  volume: number;
};

function difficultyLabel(score: number): Difficulty {
  if (score < 30) return "low";
  if (score < 55) return "medium";
  if (score < 75) return "high";
  return "very-high";
}

function normalizeIntent(intent: string): Intent {
  if (intent === "commercial" || intent === "navigational" || intent === "transactional") {
    return intent;
  }

  return "informational";
}

function surfaceNumber(value: number) {
  return value.toLocaleString("en-GB");
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

export default function KeywordsPage() {
  const { domain, loading: domainLoading } = useDomain();
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [error, setError] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<KeywordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("Not synced yet");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem("rvivme-brand");
    if (stored) {
      setBrandColor(stored);
    }
  }, []);

  const fetchKeywords = useCallback(async () => {
    if (domainLoading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/dataforseo/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, limit: 50 }),
      });

      if (!response.ok) {
        throw new Error(`API error ${response.status}`);
      }

      const data = (await response.json()) as {
        error?: string;
        keywords?: ApiKeyword[];
        success?: boolean;
      };

      if (!data.success) {
        throw new Error(data.error ?? "Unable to load keywords");
      }

      setKeywords(
        (data.keywords ?? []).map((item) => ({
          aiOverview: item.aiOverview,
          ctr: item.ctr,
          difficulty: difficultyLabel(item.difficulty),
          featured: item.featured,
          intent: normalizeIntent(item.intent),
          position: item.position,
          term: item.term,
          url: item.url,
          volume: item.volume,
        })),
      );
      setLastUpdated(new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to fetch keywords");
      setKeywords([]);
    } finally {
      setLoading(false);
    }
  }, [domain, domainLoading]);

  useEffect(() => {
    void fetchKeywords();
  }, [fetchKeywords]);

  const filteredKeywords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return keywords;
    }

    return keywords.filter((item) => item.term.toLowerCase().includes(normalizedQuery));
  }, [keywords, query]);

  const stats = useMemo(() => {
    const top3 = keywords.filter((item) => item.position > 0 && item.position <= 3).length;
    const top10 = keywords.filter((item) => item.position > 0 && item.position <= 10).length;
    const avgPosition =
      keywords.length > 0 ? (keywords.reduce((sum, item) => sum + item.position, 0) / keywords.length).toFixed(1) : "0.0";

    return [
      { label: "Tracked keywords", value: surfaceNumber(keywords.length) },
      { label: "Top 3 rankings", value: surfaceNumber(top3) },
      { label: "Top 10 rankings", value: surfaceNumber(top10) },
      { label: "Average position", value: avgPosition },
    ];
  }, [keywords]);

  return (
    <div style={{ margin: "0 auto", maxWidth: "1280px", padding: "40px 24px 80px" }}>
      <div style={{ alignItems: "end", display: "flex", flexWrap: "wrap", gap: "18px", justifyContent: "space-between", marginBottom: "28px" }}>
        <div>
          <p style={{ color: "var(--brand)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", margin: 0, textTransform: "uppercase" }}>
            Keyword intelligence
          </p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 5vw, 3.6rem)", letterSpacing: "-0.06em", margin: "10px 0 0" }}>
            Ranking signal, cleaned up.
          </h1>
          <p style={{ color: "var(--text-secondary)", margin: "10px 0 0" }}>
            {domainLoading ? "Loading workspace domain..." : `Domain: ${domain}`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchKeywords()}
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
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", letterSpacing: "-0.05em", margin: 0 }}>Keyword registry</h2>
            <p style={{ color: "var(--text-secondary)", margin: "8px 0 0" }}>Last updated: {lastUpdated}</p>
          </div>

          <label
            style={{
              alignItems: "center",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "999px",
              display: "flex",
              gap: "8px",
              padding: "10px 14px",
            }}
          >
            <Search size={15} color="var(--text-tertiary)" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search keywords"
              style={{ background: "transparent", border: "none", color: "var(--text-primary)", outline: "none", width: "220px" }}
            />
          </label>
        </div>

        {loading ? (
          <div style={{ color: "var(--text-secondary)", padding: "24px 4px" }}>Loading keyword data...</div>
        ) : filteredKeywords.length === 0 ? (
          <div style={{ color: "var(--text-secondary)", padding: "30px 4px", textAlign: "center" }}>
            <WifiOff size={20} style={{ marginBottom: "10px" }} />
            <div>No keyword data available yet.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["Keyword", "Position", "Volume", "CTR", "Difficulty", "Intent", "Features"].map((heading) => (
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
                {filteredKeywords.map((item) => (
                  <tr key={`${item.term}-${item.url}`}>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>
                      <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{item.term}</div>
                      <div style={{ color: "var(--text-tertiary)", fontSize: "0.85rem", marginTop: "4px" }}>{item.url || "No landing page captured"}</div>
                    </td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>#{item.position}</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>{surfaceNumber(item.volume)}</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>{item.ctr}%</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>{item.difficulty}</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>{item.intent}</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "14px 10px" }}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        {item.featured ? (
                          <span
                            style={{
                              background: "rgba(245, 158, 11, 0.14)",
                              border: "1px solid rgba(245, 158, 11, 0.24)",
                              borderRadius: "999px",
                              color: "#f59e0b",
                              fontSize: "0.75rem",
                              padding: "4px 8px",
                            }}
                          >
                            Featured
                          </span>
                        ) : null}
                        {item.aiOverview ? (
                          <span
                            style={{
                              background: "rgba(var(--brand-rgb), 0.12)",
                              border: "1px solid rgba(var(--brand-rgb), 0.24)",
                              borderRadius: "999px",
                              color: brandColor,
                              fontSize: "0.75rem",
                              padding: "4px 8px",
                            }}
                          >
                            AI overview
                          </span>
                        ) : null}
                        {!item.featured && !item.aiOverview ? <span style={{ color: "var(--text-tertiary)" }}>None</span> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!loading && keywords.length === 0 ? (
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
            This usually means the domain is new or DataForSEO credentials are not configured yet. The page is ready either way.
          </span>
        </div>
      ) : null}
    </div>
  );
}
