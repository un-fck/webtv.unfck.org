/**
 * Per-process initialisation for the long-running server. Wired in from
 * `instrumentation.ts` (Next's official per-server-start hook). Production-
 * only — hot reload in `pnpm dev` would otherwise mark rows interrupted on
 * every file save.
 *
 * Three responsibilities:
 *   1. Heartbeat tick — every 60s, refresh `heartbeat_at` on every row this
 *      worker owns. The liveness sweep keys off this; without the tick, a
 *      long provider call (transcription stage holds no per-stage updates)
 *      would look dead within 5min.
 *   2. SIGTERM handler — on graceful shutdown (Azure deploy), flip all rows
 *      we own from in-flight states to `interrupted` in a single statement,
 *      then exit. Bounded by a 10s timeout race so we never block past the
 *      orchestrator's grace period.
 *   3. Boot picker — fire `runProcessScheduled` once at startup so any rows
 *      left `interrupted` by a previous worker (or freshly `scheduled`)
 *      start running immediately, without waiting for the next cron tick.
 *      Detached via `setImmediate` so it never blocks server readiness.
 */
import {
  heartbeatOwnRows,
  markOwnRowsInterrupted,
} from "@/lib/db";
import { currentWorkerId } from "@/lib/worker-identity";

const HEARTBEAT_INTERVAL_MS = 60_000;
const SIGTERM_CLEANUP_TIMEOUT_MS = 10_000;

let initialised = false;
let shuttingDown = false;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

export function initWorker(): void {
  // Only wire up the long-lived machinery in production. Dev hot-reload
  // sends SIGTERM on every file save; cycling rows through `interrupted`
  // on each save would create retranscribe loops while iterating locally.
  if (process.env.NODE_ENV !== "production") return;
  // Skip on the Edge runtime — only the Node runtime hits the DB / has a
  // long-lived process worth instrumenting.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;
  if (initialised) return;
  initialised = true;

  const workerId = currentWorkerId();
  console.log(`[server-init] worker ${workerId} starting`);

  const tick = async () => {
    if (shuttingDown) return;
    try {
      const count = await heartbeatOwnRows(workerId);
      console.log(
        `[server-init] heartbeat tick: refreshed ${count} owned row(s) for ${workerId}`,
      );
    } catch (err) {
      console.warn("[server-init] heartbeat failed:", err);
    }
  };
  heartbeatTimer = setInterval(tick, HEARTBEAT_INTERVAL_MS);
  // Don't keep the event loop alive for the heartbeat alone — if everything
  // else has exited, we should too.
  if (typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();
  // Fire one tick immediately so we have fast feedback in logs that the
  // mechanism is wired up (instead of waiting 60s for the first interval).
  void tick();

  // Patch process.exit so Next's own SIGTERM/SIGINT handlers (which call
  // process.exit synchronously after server.close, on the same signal)
  // can't preempt our async cleanup UPDATE. While we're shutting down, any
  // attempt to exit is suppressed; once our cleanup commits we restore the
  // real exit and call it ourselves. Without this, server.close (no open
  // connections → completes in ms) races our DB UPDATE (~tens of ms) and
  // wins, killing the cleanup before it commits.
  const realExit = process.exit.bind(process);
  let exitGuarded = false;
  process.exit = ((code?: number) => {
    if (exitGuarded) {
      console.log(
        `[server-init] suppressing process.exit(${code ?? 0}) during cleanup`,
      );
      return undefined as never;
    }
    return realExit(code);
  }) as typeof process.exit;

  const onShutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    exitGuarded = true;
    console.log(`[server-init] received ${signal}, releasing owned rows`);
    if (heartbeatTimer) clearInterval(heartbeatTimer);

    // Race the cleanup UPDATE against a hard timeout. If the DB is slow
    // and we'd blow past the orchestrator's grace period (Azure: 30s),
    // give up — the liveness sweep is our backstop.
    const cleanup = markOwnRowsInterrupted(workerId)
      .then(({ transcription, analysis }) => {
        console.log(
          `[server-init] cleanup: flipped ${transcription} transcription + ${analysis} analysis rows owned by ${workerId} to interrupted`,
        );
      })
      .catch((err) => {
        console.error("[server-init] cleanup UPDATE failed:", err);
      });
    const timeout = new Promise<void>((resolve) =>
      setTimeout(() => {
        console.warn(
          `[server-init] cleanup timed out after ${SIGTERM_CLEANUP_TIMEOUT_MS}ms, exiting`,
        );
        resolve();
      }, SIGTERM_CLEANUP_TIMEOUT_MS),
    );

    Promise.race([cleanup, timeout]).finally(() => {
      exitGuarded = false;
      realExit(0);
    });
  };

  process.on("SIGTERM", onShutdown);
  process.on("SIGINT", onShutdown);

  // Boot picker — kick the scheduled/interrupted queue once on startup
  // without waiting for the next cron tick (up to 5min away). Detached so
  // it never blocks server readiness. Dynamic import avoids dragging the
  // entire transcription module graph into the boot path; if instrumentation
  // ever gets imported on the Edge runtime by mistake, this stays inert.
  //
  // Short retry-with-backoff on `lock_held`: another replica (or, during a
  // rollout, an old-code container) holding the advisory lock at the
  // exact moment we boot would otherwise leave us doing nothing until the
  // next cron tick. Five attempts × ~10s backoff gives plenty of room to
  // catch a free window without keeping the boot path noisy.
  setImmediate(() => {
    void (async () => {
      try {
        const { runProcessScheduled } = await import("@/lib/cron/process-scheduled");
        for (let attempt = 1; attempt <= 5; attempt++) {
          if (shuttingDown) return;
          const result = await runProcessScheduled({
            schedule: (work) => setImmediate(work),
          });
          if (!("skipped" in result)) {
            console.log("[server-init] boot picker:", result);
            return;
          }
          if (attempt < 5) {
            console.log(
              `[server-init] boot picker: lock held (attempt ${attempt}/5), retrying in 10s`,
            );
            await new Promise((r) => setTimeout(r, 10_000));
          } else {
            console.log(
              "[server-init] boot picker: lock held after 5 attempts, leaving to cron",
            );
          }
        }
      } catch (err) {
        console.error("[server-init] boot picker failed:", err);
      }
    })();
  });
}
