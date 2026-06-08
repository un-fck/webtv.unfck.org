import { sweepStaleHeartbeats, withJobLock } from "@/lib/db";

export type LivenessSweepResult =
  | { skipped: "lock_held" }
  | { transcription: number; analysis: number };

/**
 * Backstop sweep for hard kills (OOM, SIGKILL after grace-period overrun,
 * network partition before the SIGTERM UPDATE committed). Flips in-flight
 * rows whose `heartbeat_at` is stale (>5min) to `interrupted` so the
 * process-scheduled picker auto-resumes them on the next tick.
 *
 * Graceful shutdowns (Azure deploys) are handled directly by the worker's
 * SIGTERM handler (`markOwnRowsInterrupted`); this cron exists only for
 * the cases that bypass that handler.
 */
export async function runLivenessSweep(): Promise<LivenessSweepResult> {
  const result = await withJobLock("liveness-sweep", async () => {
    const counts = await sweepStaleHeartbeats();
    if (counts.transcription > 0 || counts.analysis > 0) {
      console.log(
        `[liveness-sweep] flipped ${counts.transcription} transcription + ${counts.analysis} analysis rows to interrupted`,
      );
    }
    return counts;
  });
  return result ?? { skipped: "lock_held" };
}
