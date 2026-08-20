// lib/outbound-fetch.ts
// =============================================================================
// AI Marketing Lab — an outbound call that cannot hang forever
//
// WHY
//
// Eight routes called googleapis.com with a bare fetch(). Node's fetch has no
// default timeout: if Google accepts the connection and then never answers,
// the promise never settles. The route sits there until the hosting platform
// kills the function, and what the user sees is a spinner that runs to the end
// of the request budget and then a blank panel — indistinguishable from "you
// have no data".
//
// The site audit already learned this lesson; every outbound fetch there is
// time-boxed. These routes were written earlier and never caught up.
//
// A TIMEOUT IS NOT AN EMPTY RESULT
//
// The AbortError is left to propagate rather than being swallowed into `null`.
// A caller that cannot tell "Google didn't answer" from "Google said there is
// nothing" will report the customer's site as having no impressions during an
// outage, which is a claim about their business rather than about our request.
// =============================================================================

/**
 * Google's own p99 for these endpoints is a couple of seconds. Fifteen is
 * generous enough that a slow-but-working call succeeds, and short enough that
 * several sequential calls still fit inside a route's maxDuration.
 */
export const GOOGLE_TIMEOUT_MS = 15_000;

/**
 * Drop-in for fetch() that aborts rather than hanging.
 *
 * `service` appears in the timeout message. "Google didn't respond in 15s" and
 * "Claude didn't respond in 55s" send the reader to different conclusions, and
 * both are more use than "The operation was aborted".
 */
export async function outboundFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = GOOGLE_TIMEOUT_MS,
  service = "The service",
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message))) {
      throw new Error(
        `${service} didn't respond within ${Math.round(timeoutMs / 1000)}s. This is usually temporary — try again in a moment.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Preset for the Google APIs, which is where most of these calls go. */
export function googleFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = GOOGLE_TIMEOUT_MS,
): Promise<Response> {
  return outboundFetch(url, init, timeoutMs, "Google");
}
