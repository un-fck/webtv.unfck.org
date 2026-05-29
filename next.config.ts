import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {};

// Sentry build-time wrapping: uploads source maps so stack traces in the
// dashboard show original TypeScript instead of compiled JS, and silences the
// SDK's own console noise at build time. Auth via SENTRY_AUTH_TOKEN /
// SENTRY_ORG / SENTRY_PROJECT (set in Vercel env, leave unset locally).
// Source-map upload is skipped automatically when the auth token isn't set,
// so local builds and contributor PRs still succeed.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  // Route Sentry events through a same-origin path so ad-blockers and
  // privacy extensions don't drop them (they pattern-match on
  // *.ingest.sentry.io, and some lists also block the default `/monitoring`).
  // Using an app-specific path avoids those known patterns.
  tunnelRoute: "/api/internal/observability",
});
