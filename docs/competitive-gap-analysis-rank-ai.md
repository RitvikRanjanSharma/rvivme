# AI Marketing Lab vs Rank.ai — feature gap analysis

*Prepared 13 August 2026. Rank.ai capabilities taken from the platform documentation
provided. AI Marketing Lab capabilities taken from the current codebase rather than
the website review, for reasons set out immediately below.*

---

## An important correction before the comparison

The AI Marketing Lab review document describes the site as an outside observer sees
it. Several modules it lists as working are, in the current code, disabled stubs:

| Module the review credits | Actual state in code |
|---|---|
| DataForSEO backlink intelligence | `/api/dataforseo/backlinks` returns `{ reason: "unavailable" }` |
| Competitor intelligence, threat levels, domain authority | `/api/dataforseo/competitors` stubbed — no free equivalent exists |
| Competitor keywords / keyword gap | `/api/dataforseo/competitor-keywords` stubbed |
| Live SERP / featured snippet detection | `/api/dataforseo/serp` stubbed |
| AI citation tracker | Runs a clearly-labelled simulation unless DataForSEO SERP is enabled |
| Portfolio / case studies | Placeholder page |

This matters because it changes the shape of the gap. Comparing Rank.ai against the
*described* product understates the distance; comparing against the *running* product
is the honest basis for planning.

**The single structural fact driving most gaps below: AI Marketing Lab currently has
no paid SEO data provider.** GA4, Search Console and Google Trends are all free and
all limited to your own property or to relative signals. Rank.ai is buying SERP data,
backlink indexes and local grid data. A number of gaps cannot be closed by writing
code — they need a data budget.

---

## What AI Marketing Lab genuinely does well

Worth stating, because these are real advantages and shouldn't be traded away while
chasing parity.

- **Per-user Google OAuth.** Users connect their own GA4 and Search Console, read-only,
  and pick properties from a dropdown of what they actually have access to. No service
  account to grant, no IDs to hand-type. This is a better onboarding experience than
  most tools in this category manage.
- **Honesty about data provenance.** Empty states distinguish "not connected",
  "authorisation expired", "connected but no sessions yet" and "API rejected the call".
  Simulated data is labelled as simulated. That is unusual and it builds trust.
- **Strategy-first workflow.** One active strategy at a time, with AI attention focused
  on it, is a genuinely different opinion from Rank.ai's volume-oriented model.
- **Integrated editorial loop.** Draft → edit → publish → public blog, in one place.

---

## Basic gaps — table stakes for the category

These are things a buyer comparing the two will expect to exist. Ordered by how
damaging their absence is.

### 1. Rank tracking for arbitrary keywords
**Rank.ai:** sells "national keyword seats" (25 on Starter, 100 on Pro) with daily
SERP feature detection.
**AIML:** can only report positions for queries Search Console already shows — i.e.
terms your site *already* ranks for, with a 3-day lag. You cannot track a keyword you
don't yet rank for, which is precisely the keyword a user most wants to track.

This is the most significant functional gap in the product. It requires a paid SERP
source; there is no free substitute.

### 2. Competitor tracking
**Rank.ai:** dedicated Competitors module plus quarterly competitive audits.
**AIML:** stubbed. The UI exists; the data does not.

Requires paid SERP data. Currently the module advertises a capability it can't deliver,
which is worse than not having it.

### 3. Backlink data
**Rank.ai:** goes further than data — a **Backlink Exchange** workflow for actually
acquiring links.
**AIML:** stubbed.

Backlink indexes are expensive to build and expensive to license. Realistically a
paid-tier feature or a permanent omission.

### 4. Local SEO — entirely absent
**Rank.ai:** a whole pillar. All Locations, Google Business Profile management, grid
heatmaps, Map Audit, multi-location support, automated review management.
**AIML:** nothing.

For UK SMBs — the audience the marketing copy names — local search is often the
*primary* channel. This is the largest whitespace, and notably the Google Business
Profile API is free. This gap is closable without a data budget.

### 5. Multi-domain / multi-property
**Rank.ai:** multi-domain on Pro, unlimited locations.
**AIML:** one `gsc_site_url` and one `ga4_property_id` per user row. An agency managing
five clients cannot use the product.

Closable with schema work — a `workspaces` table and a switcher. No external cost.

