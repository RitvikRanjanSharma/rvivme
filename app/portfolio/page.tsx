"use client";

// app/portfolio/page.tsx
// ============================================================================
// Ritvik R. Sharma — profile page.
//
// Built from the CV, with one deliberate editorial decision: the strongest
// item is not on the CV at all. Anyone reading this is already looking at AI
// Marketing Lab, so the page leads with the product rather than the
// employment history — "I built the thing you are using" outranks any bullet
// point about a previous role.
//
// Everything here is from the CV. Nothing is inflated: the figures (11,700
// students, 6,000+ backlinks, 7% engagement lift) are as stated there, and
// where a claim would need a source it is phrased as what was done rather
// than what it achieved.
//
// The phone number on the CV is deliberately NOT published. A page indexed by
// Google is a different exposure from a PDF sent to a named recruiter, and
// scrapers harvest numbers. Email and LinkedIn are enough to start a
// conversation; add it back here if you disagree.
// ============================================================================

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Mail, ExternalLink } from "lucide-react";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const EXPERIENCE = [
  {
    org:   "Herts Students' Union",
    place: "Hertfordshire, UK",
    role:  "Business Students' Representative (elected)",
    when:  "Sep 2025 – May 2026",
    points: [
      "Elected representative for over 11,700 Business School students, acting as the primary liaison between the student body and university senior leadership.",
      "Led initiatives to improve placement support and industry connectivity, strengthening the bridge between academic study and employment.",
      "Facilitated senior stakeholder meetings to reshape tutor–student mentorship programmes.",
    ],
  },
  {
    org:   "University Project",
    place: "Hertfordshire, UK",
    role:  "Marketing Consultant",
    when:  "Jan 2026 – Jun 2026",
    points: [
      "Built Integrated Marketing Communications strategies for two UK corporate clients, aligning digital content with business objectives.",
      "Ran a multi-platform content calendar in Hootsuite to keep brand voice consistent across LinkedIn.",
      "Produced social assets in Adobe Creative Suite and Canva to client brand guidelines.",
      "Tracked campaign performance in Google Analytics and fed the results back into the plan.",
    ],
  },
  {
    org:   "WoodenStreet Furniture Pvt. Ltd.",
    place: "India",
    role:  "SEO Executive",
    when:  "Apr 2023 – Jan 2024",
    points: [
      "Deployed 6,000+ backlinks over nine months, lifting domain authority and organic traffic.",
      "Ran technical SEO audits and competitor analysis in SEMrush and Ahrefs against high-intent keywords.",
      "Managed and mentored a team of SEO interns, overseeing workflow and quality control on Google Business Profile optimisation.",
    ],
  },
  {
    org:   "Lexis Solutions",
    place: "India",
    role:  "Digital Marketing Project Manager",
    when:  "Dec 2022 – Apr 2023",
    points: [
      "Led a team of four on a cross-channel content strategy, increasing Instagram engagement by 7% in four months.",
      "Owned end-to-end delivery across copywriting, design and SEO for a mixed client portfolio.",
    ],
  },
];

const SKILLS = [
  { group: "SEO & search",  items: ["Technical SEO", "On-page & off-page", "SEMrush", "Ahrefs", "Google Search Console", "Google Analytics 4", "Answer-engine optimisation"] },
  { group: "Strategy",      items: ["Content strategy", "Integrated marketing communications", "Campaign planning", "Competitor analysis"] },
  { group: "Design & tools",items: ["Adobe Photoshop", "Illustrator", "InDesign", "Canva", "Premiere Pro", "CapCut", "Hootsuite"] },
  { group: "Leadership",    items: ["Project management", "Team leadership", "Client coordination", "Stakeholder management"] },
];

const EDUCATION = [
  {
    school: "University of Hertfordshire",
    award:  "MSc Strategic Marketing with Digital Media Management",
    when:   "Sep 2024 – Sep 2026",
    detail: "Data-Driven Marketing · Digital Leadership · Digital Marketing Toolbox · Strategic Customer Management",
  },
  {
    school: "Mohanlal Sukhadia University, India",
    award:  "MBA in e-Business",
    when:   "Oct 2020 – Nov 2022",
    detail: "",
  },
];

