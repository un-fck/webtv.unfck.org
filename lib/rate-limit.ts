import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { pool, q } from "@/lib/db";
import { apiError } from "@/lib/api-error";

/**
 * Postgres-backed fixed-window counters used for the count-based cost backstop:
 * a per-user daily cap on transcript starts AND a global daily ceiling. Both
 * live in the same table; the bucket + identifier distinguishes them.
 *
 * Why the DB and not an in-memory counter: on Vercel each serverless instance
 * is a separate process, so an in-memory map would only see traffic that
 * happens to land on the same warm instance — effectively no limit at all. A
 * shared counter in Postgres (behind PgBouncer) is the simplest store that
 * actually works across instances at this scale.
 *
 * The window is "fixed": all hits between `floor(now/window)*window` and the
 * next boundary share one counter row. A 24h window resets at UTC midnight.
 *
 * Fails open: if the DB errors, the request is allowed (a counter outage must
 * not take down the endpoint it guards).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const GLOBAL_IDENTIFIER = "__global__";

export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in the current window (never negative). */
  remaining: number;
  /** Milliseconds until the current window resets. */
  resetMs: number;
  /** The post-increment count (1-based). Useful for logging the trip event. */
  count: number;
}

/**
 * Atomically record a hit and report whether it's within `limit` for the
 * current `windowMs` window.
 */
export async function rateLimit(opts: {
  bucket: string;
  identifier: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const { bucket, identifier, limit, windowMs } = opts;
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const resetMs = windowStart.getTime() + windowMs - now;

  try {
    const { text, values } = q(
      `INSERT INTO webtv.rate_limits (bucket, identifier, window_start, count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT (bucket, identifier, window_start)
       DO UPDATE SET count = webtv.rate_limits.count + 1
       RETURNING count`,
      [bucket, identifier, windowStart],
    );
    const { rows } = await pool.query<{ count: number }>(text, values);
    const count = Number(rows[0]?.count ?? 1);

    // Opportunistic cleanup of long-expired windows (~1% of calls) so the table
    // doesn't grow unbounded without a dedicated cron.
    if (Math.random() < 0.01) {
      const cutoff = new Date(now - windowMs * 4);
      const del = q(`DELETE FROM webtv.rate_limits WHERE window_start < ?`, [
        cutoff,
      ]);
      pool.query(del.text, del.values).catch(() => {});
    }

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetMs,
      count,
    };
  } catch (err) {
    console.error("[rate-limit] check failed, allowing request:", err);
    return { allowed: true, remaining: limit, resetMs, count: 0 };
  }
}

function rateLimitedResponse(
  resetMs: number,
  message: string,
  status: 429 | 503,
): NextResponse {
  const retryAfter = Math.ceil(resetMs / 1000);
  const res = apiError(
    status,
    status === 429 ? "rate_limited" : "capacity_reached",
    message,
  );
  res.headers.set("Retry-After", String(retryAfter));
  return res;
}

/**
 * Per-user daily cap. Returns a ready 429 response when exceeded, else `null`.
 *
 *   const limited = await enforceUserDailyLimit(user.id, "transcribe", 5);
 *   if (limited) return limited;
 */
export async function enforceUserDailyLimit(
  userId: string,
  bucket: string,
  limit: number,
): Promise<NextResponse | null> {
  const result = await rateLimit({
    bucket,
    identifier: `user:${userId}`,
    limit,
    windowMs: DAY_MS,
  });
  if (result.allowed) return null;
  return rateLimitedResponse(
    result.resetMs,
    `You've reached your daily limit for this action. It resets at UTC midnight. Contact us if you need more.`,
    429,
  );
}

/**
 * Global daily ceiling — the aggregate cost backstop. Returns a ready 503
 * response when exceeded, else `null`. Logs a structured warning on the trip
 * so it can be picked up by Sentry (when wired in).
 *
 *   const capped = await enforceGlobalDailyLimit("transcribe", 50);
 *   if (capped) return capped;
 */
export async function enforceGlobalDailyLimit(
  bucket: string,
  limit: number,
): Promise<NextResponse | null> {
  const result = await rateLimit({
    bucket: `${bucket}:global`,
    identifier: GLOBAL_IDENTIFIER,
    limit,
    windowMs: DAY_MS,
  });
  if (result.allowed) return null;
  // Surface the trip both in logs and as a Sentry warning so an alert can fire.
  // No PII (no user id, no IP) — just the bucket, limit, and how far over.
  const meta = {
    bucket,
    limit,
    count: result.count,
    reset_in_seconds: Math.ceil(result.resetMs / 1000),
  };
  console.warn(
    JSON.stringify({ event: "global_daily_ceiling_tripped", ...meta }),
  );
  Sentry.captureMessage(`Global daily ceiling tripped: ${bucket}`, {
    level: "warning",
    tags: { kind: "global_daily_ceiling" },
    extra: meta,
  });
  return rateLimitedResponse(
    result.resetMs,
    `Daily capacity for this service has been reached. Please try again after UTC midnight.`,
    503,
  );
}

const HOUR_MS = 60 * 60 * 1000;

function stripPort(ip: string): string {
  // "1.2.3.4:5678" → "1.2.3.4"; bracketed IPv6 "[::1]:443" → "::1".
  if (ip.startsWith("[")) {
    const end = ip.indexOf("]");
    return end > 0 ? ip.slice(1, end) : ip;
  }
  return /^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)
    ? ip.slice(0, ip.lastIndexOf(":"))
    : ip;
}

/**
 * Best-effort client IP for anonymous rate limiting.
 *
 * Reads `X-Forwarded-For` (leftmost = conventional client position), falling
 * back to `X-Real-IP`, then a shared `"unknown"` bucket. IMPORTANT: XFF is
 * client-spoofable, so the per-IP bucket alone can be evaded by rotating the
 * header — abusable endpoints therefore ALSO carry a global (non-IP) ceiling
 * that a spoofed IP cannot bypass. If a trusted CDN/WAF is ever placed in front
 * of the app, switch to its verified client-IP header here.
 */
export function getClientIp(req: { headers: Headers }): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return stripPort(first);
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return stripPort(realIp.trim());
  return "unknown";
}

/**
 * Per-IP fixed-window limit for anonymous endpoints. Returns a ready 429 when
 * exceeded, else `null`. Fails open on DB error (inherited from `rateLimit`).
 */
export async function enforceIpLimit(
  req: { headers: Headers },
  bucket: string,
  limit: number,
  windowMs: number = HOUR_MS,
): Promise<NextResponse | null> {
  const result = await rateLimit({
    bucket: `${bucket}:ip`,
    identifier: `ip:${getClientIp(req)}`,
    limit,
    windowMs,
  });
  if (result.allowed) return null;
  return rateLimitedResponse(
    result.resetMs,
    "Too many requests. Please slow down and try again shortly.",
    429,
  );
}
