// Next.js server-side instrumentation. Runs once per server start.
// Initialises Sentry for the Node / Edge runtimes so server errors (route
// handlers, server components, server actions) reach the dashboard.
// The companion `instrumentation-client.ts` initialises the browser SDK.
//
// Also boots the in-process cron scheduler on Azure (gated by
// ENABLE_INTERNAL_CRON=1). On Vercel the cron jobs fire via the HTTP routes
// listed in `vercel.json` instead, so the env var stays unset there. The
// cron bootstrap lives in `./instrumentation-cron.ts` — see the comment in
// that file for why it's separated.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  // Skip in dev: Sentry's Node instrumentation patches built-in modules and
  // retains per-request span context, which compounds under Turbopack HMR and
  // OOMs the dev server. Prod behaviour is unchanged.
  if (
    process.env.NODE_ENV === "production" &&
    (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)
  ) {
    const common = {
      dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
      // VERCEL_ENV on Vercel, AZURE_ENV on Azure (we set it explicitly in the
      // Container App config), NODE_ENV otherwise.
      environment:
        process.env.VERCEL_ENV ||
        process.env.AZURE_ENV ||
        process.env.NODE_ENV,
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

  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.ENABLE_INTERNAL_CRON === "1"
  ) {
    // Sibling-file dynamic import. `turbopackIgnore` keeps Turbopack's dev
    // compiler from walking into the cron file's Node-only chain (process
    // signals, the cron runners' transcription/provider imports, etc.) when
    // building the Edge variant of this module. Production Webpack DCEs the
    // surrounding `NEXT_RUNTIME === "nodejs"` branch from the Edge bundle
    // anyway, so the same trace never happens there.
    const { startInternalCronScheduler } = await import(
      /* turbopackIgnore: true */
      "./instrumentation-cron"
    );
    await startInternalCronScheduler();
  }
}

// Forwards server errors raised by Next (route handlers, server components,
// server actions) to Sentry with the request context attached.
export const onRequestError = Sentry.captureRequestError;
