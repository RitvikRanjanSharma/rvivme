// lib/local-seo.ts
// =============================================================================
// AI Marketing Lab — local search analysis
//
// For a UK SMB, local is frequently the primary channel. Advising on search
// without looking at it is negligent, which is why this exists.
//
// The module is built in two layers, deliberately:
//
//   Layer 1 (this file) — costs nothing, needs no new permission. Local intent
//     is detected in the Search Console data the user has already connected,
//     and local signals are read from the HTML their site already serves.
//
//   Layer 2 (lib/google-business.ts) — Google Business Profile. Richer, but
//     gated behind an access request that Google reviews by hand, so it cannot
//     be the foundation.
//
// The same reasoning shaped the answer-engine module: the layer that works for
// everybody with zero setup carries the product, and the privileged layer adds
// depth when it's available.
//
// Pure functions only — no fetching, no React — so the logic can be tested.
// =============================================================================

import type { QueryRow } from "./opportunities";

// ─── local intent detection ──────────────────────────────────────────────────

/**
 * UK place names, used to spot geographic modifiers in queries.
 *
 * Deliberately a list of the largest towns and cities plus London boroughs
 * rather than a full gazetteer. A complete list would add tens of thousands of
 * names, many of which are ordinary words ("Bath", "Reading", "Wells"), and
 * every one of those is a false positive waiting to happen. The `near me` and
 * postcode signals below do the heavy lifting; this list catches the common
 * "<service> <city>" pattern.
 */
const UK_PLACES = new Set<string>([
  "london","birmingham","manchester","glasgow","liverpool","bristol","sheffield",
  "leeds","edinburgh","leicester","coventry","bradford","cardiff","belfast",
  "nottingham","hull","newcastle","stoke","southampton","derby","portsmouth",
  "brighton","plymouth","northampton","luton","wolverhampton","norwich","swansea",
  "milton keynes","aberdeen","sunderland","swindon","crawley","ipswich","wigan",
  "croydon","oxford","cambridge","york","poole","preston","exeter","gloucester",
  "blackpool","middlesbrough","bolton","bournemouth","peterborough","dundee",
  "reading","huddersfield","slough","chelmsford","colchester","basildon",
  "worthing","doncaster","rotherham","stockport","oldham","salford","warrington",
  "cheltenham","chester","lincoln","bath","canterbury","durham","lancaster",
  "carlisle","winchester","worcester","salisbury","st albans","wakefield",
  "inverness","perth","stirling","newport","wrexham","bangor","londonderry",
  "watford","woking","guildford","maidstone","southend","basingstoke","hastings",
  "eastbourne","harrogate","scarborough","blackburn","burnley","rochdale",
  "barnsley","grimsby","mansfield","chesterfield","telford","shrewsbury",
  "hereford","taunton","yeovil","truro","penzance","falmouth","weymouth",
  "norwich","lowestoft","kings lynn","bury st edmunds","stevenage","hemel hempstead",
  // London boroughs and well-known districts
  "camden","islington","hackney","shoreditch","greenwich","lewisham","southwark",
  "lambeth","wandsworth","fulham","chelsea","kensington","westminster","ealing",
  "brent","barnet","enfield","haringey","redbridge","bromley","sutton","merton",
  "richmond","kingston","hounslow","harrow","hillingdon","bexley","havering",
  "clapham","brixton","peckham","dalston","stratford","wimbledon","putney",
  // Norfolk, since that's where this product's own first user is
  "norfolk","norwich","great yarmouth","thetford","dereham","wymondham",
]);

/** "near me", "near by", "close to me", "in my area", "local <thing>". */
const PROXIMITY_RE = /\b(near\s?(me|by)|close\s+to\s+me|in\s+my\s+area|nearby|local|closest|nearest)\b/i;

/**
 * UK postcode — FULL codes only ("NR2 1AB"), never outward-only ("NR2").
 *
 * Outward codes collide with ordinary business vocabulary badly enough to be
 * useless: "b2b", "g4", "m1", "e3" all match an outward-code pattern. Losing
 * the handful of genuine "plumber nr2" queries is a much cheaper mistake than
 * classifying every B2B query as a local search.
 */
const POSTCODE_RE = /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/i;

/**
 * Place names that are also ordinary English words.
 *
 * "bath towels", "reading comprehension" and "york notes" are not local
 * searches, and a naive match reports all three as local — which would inflate
 * the local share and produce a confident, wrong diagnosis. These names only
 * count when the query gives a genuine geographic cue.
 */
const AMBIGUOUS_PLACES = new Set([
  "bath","reading","york","wells","derby","richmond","halifax","lincoln",
  "durham","perth","bury","rugby","deal","march","ely","hull","preston",
  "chester","boston","sale","stirling","bangor","newport","brighton",
]);

