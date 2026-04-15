import Link from "next/link";

const featureCards = [
  {
    eyebrow: "Monitor",
    title: "See SEO and GEO movement before it becomes a reporting fire drill.",
    copy: "Track volatility, visibility shifts, and competitor pressure across the search surfaces that matter now.",
  },
  {
    eyebrow: "Decide",
    title: "Turn noisy market signals into prioritized actions.",
    copy: "Connect ranking shifts, content gaps, and technical issues to recommended next moves your team can execute this week.",
  },
  {
    eyebrow: "Execute",
    title: "Keep content, insights, and operations in one rhythm.",
    copy: "From blog planning to keyword monitoring, Rvivme gives growth teams a calmer operating system for AI-assisted marketing.",
  },
] as const;

const stats = [
  { label: "Tracked surfaces", value: "Search, AI Overviews, and competitor pages" },
  { label: "Team focus", value: "SEO, content, and growth ops" },
  { label: "Primary outcome", value: "Clear weekly priorities instead of fragmented dashboards" },
] as const;

export default function HomePage() {
  return (
    <div
      style={{
        background:
          "radial-gradient(circle at top, rgba(var(--brand-rgb), 0.18), transparent 28%), linear-gradient(180deg, var(--bg), color-mix(in srgb, var(--bg) 84%, #081018))",
        minHeight: "100vh",
      }}
    >
      <section
        style={{
          margin: "0 auto",
          maxWidth: "1280px",
          padding: "72px 24px 40px",
        }}
      >
        <div
          className="hero-grid"
          style={{
            display: "grid",
            gap: "32px",
            gridTemplateColumns: "minmax(0, 1.25fr) minmax(320px, 0.75fr)",
          }}
        >
          <div>
            <p
              style={{
                color: "var(--brand)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.8rem",
                letterSpacing: "0.12em",
                marginBottom: "18px",
                textTransform: "uppercase",
              }}
            >
              AI marketing intelligence workspace
            </p>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(3rem, 8vw, 6rem)",
                letterSpacing: "-0.07em",
                lineHeight: 0.92,
                margin: 0,
                maxWidth: "12ch",
              }}
            >
              Marketing teams need signal, not more tabs.
            </h1>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "1.1rem",
                lineHeight: 1.7,
                margin: "24px 0 0",
                maxWidth: "58ch",
              }}
            >
              Rvivme is a focused front end for search intelligence, competitor monitoring, content planning, and brand-aware
              reporting. The project already had the bones of a product platform; this homepage turns it into a complete website.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", marginTop: "32px" }}>
              <Link
                href="/dashboard"
                style={{
                  background: "linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 55%, #081018))",
                  borderRadius: "999px",
                  boxShadow: "0 0 28px var(--brand-glow)",
                  color: "#ffffff",
                  padding: "14px 20px",
                  textDecoration: "none",
                }}
              >
                Open dashboard
              </Link>
              <Link
                href="/settings"
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "999px",
                  color: "var(--text-primary)",
                  padding: "14px 20px",
                  textDecoration: "none",
                }}
              >
                Configure workspace
              </Link>
            </div>

            <div
              style={{
                display: "grid",
                gap: "14px",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                marginTop: "40px",
              }}
            >
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--border)",
                    borderRadius: "20px",
                    padding: "18px",
                  }}
                >
                  <p
                    style={{
                      color: "var(--text-tertiary)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.75rem",
                      letterSpacing: "0.08em",
                      margin: 0,
                      textTransform: "uppercase",
                    }}
                  >
                    {stat.label}
                  </p>
                  <p style={{ margin: "10px 0 0" }}>{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              background:
                "linear-gradient(180deg, rgba(var(--brand-rgb), 0.16), rgba(var(--brand-rgb), 0.04) 24%, rgba(255, 255, 255, 0.02) 100%)",
              border: "1px solid rgba(var(--brand-rgb), 0.18)",
              borderRadius: "28px",
              padding: "24px",
            }}
          >
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "22px",
                padding: "18px",
              }}
            >
              <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "18px" }}>
                <div>
                  <p style={{ color: "var(--text-tertiary)", margin: 0 }}>Today</p>
                  <h2 style={{ fontFamily: "var(--font-display)", margin: "4px 0 0" }}>Visibility pulse</h2>
                </div>
                <span
                  style={{
                    background: "rgba(16, 185, 129, 0.14)",
                    border: "1px solid rgba(16, 185, 129, 0.24)",
                    borderRadius: "999px",
                    color: "#10b981",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.78rem",
                    padding: "6px 10px",
                  }}
                >
                  Stable
                </span>
              </div>

              <div
                style={{
                  background:
                    "linear-gradient(180deg, rgba(var(--brand-rgb), 0.22), rgba(var(--brand-rgb), 0.03) 55%, transparent 100%)",
                  borderRadius: "18px",
                  height: "220px",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    background:
                      "linear-gradient(90deg, transparent 0%, rgba(var(--brand-rgb), 0.35) 18%, rgba(var(--brand-rgb), 0.9) 46%, rgba(56, 189, 248, 0.65) 72%, transparent 100%)",
                    bottom: "48px",
                    clipPath:
                      "polygon(0% 75%, 10% 62%, 18% 68%, 28% 43%, 38% 48%, 48% 24%, 58% 38%, 68% 16%, 78% 26%, 88% 10%, 100% 0%, 100% 100%, 0% 100%)",
                    left: "0",
                    opacity: 0.95,
                    position: "absolute",
                    right: "0",
                    top: "28px",
                  }}
                />
                <div
                  style={{
                    background:
                      "repeating-linear-gradient(to right, transparent 0 62px, rgba(255,255,255,0.04) 62px 63px), repeating-linear-gradient(to top, transparent 0 50px, rgba(255,255,255,0.04) 50px 51px)",
                    inset: 0,
                    position: "absolute",
                  }}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gap: "10px",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  marginTop: "18px",
                }}
              >
                {[
                  { label: "Keyword volatility", value: "+14%" },
                  { label: "Competitor changes", value: "4 alerts" },
                  { label: "Content opportunities", value: "12 open" },
                ].map((metric) => (
                  <div key={metric.label} style={{ background: "var(--card)", borderRadius: "16px", padding: "14px" }}>
                    <p style={{ color: "var(--text-tertiary)", fontSize: "0.8rem", margin: 0 }}>{metric.label}</p>
                    <p style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", margin: "8px 0 0" }}>{metric.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ margin: "0 auto", maxWidth: "1280px", padding: "12px 24px 84px" }}>
        <div
          style={{
            display: "grid",
            gap: "18px",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          {featureCards.map((card) => (
            <article
              key={card.title}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "26px",
                padding: "24px",
              }}
            >
              <p
                style={{
                  color: "var(--brand)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.78rem",
                  letterSpacing: "0.08em",
                  margin: 0,
                  textTransform: "uppercase",
                }}
              >
                {card.eyebrow}
              </p>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.8rem",
                  letterSpacing: "-0.05em",
                  lineHeight: 1,
                  margin: "14px 0 0",
                }}
              >
                {card.title}
              </h2>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, margin: "14px 0 0" }}>{card.copy}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
