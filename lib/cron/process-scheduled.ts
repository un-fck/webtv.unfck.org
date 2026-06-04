import { after } from "next/server";
import { getScheduledTranscripts, withJobLock } from "@/lib/db";
import { getKalturaAudioUrl, submitTranscription } from "@/lib/transcription";

const ts = () => new Date().toTimeString().slice(0, 8);

export type ProcessScheduledResult =
  | { skipped: "lock_held" }
  | {
      processed: number;
      started: number;
      pending: number;
      errors: string[];
      message?: string;
    };

/**
 * Picks up scheduled-transcript rows, checks audio availability, and submits
 * the pipeline for each one. The pipeline runs in `after()` so the tick can
 * return promptly. Idempotent across replicas via withJobLock.
 */
export async function runProcessScheduled(): Promise<ProcessScheduledResult> {
  const result = await withJobLock("process-scheduled", async () => {
    const scheduled = await getScheduledTranscripts();
    if (scheduled.length === 0) {
      return {
        processed: 0,
        started: 0,
        pending: 0,
        errors: [] as string[],
        message: "No scheduled transcripts",
      };
    }

    let started = 0;
    let pending = 0;
    const errors: string[] = [];

    for (const item of scheduled) {
      try {
        const kalturaId = item.entry_id;
        const { isLiveStream } = await getKalturaAudioUrl(kalturaId);
        if (isLiveStream) {
          pending++;
          continue;
        }
        const { transcriptId } = await submitTranscription(kalturaId, {
          existingTranscriptId: item.transcript_id,
          language: item.language_code || "en",
          schedule: after,
        });
        console.log(
          `[${ts()}] ✓ Started scheduled transcript for ${kalturaId} → ${transcriptId}`,
        );
        started++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes("404") ||
          msg.includes("not found") ||
          msg.includes("no flavors")
        ) {
          pending++;
        } else {
          console.error(
            `Error processing scheduled transcript ${item.transcript_id}:`,
            err,
          );
          errors.push(`${item.transcript_id}: ${msg}`);
        }
      }
    }

    return {
      processed: scheduled.length,
      started,
      pending,
      errors,
    };
  });
  return result ?? { skipped: "lock_held" };
}