/** "in bath", "near york", "bath uk" — a real geographic framing. */
function hasGeoCue(query: string, place: string): boolean {
  const q = query.toLowerCase();
  return (
    new RegExp(`\\b(in|near|around|from|to|at|serving|based\\s+in)\\s+(the\\s+)?${place}\\b`).test(q) ||
    new RegExp(`\\b${place}\\s+(uk|england|scotland|wales|city|centre|center|area|town)\\b`).test(q) ||
    PROXIMITY_RE.test(q) ||
    POSTCODE_RE.test(q)
  );
}

/** Queries that imply visiting or contacting a physical business. */
const VISIT_INTENT_RE =
  /\b(open(ing)?\s+(hours|times)|opening|directions|address|phone\s?number|contact|book|appointment|near|delivery|takeaway|collection|store|shop|branch|showroom)\b/i;

export type LocalIntent = "proximity" | "place" | "postcode" | "visit" | "none";

export type ClassifiedQuery = QueryRow & {
  intent: LocalIntent;
  /** The place name matched, when the signal was a place. */
  place?: string;
};

function looksLikePostcode(query: string): boolean {
  return POSTCODE_RE.test(query);
}

/**
 * Find a known place name in the query.
 *
 * Unambiguous names match on sight. Names that double as ordinary words have
 * to earn it with a geographic cue — see AMBIGUOUS_PLACES for why.
 */
export function matchPlace(query: string): string | undefined {
  const lower = query.toLowerCase();
  // Normalise punctuation to spaces so "dentist, norwich" still matches, and
  // pad the ends so a place at either end matches the same way.
  const padded = ` ${lower.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim()} `;

  let ambiguousHit: string | undefined;

  for (const place of UK_PLACES) {
    if (!padded.includes(` ${place} `)) continue;
    if (!AMBIGUOUS_PLACES.has(place)) return place;   // unambiguous wins outright
    if (hasGeoCue(lower, place)) return place;
    // Remember it, but keep looking — an unambiguous name elsewhere in the
    // query is better evidence ("bath spa hotels norwich").
    ambiguousHit ??= place;
  }

  // An ambiguous name with no geographic cue is not treated as a place. This
  // deliberately loses some real local queries in exchange for not reporting
  // "bath towels wholesale" as local demand.
  return undefined;
}

export function classifyQuery(row: QueryRow): ClassifiedQuery {
  const q = row.query.toLowerCase();

  if (PROXIMITY_RE.test(q))   return { ...row, intent: "proximity" };

  const place = matchPlace(q);
  if (place)                  return { ...row, intent: "place", place };

  if (looksLikePostcode(q))   return { ...row, intent: "postcode" };
  if (VISIT_INTENT_RE.test(q)) return { ...row, intent: "visit" };

  return { ...row, intent: "none" };
}

// ─── locality inference ──────────────────────────────────────────────────────

export type InferredLocality = {
  place:       string | null;
  /** Impressions across queries naming this place — the evidence for the guess. */
  impressions: number;
  /** Number of distinct queries naming it. */
  queries:     number;
  confidence:  "high" | "medium" | "low" | "none";
};

/**
 * Work out where the business trades from its own search data, rather than
 * asking. If people find you by naming a town, that town is where you are —
 * and that's a fact from their behaviour rather than a setting someone typed
 * once and never revisited.
 */
export function inferLocality(rows: QueryRow[]): InferredLocality {
  const byPlace = new Map<string, { impressions: number; queries: number }>();

  for (const row of rows) {
    const place = matchPlace(row.query);
    if (!place) continue;
    const entry = byPlace.get(place) ?? { impressions: 0, queries: 0 };
    entry.impressions += row.impressions;
    entry.queries     += 1;
    byPlace.set(place, entry);
  }

  if (byPlace.size === 0) {
    return { place: null, impressions: 0, queries: 0, confidence: "none" };
  }

  const [place, stat] = [...byPlace.entries()].sort(
    (a, b) => b[1].impressions - a[1].impressions
  )[0];

  // Confidence reflects how much behaviour sits behind the guess. A single
  // impression naming a town is a coincidence, not a location. Three distinct
  // queries naming the same town, with real volume behind them, is not.
  const confidence: InferredLocality["confidence"] =
    stat.impressions >= 100 && stat.queries >= 3 ? "high"
    : stat.impressions >= 20 && stat.queries >= 2 ? "medium"
    : "low";

  return { place, impressions: stat.impressions, queries: stat.queries, confidence };
}

// ─── local demand summary ────────────────────────────────────────────────────

export type LocalDemand = {
  totalImpressions:  number;
  localImpressions:  number;
  localShare:        number;   // 0-100
  localClicks:       number;
  totalClicks:       number;
  byIntent:          Record<Exclude<LocalIntent, "none">, number>;
  /** Local queries ranked by impressions, best opportunities first. */
  topLocal:          ClassifiedQuery[];
  /** Local queries sitting outside the top 10 — where the work is. */
  localNearMisses:   ClassifiedQuery[];
  averageLocalPosition: number | null;
};

