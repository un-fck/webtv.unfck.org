import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

/**
 * Resolve the cron shared secret. Mirrors `getSecret()` in
 * `lib/auth/service.ts`: a missing secret is a hard error in production (so a
 * misconfigured deploy can never fall back to authorizing `Bearer undefined`),
 * and a stable dev placeholder otherwise.
 */
function getCronSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CRON_SECRET must be set in production");
    }
    return "dev-cron-secret-change-me";
  }
  return secret;
}

/**
 * Authorize an incoming cron request against `CRON_SECRET` using a
 * constant-time comparison. Returns a 401 response when the request is not an
 * authorized cron call, or `null` when it is authorized.
 *
 * Usage in a route:
 *   const unauthorized = checkCronAuth(request);
 *   if (unauthorized) return unauthorized;
 */
export function checkCronAuth(request: NextRequest): NextResponse | null {
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${getCronSecret()}`);
  // `timingSafeEqual` throws on length mismatch, so guard length first — the
  // length of a bearer token is not itself a useful secret.
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return apiError(401, "unauthorized", "Unauthorized");
  }
  return null;
}
