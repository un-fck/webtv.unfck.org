// Next.js server-side instrumentation. Runs once per server start.
// Initialises Sentry for the Node / Edge runtimes so server errors (route
// handlers, server components, server actions) reach the dashboard.
// The companion `instrumentation-client.ts` initialises the browser SDK.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  const common = {
    dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    // Errors only — perf tracing off by default to keep noise low. Set
    // SENTRY_TRACES_SAMPLE_RATE=0.1 (or similar) to enable.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0,
  };

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init(common);
  } else if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(common);
  }
}

// Forwards server errors raised by Next (route handlers, server components,
// server actions) to Sentry with the request context attached.
export const onRequestError = Sentry.captureRequestError;