export function summariseLocalDemand(rows: QueryRow[]): LocalDemand {
  const classified = rows.map(classifyQuery);
  const local = classified.filter(c => c.intent !== "none");

  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
  const localImpressions = local.reduce((s, r) => s + r.impressions, 0);
  const totalClicks      = rows.reduce((s, r) => s + r.clicks, 0);
  const localClicks      = local.reduce((s, r) => s + r.clicks, 0);

  const byIntent = { proximity: 0, place: 0, postcode: 0, visit: 0 };
  for (const c of local) {
    byIntent[c.intent as Exclude<LocalIntent, "none">] += c.impressions;
  }

  // Weight the average by impressions — an average that treats a 1-impression
  // query the same as a 900-impression one describes nothing real.
  const averageLocalPosition = localImpressions > 0
    ? Number((local.reduce((s, r) => s + r.position * r.impressions, 0) / localImpressions).toFixed(1))
    : null;

  return {
    totalImpressions,
    localImpressions,
    localShare: totalImpressions > 0
      ? Number(((localImpressions / totalImpressions) * 100).toFixed(1))
      : 0,
    localClicks,
    totalClicks,
    byIntent,
    topLocal: [...local].sort((a, b) => b.impressions - a.impressions).slice(0, 20),
    localNearMisses: local
      .filter(c => c.position > 10 && c.position <= 30 && c.impressions >= 5)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10),
    averageLocalPosition,
  };
}

// ─── on-page local signals ───────────────────────────────────────────────────

export type LocalSignal = {
  id:      string;
  label:   string;
  passed:  boolean;
  /** Why this matters — the strategist layer, not just a pass/fail. */
  why:     string;
  detail?: string;
  weight:  number;
};

export type LocalSignalReport = {
  score:   number;   // 0-100
  signals: LocalSignal[];
};

function hasLocalBusinessSchema(html: string): boolean {
  // LocalBusiness has many subtypes (Restaurant, Dentist, Plumber…). Matching
  // the base type alone would miss most real implementations.
  return /"@type"\s*:\s*"[^"]*(LocalBusiness|Restaurant|Store|Dentist|Physician|Attorney|Plumber|Electrician|HomeAndConstructionBusiness|ProfessionalService|AutomotiveBusiness|HealthAndBeautyBusiness|FoodEstablishment|LodgingBusiness)[^"]*"/i
    .test(html);
}

/**
 * Score the local signals a search engine can read from the page itself.
 *
 * Every check here is verifiable in the HTML — nothing is inferred or guessed,
 * because a local audit that reports a problem the owner can't find is worse
 * than no audit.
 */