export default function PortfolioPage() {
  return (
    <div className="aiml-page-pad" style={{
      background: "var(--bg)", minHeight: "100vh",
      padding: "48px 24px 96px", maxWidth: 880, margin: "0 auto",
    }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        style={{ marginBottom: 44 }}
      >
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em",
          textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 12,
        }}>
          SEO & Digital Marketing · London / Hertfordshire, UK
        </div>

        <h1 className="aiml-page-title" style={{
          fontFamily: "var(--font-display)", fontSize: "clamp(2rem,5vw,3.2rem)",
          letterSpacing: "-0.04em", lineHeight: 1.02, fontWeight: 400,
          color: "var(--text-primary)", margin: "0 0 16px",
        }}>
          Ritvik R. Sharma
        </h1>

        <p style={{
          fontFamily: "var(--font-body)", fontSize: "clamp(1rem,2vw,1.15rem)",
          color: "var(--text-reading)", lineHeight: 1.65, margin: "0 0 24px", maxWidth: 620,
        }}>
          Strategic marketing professional with hands-on SEO experience across
          UK and Indian markets — and the person who designed and built the
          platform you are looking at.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href="mailto:ritviksharmaa@outlook.com" style={linkBtn(true)}>
            <Mail size={14} /> ritviksharmaa@outlook.com
          </a>
          <a href="https://linkedin.com/in/ritviksharmaa" target="_blank" rel="noopener noreferrer" style={linkBtn(false)}>
            <ExternalLink size={14} /> LinkedIn
          </a>
        </div>
      </motion.header>

      {/* ── The product ────────────────────────────────────────────────── */}
      {/* Leads the page on purpose: it is the only item a reader can verify
          by clicking, and they are already inside it. */}
      <Section label="Built by me">
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 14, padding: "22px 24px",
        }}>
          <h2 style={{
            fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 500,
            color: "var(--text-primary)", margin: "0 0 10px", letterSpacing: "-0.02em",
          }}>
            AI Marketing Lab
          </h2>
          <p style={{ fontSize: 14.5, color: "var(--text-reading)", lineHeight: 1.7, margin: "0 0 14px" }}>
            An SEO, AEO and GEO analysis platform for UK small and medium
            businesses. It runs a technical audit of any site, explains every
            finding in plain English, and orders the work by what will actually
            move results rather than by what is loudest.
          </p>
          <p style={{ fontSize: 14.5, color: "var(--text-reading)", lineHeight: 1.7, margin: "0 0 16px" }}>
            The part most tools miss is answer engines. It checks whether
            ChatGPT, Perplexity, Claude and Gemini are permitted to read a site,
            shows the words their crawlers actually receive, and flags the pages
            that look complete in a browser but arrive empty to a machine.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {["Next.js", "TypeScript", "Supabase", "Search Console API", "Analytics 4 API", "PageSpeed Insights", "Claude"].map(t => (
              <span key={t} style={{
                fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.06em",
                color: "var(--text-secondary)", background: "var(--muted)",
                border: "1px solid var(--border)", borderRadius: 6, padding: "4px 9px",
              }}>
                {t}
              </span>
            ))}
          </div>
          <Link href="/audit" style={linkBtn(true)}>
            Run a free audit <ArrowUpRight size={14} />
          </Link>
        </div>
      </Section>

      {/* ── Experience ─────────────────────────────────────────────────── */}
      <Section label="Experience">
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {EXPERIENCE.map(job => (
            <div key={job.org + job.when}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                gap: 12, flexWrap: "wrap", marginBottom: 2,
              }}>
                <span style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary)" }}>
                  {job.role}
                </span>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 11,
                  color: "var(--text-tertiary)", letterSpacing: "0.04em", whiteSpace: "nowrap",
                }}>
                  {job.when}
                </span>
              </div>
              <div style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 10 }}>
                {job.org} · {job.place}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                {job.points.map((p, i) => (
                  <li key={i} style={{ fontSize: 14, color: "var(--text-reading)", lineHeight: 1.65 }}>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Skills ─────────────────────────────────────────────────────── */}
      <Section label="Skills">
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 20,
        }}>
          {SKILLS.map(s => (
            <div key={s.group}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 8,
              }}>
                {s.group}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {s.items.map(i => (
                  <span key={i} style={{
                    fontSize: 12.5, color: "var(--text-reading)",
                    background: "var(--muted)", border: "1px solid var(--border)",
                    borderRadius: 6, padding: "4px 9px",
                  }}>
                    {i}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Education ──────────────────────────────────────────────────── */}
      <Section label="Education">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {EDUCATION.map(e => (
            <div key={e.school}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                gap: 12, flexWrap: "wrap", marginBottom: 2,
              }}>
                <span style={{ fontSize: 15.5, fontWeight: 500, color: "var(--text-primary)" }}>
                  {e.award}
                </span>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 11,
                  color: "var(--text-tertiary)", whiteSpace: "nowrap",
                }}>
                  {e.when}
                </span>
              </div>
              <div style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>{e.school}</div>
              {e.detail && (
                <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.6 }}>
                  {e.detail}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ── Contact ────────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 44, paddingTop: 28, borderTop: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
        alignItems: "center",
      }}>
        <div style={{ fontSize: 14, color: "var(--text-reading)", lineHeight: 1.6, maxWidth: 460 }}>
          Open to marketing and SEO roles in the UK. The quickest way to see how
          I think is to run the audit on your own site.
        </div>
        <a href="mailto:ritviksharmaa@outlook.com" style={linkBtn(true)}>
          Get in touch <ArrowUpRight size={14} />
        </a>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, ease: EASE }}
      style={{ marginBottom: 44 }}
    >
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "var(--text-tertiary)",
        marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid var(--border-subtle)",
      }}>
        {label}
      </div>
      {children}
    </motion.section>
  );
}

function linkBtn(solid: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 7,
    fontFamily: "var(--font-body)", fontSize: 13.5, fontWeight: 500,
    textDecoration: "none", padding: "10px 18px",
    borderRadius: "var(--radius-pill)",
    color: solid ? "#fff" : "var(--text-primary)",
    background: solid ? "var(--brand-strong)" : "transparent",
    border: solid ? "none" : "1px solid var(--border-strong)",
  };
}
