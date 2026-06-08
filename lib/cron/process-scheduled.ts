import { after } from "next/server";
import {
  getRunnableTranscripts,
  getRunnableAnalyses,
  claimTranscript,
  releaseTranscript,
  releaseAnalysis,
  withJobLock,
  MAX_INTERRUPTED_RETRIES,
} from "@/lib/db";
import {
  getKalturaAudioUrl,
  submitTranscription,
  runSpeakerIdentification,
  runPropositionAnalysisJob,
} from "@/lib/transcription";
import { currentWorkerId } from "@/lib/worker-identity";

const ts = () => new Date().toTimeString().slice(0, 8);

// Detaching strategy for the long-running per-row work. From a cron HTTP
// handler we pass Next's `after()` so the work outlives the response on
// platforms (Vercel) that freeze the function after responding; from the
// boot picker (no request context — `after()` would throw) we pass
// `setImmediate` so the work just runs in the background of the live
// Node process.
export type ScheduleFn = (work: () => void) => void;

export type ProcessScheduledResult =
  | { skipped: "lock_held" }
  | {
      processed: number;
      started: number;
      resumed: number;
      pending: number;
      abandoned: number;
      analysisResumed: number;
      errors: string[];
      message?: string;
    };

/**
 * Picks up runnable transcripts and resumes/starts the pipeline for each.
 *
 * Runnable = `scheduled` (waiting for audio / first attempt) OR
 * `interrupted` with retry_count < cap (worker died mid-flight; safe to
 * resume). Dispatches per row:
 *   - empty raw_paragraphs → (re)transcribe from scratch via
 *     submitTranscription, reusing the existing transcript_id
 *   - non-empty raw_paragraphs → resume the analysis stage via
 *     runSpeakerIdentification (skips the expensive provider call)
 *
 * `interrupted` rows that have hit the retry cap are escalated to `error`
 * in this same tick so a poison-pill row never loops forever.
 *
 * Also handles `analysis_status = 'interrupted'` on a separate pass — those
 * are on-demand proposition runs that got SIGTERMed.
 *
 * Long-running per-row work is dispatched via `after()` (when the cron tick
 * runs in a serverless request context) so the HTTP response can return
 * promptly while the pipelines continue.
 *
 * Idempotent across replicas via `withJobLock`.
 */
export async function runProcessScheduled(
  options: { schedule?: ScheduleFn } = {},
): Promise<ProcessScheduledResult> {
  const schedule = options.schedule ?? after;
  const result = await withJobLock("process-scheduled", async () => {
    const [scheduled, interruptedAnalyses] = await Promise.all([
      getRunnableTranscripts(),
      getRunnableAnalyses(),
    ]);

    let started = 0;
    let resumed = 0;
    let pending = 0;
    let abandoned = 0;
    let analysisResumed = 0;
    const errors: string[] = [];
    const workerId = currentWorkerId();

    for (const item of scheduled) {
      try {
        const kalturaId = item.entry_id;

        if (item.transcription_status === "interrupted") {
          // Hard cap reached — escalate to `error` so it stops appearing
          // here. The picker filter already excludes >= cap, but a row at
          // exactly cap-1 will pass the filter, then this branch trips on
          // the next failure. Keep both as a belt-and-suspenders guard.
          if (item.retry_count >= MAX_INTERRUPTED_RETRIES) {
            await releaseTranscript(
              item.transcript_id,
              "error",
              `Abandoned after ${MAX_INTERRUPTED_RETRIES} interruption-retries`,
            );
            abandoned++;
            continue;
          }

          if (item.has_raw_paragraphs) {
            // Resume the analysis stage only — transcription already
            // produced raw_paragraphs, which are expensive to redo.
            // claimTranscript atomically transitions from `interrupted` to
            // `identifying_speakers` + stamps worker_id + retry_count++.
            const claimed = await claimTranscript(
              item.transcript_id,
              ["interrupted"],
              "identifying_speakers",
              workerId,
              { incrementRetry: true },
            );
            if (!claimed) continue; // another worker grabbed it

            const runResume = () => {
              runSpeakerIdentification(item.transcript_id).catch((err) => {
                console.error(
                  `[${ts()}] [process-scheduled] resume analysis failed for ${item.transcript_id}:`,
                  err,
                );
              });
            };
            schedule(runResume);
            console.log(
              `[${ts()}] ↻ Resumed analysis for ${item.transcript_id} (retry ${item.retry_count + 1})`,
            );
            resumed++;
            continue;
          }
          // No raw_paragraphs yet — fall through to the (re)transcribe
          // path below. submitTranscription will overwrite the empty
          // content and run the full pipeline.
        }

        const { isLiveStream } = await getKalturaAudioUrl(kalturaId);
        if (isLiveStream) {
          pending++;
          continue;
        }

        // For interrupted rows we also claim+incrementRetry here so the
        // counter advances even though submitTranscription does its own
        // INSERT-or-UPDATE. (submitTranscription's saveTranscript leaves
        // worker_id / retry_count untouched, so this claim is needed.)
        if (item.transcription_status === "interrupted") {
          const claimed = await claimTranscript(
            item.transcript_id,
            ["interrupted"],
            "transcribing",
            workerId,
            { incrementRetry: true },
          );
          if (!claimed) continue;
        }

        const { transcriptId } = await submitTranscription(kalturaId, {
          existingTranscriptId: item.transcript_id,
          language: item.language_code || "en",
          schedule,
        });
        if (item.transcription_status === "interrupted") {
          console.log(
            `[${ts()}] ↻ Resumed transcription for ${kalturaId} → ${transcriptId} (retry ${item.retry_count + 1})`,
          );
          resumed++;
        } else {
          console.log(
            `[${ts()}] ✓ Started scheduled transcript for ${kalturaId} → ${transcriptId}`,
          );
          started++;
        }
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
            `[${ts()}] [process-scheduled] error on ${item.transcript_id}:`,
            err,
          );
          errors.push(`${item.transcript_id}: ${msg}`);
        }
      }
    }

    // Second pass: on-demand proposition analyses that were interrupted.
    // These don't go through submitTranscription — the transcript itself
    // is `completed` and we only need to re-run propositions.
    for (const item of interruptedAnalyses) {
      try {
        if (item.retry_count >= MAX_INTERRUPTED_RETRIES) {
          await releaseAnalysis(
            item.transcript_id,
            "error",
            `Analysis abandoned after ${MAX_INTERRUPTED_RETRIES} interruption-retries`,
          );
          abandoned++;
          continue;
        }
        const runResume = () => {
          runPropositionAnalysisJob(item.transcript_id).catch((err) => {
            console.error(
              `[${ts()}] [process-scheduled] resume analysis failed for ${item.transcript_id}:`,
              err,
            );
          });
        };
        after(runResume);
        console.log(
          `[${ts()}] ↻ Resumed proposition analysis for ${item.transcript_id} (retry ${item.retry_count + 1})`,
        );
        analysisResumed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`analysis ${item.transcript_id}: ${msg}`);
      }
    }

    if (
      scheduled.length === 0 &&
      interruptedAnalyses.length === 0
    ) {
      return {
        processed: 0,
        started: 0,
        resumed: 0,
        pending: 0,
        abandoned: 0,
        analysisResumed: 0,
        errors: [] as string[],
        message: "No runnable transcripts",
      };
    }

    return {
      processed: scheduled.length + interruptedAnalyses.length,
      started,
      resumed,
      pending,
      abandoned,
      analysisResumed,
      errors,
    };
  });
  return result ?? { skipped: "lock_held" };
}