export function scoreLocalSignals(html: string): LocalSignalReport {
  const signals: LocalSignal[] = [];

  const schema = hasLocalBusinessSchema(html);
  signals.push({
    id: "schema",
    label: "LocalBusiness structured data",
    passed: schema,
    why: "This is how you state your name, address and hours in a form Google can read without interpretation. Without it, Google has to infer those facts from your page text and may get them wrong — or ignore them.",
    detail: schema ? "Found LocalBusiness schema." : "No LocalBusiness JSON-LD found.",
    weight: 3,
  });

  const hasAddress =
    /"streetAddress"/i.test(html) ||
    /itemprop=["']streetAddress["']/i.test(html) ||
    /<address[\s>]/i.test(html);
  signals.push({
    id: "address",
    label: "Address in the markup",
    passed: hasAddress,
    why: "Your address needs to appear on the site as text, matching your Google Business Profile exactly. Mismatches between the two are one of the most common causes of a profile underperforming.",
    detail: hasAddress ? "Address markup present." : "No <address> element or streetAddress property.",
    weight: 2,
  });

  const hasPhone =
    /"telephone"/i.test(html) ||
    /href=["']tel:/i.test(html);
  signals.push({
    id: "phone",
    label: "Click-to-call phone number",
    passed: hasPhone,
    why: "A tel: link is both a ranking signal for local intent and the single highest-converting element on a mobile local page. Most local searches happen on a phone.",
    detail: hasPhone ? "Found a tel: link or telephone property." : "No tel: link found.",
    weight: 2,
  });

  const hasHours =
    /"openingHours(Specification)?"/i.test(html) ||
    /itemprop=["']openingHours["']/i.test(html);
  signals.push({
    id: "hours",
    label: "Opening hours published",
    passed: hasHours,
    why: "\"Is it open now?\" is one of the most common local queries. Publishing hours in structured form lets Google answer it directly, which keeps you in the result instead of sending the searcher to a competitor who did.",
    detail: hasHours ? "Opening hours present." : "No openingHours in structured data.",
    weight: 2,
  });

  const hasGeo = /"geo"\s*:/i.test(html) || /"latitude"/i.test(html);
  signals.push({
    id: "geo",
    label: "Geographic coordinates",
    passed: hasGeo,
    why: "Coordinates remove any ambiguity about which branch or unit you are, which matters most in dense areas and for addresses that geocode poorly.",
    detail: hasGeo ? "Coordinates present." : "No geo coordinates in structured data.",
    weight: 1,
  });

  const hasMap =
    /google\.com\/maps/i.test(html) ||
    /maps\.google/i.test(html) ||
    /<iframe[^>]+maps/i.test(html);
  signals.push({
    id: "map",
    label: "Map or directions link",
    passed: hasMap,
    why: "A direct route to directions removes a step for someone deciding whether to visit. It also corroborates your location for crawlers reading the page.",
    detail: hasMap ? "Map or Maps link present." : "No map or directions link found.",
    weight: 1,
  });

  const earned   = signals.filter(s => s.passed).reduce((s, c) => s + c.weight, 0);
  const possible = signals.reduce((s, c) => s + c.weight, 0);

  return {
    score: possible > 0 ? Math.round((earned / possible) * 100) : 0,
    signals,
  };
}

// ─── diagnosis ───────────────────────────────────────────────────────────────

export type LocalDiagnosis = {
  headline: string;
  detail:   string;
  /** Whether local looks relevant to this business at all. */
  relevance: "primary" | "secondary" | "unclear" | "not_local";
};

/**
 * Open with a finding rather than a dashboard.
 *
 * The hardest judgement here is admitting when local simply isn't this
 * business's channel. A tool that insists every site needs local SEO is
 * selling, not advising — so "this doesn't look like a local business" is a
 * first-class outcome.
 */
export function diagnoseLocal(
  demand: LocalDemand,
  locality: InferredLocality,
  signals: LocalSignalReport | null,
): LocalDiagnosis {
  const { localShare, localImpressions, averageLocalPosition, localNearMisses } = demand;

  if (demand.totalImpressions === 0) {
    return {
      relevance: "unclear",
      headline: "Not enough search data yet to judge local",
      detail: "Search Console hasn't recorded impressions for this site yet. Once it has a few weeks of data we can tell you whether people are finding you through local searches, and whether that's where your opportunity is.",
    };
  }

  if (localImpressions === 0) {
    return {
      relevance: "not_local",
      headline: "Nothing in your search data looks local",
      detail: "No queries mention a place, a postcode, or \"near me\". That's a perfectly normal result for a business that serves customers remotely — and if that's you, local SEO isn't where your effort belongs. If you do trade from a physical location or a service area, it means you're not yet visible for the searches that would find you.",
    };
  }

  const placeLabel = locality.place
    ? locality.place.replace(/\b\w/g, c => c.toUpperCase())
    : null;

  // The most useful finding available: local demand exists and is underserved.
  if (localShare >= 15 && averageLocalPosition !== null && averageLocalPosition > 10) {
    return {
      relevance: localShare >= 35 ? "primary" : "secondary",
      headline: `Local demand is real, and you're not ranking for it`,
      detail: `${localShare}% of your impressions come from searches with local intent${placeLabel ? `, mostly naming ${placeLabel}` : ""} — but your average position on those is ${averageLocalPosition}. People in your area are searching for what you do and finding someone else. ${localNearMisses.length > 0 ? `${localNearMisses.length} of those queries sit between positions 11 and 30, which is close enough that profile and on-page work can move them.` : ""}`,
    };
  }

  if (localShare >= 15) {
    return {
      relevance: localShare >= 35 ? "primary" : "secondary",
      headline: "Local is working for you",
      detail: `${localShare}% of your impressions carry local intent${placeLabel ? ` and ${placeLabel} is the place people name most` : ""}, at an average position of ${averageLocalPosition ?? "n/a"}. This is a channel worth protecting: keep your profile current and your hours accurate, because local rankings decay faster than national ones when a profile goes stale.`,
    };
  }

  if (signals && signals.score < 50) {
    return {
      relevance: "unclear",
      headline: "Local intent is minor — but your site isn't set up for it either",
      detail: `Only ${localShare}% of impressions look local, so this may not be your channel. Worth knowing though: your site is missing most of the signals that would let Google treat you as a local business at all (${signals.score}/100). If you do serve a specific area, that's the reason local traffic isn't appearing — you're not eligible for it yet.`,
    };
  }

  return {
    relevance: "unclear",
    headline: "Local isn't a major channel for this site",
    detail: `Only ${localShare}% of your impressions carry local intent. That's normal for businesses selling nationally or online. Your effort is better spent on the opportunities in the main list than on local work.`,
  };
}
