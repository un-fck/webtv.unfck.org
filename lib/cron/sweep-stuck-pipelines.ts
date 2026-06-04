import { sweepStuckTranscripts, withJobLock } from "@/lib/db";

export type SweepResult =
  | { skipped: "lock_held" }
  | { transcription: number; analysis: number };

/**
 * Resets transcripts whose pipeline stalled (no updated_at progress past the
 * stuck threshold) back to `error` so they're visible as such and can be
 * retried. Recovers SIGTERM-killed in-flight pipelines on Azure deploys, and
 * any other host-level kill that bypassed normal error handling. The same
 * filtered sweep already runs inline on active-transcript reads; this is the
 * global, untargeted version.
 */
export async function runSweepStuckPipelines(): Promise<SweepResult> {
  const result = await withJobLock("sweep-stuck-pipelines", async () => {
    const counts = await sweepStuckTranscripts();
    if (counts.transcription > 0 || counts.analysis > 0) {
      console.log(
        `[sweep-stuck] flipped ${counts.transcription} transcription + ${counts.analysis} analysis rows to error`,
      );
    }
    return counts;
  });
  return result ?? { skipped: "lock_held" };
}
