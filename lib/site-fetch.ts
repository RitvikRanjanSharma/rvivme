// lib/site-fetch.ts
// =============================================================================
// AI Marketing Lab — fetching a customer's own site, honestly
//
// Extracted from the answer-engine audit because of a bug worth remembering:
// the original helper returned `string | null`, collapsing "the server replied
// 404" and "we never reached the server" into one value. Downstream that became
// "no robots.txt exists, so every crawler is permitted" — a confident green
// verdict manufactured out of a DNS failure.
//
// Absent and unknown are different claims. This module keeps them apart, and
// lives on its own (no Next imports) so the logic can be tested directly.
// =============================================================================

/**
 * Three outcomes. `absent` means a server answered and told us the resource
 * isn't there; `unreachable` means we learned nothing at all.
 */
export type FetchResult =
  | { kind: "ok";          url: string; text: string }
  | { kind: "absent";      url: string; status: number }
  | { kind: "unreachable"; url: string; detail: string };

export const SITE_FETCH_UA =
  "AIMarketingLabBot/1.0 (+https://www.aimarketinglab.co.uk/bot)";

/**
 * Turn a thrown fetch error into something a non-engineer can act on. The
 * cause code is more reliable than the message across Node versions, so we
 * check both.
 */
export function describeFetchError(err: unknown): string {
  const code = String(
    (err as { cause?: { code?: string } } | undefined)?.cause?.code ?? ""
  ).toUpperCase();
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || msg.includes("getaddrinfo"))
    return "the hostname could not be resolved";
  if (code === "ECONNREFUSED") return "the connection was refused";
  if (code === "ECONNRESET")   return "the connection was reset";
  if (code.startsWith("ERR_TLS") || code.startsWith("CERT_") ||
      code === "ERR_SSL_WRONG_VERSION_NUMBER" ||
      msg.includes("certificate") || msg.includes("ssl") || msg.includes("tls"))
    return "the HTTPS certificate didn't match this hostname";
  if (msg.includes("abort") || msg.includes("timeout") || code === "ETIMEDOUT")
    return "the server didn't respond in time";
  return "the request failed";
}

/**
 * A GSC domain property ("sc-domain:example.com") names no host, so we cannot
 * know whether the site is served from the apex or from www. Guessing wrong is
 * not cosmetic: an unreachable host yields an empty robots.txt, which reads as
 * "nothing is blocked". So we return both, preferred host first.
 */
export function originCandidates(siteUrl: string): string[] {
  const raw = siteUrl.trim();
  let primary: string | null = null;

  if (raw.startsWith("sc-domain:")) {
    const host = raw.slice("sc-domain:".length).trim();
    primary = host ? `https://${host}` : null;
  } else {
    try { primary = new URL(raw).origin; } catch { primary = null; }
  }
  if (!primary) return [];

  // The www/apex sibling. Most sites redirect one to the other, but a parked
  // or mis-certificated apex fails at TLS before any redirect can happen.
  let sibling: string | null = null;
  try {
    const u = new URL(primary);
    u.hostname = u.hostname.startsWith("www.")
      ? u.hostname.slice(4)
      : `www.${u.hostname}`;
    sibling = u.origin;
  } catch { /* no sibling */ }

  return sibling && sibling !== primary ? [primary, sibling] : [primary];
}

/** Injectable so tests don't need a network. */
export type Fetcher = typeof fetch;

// ─── SSRF: which hostnames we will fetch on a caller's behalf ────────────────
//
// Any endpoint that fetches a URL chosen by the caller is a server-side request
// forgery hole unless the target is checked. Left open, an account holder could
// use our servers to reach cloud metadata endpoints and hosts behind our
// network boundary.
//
// This lives here, next to the fetchers, because it was previously copied into
// each route that needed it. A duplicated security control drifts: the copy
// that gets a fix and the copy that doesn't look identical at a glance, and the
// one that matters is whichever the next endpoint copies from. One definition,
// imported everywhere.

/** Hostnames we will never fetch, whatever the caller or the database says. */
const BLOCKED_HOST =
  /^(localhost$|.*\.localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0$|\[?::1?\]?$|.*\.local$|.*\.internal$)/i;

/** 172.16.0.0/12 — the private range that needs arithmetic rather than a prefix. */
function isPrivate172(hostname: string): boolean {
  const m = hostname.match(/^172\.(\d+)\./);
  return !!m && Number(m[1]) >= 16 && Number(m[1]) <= 31;
}

/** True when the hostname is publicly routable by name. */
export function hostIsPublic(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return !BLOCKED_HOST.test(h) && !isPrivate172(h);
}

/** The same check applied to a full URL or a bare domain. Invalid input is refused. */
export function urlIsPublic(url: string): boolean {
  return ssrfReason(url) === null;
}

/**
 * Why we will not fetch this, in words a user can act on — or null if it's fine.
 *
 * Returns a reason rather than a boolean because these rejections are shown to
 * people. "That hostname isn't publicly reachable" and "only http and https are
 * supported" send someone to different fixes, and collapsing them into `false`
 * means the UI has to guess which one happened.
 *
 * DELIBERATE LIMIT: this is hostname pattern matching, not post-resolution
 * checking. Someone who points a public DNS record at an internal IP still gets
 * through. Closing that needs DNS-rebinding protection at connect time, which
 * is a bigger change than this codebase currently warrants — but the limit is
 * written down here so nobody assumes protection that isn't present.
 */
export function ssrfReason(input: string): string | null {
  let u: URL;
  try {
    u = input.includes("://") ? new URL(input) : new URL(`https://${input}`);
  } catch {
    return "That doesn't look like a valid domain.";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return "Only http and https addresses are supported.";
  }
  // Strip IPv6 brackets so ::1 is recognised in either form.
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return "That doesn't look like a valid domain.";
  if (!hostIsPublic(host)) {
    return "That hostname isn't publicly reachable, so no crawler could fetch it either.";
  }
  return null;
}

export async function fetchText(
  url: string,
  timeoutMs = 8000,
  fetcher: Fetcher = fetch,
): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(url, {
      headers:  { "User-Agent": SITE_FETCH_UA },
      signal:   controller.signal,
      redirect: "follow",
    });
    // 4xx/5xx is a real answer from a real server: the resource is absent,
    // which we know rather than merely failed to determine.
    if (!res.ok) return { kind: "absent", url, status: res.status };
    return { kind: "ok", url, text: await res.text() };
  } catch (err) {
    return { kind: "unreachable", url, detail: describeFetchError(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a path across candidate origins, falling through ONLY on
 * `unreachable`. A host that answers 404 has authoritatively told us the file
 * isn't there; trying a different hostname after a real answer would be
 * inventing data about a site we were never asked to look at.
 */
export async function fetchAcrossOrigins(
  candidates: string[],
  path: string,
  fetcher: Fetcher = fetch,
): Promise<{ result: FetchResult; origin: string }> {
  let last: { result: FetchResult; origin: string } | null = null;
  for (const origin of candidates) {
    const result = await fetchText(`${origin}${path}`, 8000, fetcher);
    if (result.kind !== "unreachable") return { result, origin };
    last = { result, origin };
  }
  return last!;
}
