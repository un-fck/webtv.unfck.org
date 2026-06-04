// In-process cron scheduler for Azure Container Apps deployment.
//
// Lives here (sibling to instrumentation.ts) rather than inline because
// Turbopack's dev compiler analyses the full body of any function reachable
// from instrumentation.ts when building its Edge-runtime variant — even when
// the function is gated behind `NEXT_RUNTIME === "nodejs"`. That walk hits
// Node-only APIs (`process.once`, the cron runners' chains into ffmpeg/fs/…)
// and fails the Edge bundle.
//
// Webpack production builds DCE the dead branch, so prod was always fine.
// The dev fix is to keep the Node-only code in a file the Edge bundler
// never sees: instrumentation.ts dynamic-imports this module with
// `/* turbopackIgnore: true */`, breaking the trace.
import * as Sentry from "@sentry/nextjs";
import { CronJob } from "cron";
import vercelConfig from "./vercel.json";
import { runProcessScheduled } from "@/lib/cron/process-scheduled";
import { runSyncVideos } from "@/lib/cron/sync-videos";
import { runCheckPv } from "@/lib/cron/check-pv";
import { runSendTranscriptNotifications } from "@/lib/cron/send-transcript-notifications";
import { runRealign } from "@/lib/cron/realign";
import { runSweepStuckPipelines } from "@/lib/cron/sweep-stuck-pipelines";
import { pool } from "@/lib/db";

export async function startInternalCronScheduler(): Promise<void> {
  // vercel.json is the single source of truth for which cron paths exist and
  // how often they fire. The registry below maps each path to the function
  // that implements it; this scheduler just iterates vercel.json's entries
  // and wires them up. Adding a new cron = add to vercel.json + add to the
  // registry. Schedule changes only need vercel.json.
  const crons = (vercelConfig as { crons?: { path: string; schedule: string }[] })
    .crons ?? [];

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

  const cronJobs: { name: string; job: CronJob }[] = [];
  for (const entry of crons) {
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
      await pool.end();
      console.log("[cron] pg pool drained");
    } catch (err) {
      console.warn("[cron] failed to drain pg pool:", err);
    }
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}