### 6. Usage metering and plan enforcement
**Rank.ai:** article quotas, credits, keyword seats visible in the sidebar; the
consumption model *is* the business model.
**AIML:** `lib/quota.ts` exists and a Billing tab exists, but there is no visible
metering, no plan gating, no upgrade path.

You cannot charge for the product in its current state.

### 7. Paid search
**Rank.ai:** dedicated section.
**AIML:** nothing.

Lower priority — arguably out of scope for a positioning built on organic and GEO.

---

## Advanced gaps

### AI-search depth — your claimed differentiator, and Rank.ai is ahead
This is the uncomfortable one. GEO / AI visibility is AI Marketing Lab's stated
differentiator, and Rank.ai has **four** dedicated modules against your one
partially-simulated tracker:

| Rank.ai | What it does | AIML |
|---|---|---|
| AI Visibility | Tracking in AI answer environments | Single citation tracker, simulated without DataForSEO |
| Competitive Monitors | Head-to-head benchmarking inside AI answers | — |
| Prompts | Prompt-level query monitoring | — |
| AI Crawlers | Monitors AI bot access and crawl behaviour | — |

**AI Crawlers is the one I would prioritise.** It's answerable from your own server
logs or edge middleware — detecting GPTBot, ClaudeBot, PerplexityBot, CCBot and
friends by user-agent — and needs no paid data at all. It's a credible, defensible GEO
feature you could ship quickly, and it's directly on-message for your positioning.

Prompt-level monitoring is also achievable: query the answer engines directly for a
user's tracked prompts and check for citation. Rate limits and cost apply, but it's
a real path.

### Content production depth
| | Rank.ai | AIML |
|---|---|---|
| Research passes | 2-pass (Starter), 3-pass with competitor SERP analysis (Pro) | Single-pass generation |
| Article length | ~2,000 → 4,000 words | 800–2,000 |
| Images | Premium image models, in-article visuals | None |
| Volume | 30 → 500 articles/month | Manual, one at a time |

Multi-pass research — draft, critique, revise — is a quality improvement you can make
with the models you already pay for. No new vendor needed.

### Multimedia — absent entirely
AI podcast generation, faceless YouTube production, voice cloning. Whether this is a
gap or noise depends on your positioning. I'd argue it's mostly noise for a
practitioner tool, but it demonstrably widens Rank.ai's perceived value per pound.

### Integrations and reporting
- **MCP integration** (Rank.ai, Pro tier) — lets the tool be driven from AI assistants.
  Cheap to add, well-aligned with your brand.
- **White-label reporting** — table stakes for agency customers.
- **Scheduled reports / real-time dashboards** — you have alerts, not reporting.
- **CRM integration and lead routing** — enterprise-tier concern, ignore for now.

### The managed-service tier
Rank.ai's agency plans (£2k–£10k/month) are people, not software. This isn't a feature
gap — it's a different business model. Worth knowing because it explains their pricing
page, but not something to copy.

---

## What I would actually do

Prioritised by *value delivered per pound and per week of work*, not by closing the
longest list.

**1. Fix what's advertised but broken.** Competitors and backlinks currently promise
things they can't deliver. Either restore them with a data provider or remove the
modules. A visible stub costs more credibility than an absent feature.

**2. Build the local SEO pillar.** Largest whitespace, free API (Google Business
Profile), directly serves the UK SMB audience you're already targeting. This is the
strongest single move available.

**3. Ship AI Crawler tracking.** Free, defensible, reinforces GEO positioning, and
closes the most embarrassing part of the AI-search comparison. Server logs or edge
middleware — no vendor.

**4. Multi-domain support.** Unlocks agencies, who are the segment that actually pays.
Schema work only.

**5. Multi-pass content research.** Real quality gain from models you already have.

**6. Decide on paid SERP data.** Rank tracking and competitor intelligence both depend
on it and both are table stakes. Either budget for a provider — DataForSEO's $50
minimum is modest against what these features unlock — or deliberately reposition away
from rank tracking and compete on GEO plus local, where you can win without it.

Item 6 is the real strategic decision. Everything else is execution.

---

## The honest summary

Rank.ai is broader, better funded, and further ahead on the exact axis you've chosen
to differentiate on. But it's also a volume-and-quotas product bolted to an agency
business. Your defensible position isn't feature parity — it's being the tool that
tells a UK SMB the truth about their own data, connects in one click, and covers local
and answer-engine visibility properly.

Chasing all of the above would take a long time and lose that. Items 2, 3 and 4 sharpen
what already makes you different.
