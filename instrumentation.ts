// Next.js server-side instrumentation. Runs once per server start.
// Initialises Sentry for the Node / Edge runtimes so server errors (route
// handlers, server components, server actions) reach the dashboard.
// The companion `instrumentation-client.ts` initialises the browser SDK.
//
// Cron scheduling is NOT bootstrapped here. On Azure the container's
// system cron daemon (`docker/crontab.template` materialised by
// `docker/entrypoint.sh`) `curl`s the `/api/cron/*` HTTP routes directly.
// On Vercel no cron fires at all — `vercel.json` intentionally has no
// `crons` array. Keeping this file Sentry-only avoids dragging the
// transcription/provider import graph into the Edge bundle of
// `register()`, which is what previously broke dev + Vercel builds.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  // Skip in dev: Sentry's Node instrumentation patches built-in modules and
  // retains per-request span context, which compounds under Turbopack HMR and
  // OOMs the dev server. Prod behaviour is unchanged.
  if (
    process.env.NODE_ENV !== "production" ||
    !(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)
  ) {
    return;
  }
  const common = {
    dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
    // VERCEL_ENV on Vercel, AZURE_ENV on Azure (set in the Container App
    // config), NODE_ENV otherwise.
    environment:
      process.env.VERCEL_ENV ||
      process.env.AZURE_ENV ||
      process.env.NODE_ENV,
    // Errors only — perf tracing off by default to keep noise low. Set
    // SENTRY_TRACES_SAMPLE_RATE=0.1 (or similar) to enable.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0,
  };
  // Same config for both runtimes; the SDK adapter is selected by
  // Sentry's nextjs integration based on NEXT_RUNTIME.
  Sentry.init(common);
}

// Forwards server errors raised by Next (route handlers, server components,
// server actions) to Sentry with the request context attached.
export const onRequestError = Sentry.captureRequestError;
