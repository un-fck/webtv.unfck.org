import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Standalone build collects only the server + its traced deps into
  // `.next/standalone`, which is what the Azure container runs (`node
  // server.js`). Vercel ignores this and uses its own build pipeline.
  output: "standalone",
  // next-intl loads message catalogs at runtime via dynamic import — the
  // standalone tracer doesn't always pick them up. Be explicit. `vercel.json`
  // is read at boot by the in-process cron scheduler in instrumentation.ts
  // (single source of truth for cron schedules); include it explicitly so
  // standalone definitely copies it.
  outputFileTracingIncludes: {
    "/**/*": ["messages/**/*", "i18n/**/*", "vercel.json"],
  },
};

// Sentry build-time wrapping: uploads source maps so stack traces in the
// dashboard show original TypeScript instead of compiled JS, and silences the
// SDK's own console noise at build time. Auth via SENTRY_AUTH_TOKEN /
// SENTRY_ORG / SENTRY_PROJECT (set in Vercel env, leave unset locally).
// Source-map upload is skipped automatically when the auth token isn't set,
// so local builds and contributor PRs still succeed.
//
// Skipped in `next dev`: Sentry's bundler plugins + runtime instrumentation
// retain module-graph state under Turbopack HMR, which OOMs the dev server
// after ~25 min of idle polling. Prod builds (and `next start`) still wrap.
export default process.env.NODE_ENV === "development"
  ? withNextIntl(nextConfig)
  : withSentryConfig(withNextIntl(nextConfig), {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      // Route Sentry events through a same-origin path so ad-blockers and
      // privacy extensions don't drop them (they pattern-match on
      // *.ingest.sentry.io, and some lists also block the default `/monitoring`).
      // Using an app-specific path avoids those known patterns.
      tunnelRoute: "/api/internal/observability",
    });
