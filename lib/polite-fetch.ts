import Bottleneck from "bottleneck";

/**
 * Outbound HTTP politeness for UN-owned infrastructure.
 *
 * We scrape UN Web TV HTML and call the UN's anonymous Kaltura player API and
 * the UN documents API. None of these are our own services, so we identify
 * ourselves with a descriptive User-Agent (the default node/undici UA is
 * anonymous) and cap how hard we hit each host. See docs/webtv-kaltura.md.
 */

/** Descriptive UA with a contact URL, sent on every request below. */
export const USER_AGENT =
  "eosg-webtv-transcripts/1.0 (+https://transcripts.un-two-zero.org; UN meeting transcription)";

/**
 * Hosts we throttle. Each gets its own limiter so a burst against one host
 * (e.g. scraping a week of schedule pages concurrently) doesn't fan out into
 * an unthrottled flood. Per host: at most 2 in flight, ≥250 ms apart.
 */
const THROTTLED_HOSTS = new Set([
  "webtv.un.org",
  "cdnapisec.kaltura.com",
  "documents.un.org",
  "gadebate.un.org",
]);

const limiters = new Map<string, Bottleneck>();

function limiterForHost(host: string): Bottleneck {
  let limiter = limiters.get(host);
  if (!limiter) {
    limiter = new Bottleneck({ maxConcurrent: 2, minTime: 250 });
    limiters.set(host, limiter);
  }
  return limiter;
}

function withUserAgent(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", USER_AGENT);
  return { ...init, headers };
}

/**
 * `fetch` that adds our User-Agent and, for UN-owned hosts, serializes through
 * a per-host rate limiter. A drop-in replacement for `fetch` on those calls.
 */
export async function politeFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const withUa = withUserAgent(init);

  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return fetch(url, withUa);
  }

  if (THROTTLED_HOSTS.has(host)) {
    return limiterForHost(host).schedule(() => fetch(url, withUa));
  }
  return fetch(url, withUa);
}
