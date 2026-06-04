// Next.js server-side instrumentation. Runs once per server start.
// Initialises Sentry for the Node / Edge runtimes so server errors (route
// handlers, server components, server actions) reach the dashboard.
// The companion `instrumentation-client.ts` initialises the browser SDK.
//
// Also boots the in-process cron scheduler on Azure (gated by
// ENABLE_INTERNAL_CRON=1). On Vercel the cron jobs fire via the HTTP routes
// listed in `vercel.json` instead, so the env var stays unset there.
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
    await startInternalCronScheduler();
  }
}

// Forwards server errors raised by Next (route handlers, server components,
// server actions) to Sentry with the request context attached.
export const onRequestError = Sentry.captureRequestError;

async function startInternalCronScheduler() {
  const { CronJob } = await import("cron");
  // vercel.json is the single source of truth for which cron paths exist and
  // how often they fire. The registry below maps each path to the function
  // that implements it; this scheduler just iterates vercel.json's entries
  // and wires them up. Adding a new cron = add to vercel.json + add to the
  // registry. Schedule changes only need vercel.json.
  const vercelConfig = (await import("./vercel.json")).default as {
    crons?: { path: string; schedule: string }[];
  };
  const { runProcessScheduled } = await import("@/lib/cron/process-scheduled");
  const { runSyncVideos } = await import("@/lib/cron/sync-videos");
  const { runCheckPv } = await import("@/lib/cron/check-pv");
  const { runSendTranscriptNotifications } = await import(
    "@/lib/cron/send-transcript-notifications"
  );
  const { runRealign } = await import("@/lib/cron/realign");
  const { runSweepStuckPipelines } = await import(
    "@/lib/cron/sweep-stuck-pipelines"
  );

  const registry: Record<string, () => Promise<unknown>> = {
    "/api/cron/process-scheduled": runProcessScheduled,
    "/api/cron/sync-videos": runSyncVideos,
    "/api/cron/check-pv": runCheckPv,
    "/api/cron/send-transcript-notifications": runSendTranscriptNotifications,
    "/api/cron/realign": runRealign,
    "/api/cron/sweep-stuck-pipelines": runSweepStuckPipelines,
  };

  const wrap =
    (name: string, fn: () => Promise<unknown>) =>
    async () => {
      const startedAt = Date.now();
      try {
        const result = await fn();
        console.log(
          `[cron:${name}] ok in ${Date.now() - startedAt}ms`,
          result,
        );
      } catch (err) {
        console.error(`[cron:${name}] failed`, err);
        Sentry.captureException(err, { tags: { cron: name } });
      }
    };

  const cronJobs: { name: string; job: import("cron").CronJob }[] = [];
  for (const entry of vercelConfig.crons ?? []) {
    const fn = registry[entry.path];
    if (!fn) {
      console.warn(
        `[cron] vercel.json lists ${entry.path} but no runner is registered; skipping`,
      );
      continue;
    }
    // Job name = the last path segment, used for lock keys + log tags. Must
    // be stable across deploys — the Postgres advisory lock keys hash on it.
    const name = entry.path.replace(/^\/api\/cron\//, "");
    const job = new CronJob(entry.schedule, wrap(name, fn), null, true, "UTC");
    console.log(`[cron] scheduled ${name} (${entry.schedule} UTC)`);
    cronJobs.push({ name, job });
  }

  // Graceful shutdown — Azure Container Apps sends SIGTERM with a 30s grace
  // window. Stop scheduling new ticks; in-flight ticks continue but anything
  // they spawned via `after()` is on borrowed time. The sweep-stuck-pipelines
  // cron recovers any rows the kill leaves stuck.
  const shutdown = async (signal: string) => {
    console.log(`[cron] received ${signal}, stopping schedulers`);
    for (const { name, job } of cronJobs) {
      try {
        job.stop();
        console.log(`[cron] stopped ${name}`);
      } catch (err) {
        console.warn(`[cron] failed to stop ${name}:`, err);
      }
    }
    try {
      const { pool } = await import("@/lib/db");
      await pool.end();
      console.log("[cron] pg pool drained");
    } catch (err) {
      console.warn("[cron] failed to drain pg pool:", err);
    }
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}
