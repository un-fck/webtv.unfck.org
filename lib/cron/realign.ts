import * as Sentry from "@sentry/nextjs";
import { pool, withJobLock } from "@/lib/db";
import {
  realignTranscript,
  fetchCurrentDurations,
  REDUCTION_TRIGGER_S,
} from "@/lib/realignment";

// Bound work per run so we stay within the serverless time budget. Each realign
// is a ~5MB clip download + one Gemini call (~15s).
const MAX_REALIGNS_PER_RUN = 10;
// Only spend a Gemini call when the live audio is meaningfully shorter than the
// length we last reconciled to (cheap pre-screen). The core re-checks.
const SHRINK_SCREEN_S = REDUCTION_TRIGGER_S;
// WebTV re-cuts happen within days of upload; only surveil recent meetings so
// the hourly scan stays tiny.
const SURVEIL_DAYS = 10;

export type RealignResult =
  | { skipped: "lock_held" }
  | {
      candidates: number;
      shrunk?: number;
      processed?: number;
      remaining?: number;
      applied?: string[];
      flagged?: { id: string; message?: string }[];
      summary?: Record<string, number>;
      estCostUsd?: number;
    };

/**
 * Realign transcripts whose audio WebTV re-cut after transcription.
 *
 * Uses `source_duration_ms` (recorded at transcription time, migration 008) as
 * the baseline and the CURRENT Kaltura duration as the comparison — NOT
 * `videos.duration`, which goes stale once a video ages out of the ~3-day sync
 * window and is never refreshed for an existing row. Validated constant-shift
 * offsets are applied automatically; non-constant changes (mid-cut / truncation)
 * are reported as `flagged` for manual review.
 */
export async function runRealign(): Promise<RealignResult> {
  const result = await withJobLock("realign", async () => {
    const { rows } = await pool.query<{
      transcript_id: string;
      entry_id: string;
      kaltura_id: string;
      language_code: string | null;
      source_duration_ms: number;
      baseline_ms: number;
      statements: unknown;
    }>(
      `WITH ranked AS (
         SELECT t.transcript_id, t.entry_id, t.kaltura_id, t.language_code,
                t.source_duration_ms,
                COALESCE(t.aligned_duration_ms, t.source_duration_ms) AS baseline_ms,
                t.content->'statements' AS statements,
                ROW_NUMBER() OVER (
                  PARTITION BY t.kaltura_id, t.language_code
                  ORDER BY t.created_at DESC
                ) AS rn
           FROM webtv.transcripts t
           JOIN webtv.videos v ON v.kaltura_id = t.kaltura_id
          WHERE t.transcription_status = 'completed'
            AND t.suppressed_at IS NULL
            AND t.start_time IS NULL
            AND t.source_duration_ms IS NOT NULL
            AND v.date >= CURRENT_DATE - ($1)::int
            AND t.content ? 'statements'
            AND jsonb_array_length(t.content->'statements') > 0
       )
       SELECT transcript_id, entry_id, kaltura_id, language_code,
              source_duration_ms, baseline_ms, statements
         FROM ranked WHERE rn = 1`,
      [SURVEIL_DAYS],
    );

    if (rows.length === 0) {
      return { candidates: 0, shrunk: 0, processed: 0 };
    }

    const durations = await fetchCurrentDurations([
      ...new Set(rows.map((r) => r.entry_id)),
    ]);
    const shrunk = rows.filter((r) => {
      const cur = durations.get(r.entry_id);
      return cur != null && r.baseline_ms / 1000 - cur > SHRINK_SCREEN_S;
    });

    const toProcess = shrunk.slice(0, MAX_REALIGNS_PER_RUN);
    console.log(
      `[realign] ${rows.length} candidates, ${shrunk.length} shrunk, processing ${toProcess.length}`,
    );

    const summary: Record<string, number> = {};
    const applied: string[] = [];
    const flagged: { id: string; message?: string }[] = [];
    let tokensIn = 0;
    let tokensOut = 0;

    for (const r of toProcess) {
      try {
        const result = await realignTranscript(
          {
            transcriptId: r.transcript_id,
            entryId: r.entry_id,
            kalturaId: r.kaltura_id,
            languageCode: r.language_code,
            statements: r.statements as Parameters<
              typeof realignTranscript
            >[0]["statements"],
            sourceDurationMs: r.source_duration_ms,
            baselineDurationMs: r.baseline_ms,
          },
          { apply: true, currentSec: durations.get(r.entry_id) },
        );
        tokensIn += result.tokensIn;
        tokensOut += result.tokensOut;
        summary[result.status] = (summary[result.status] ?? 0) + 1;
        if (result.status === "applied") {
          applied.push(r.transcript_id);
          console.log(
            `[realign] ✓ ${r.transcript_id} offset ${(result.offsetMs ?? 0) / 1000}s`,
          );
        } else if (result.status === "invalid") {
          flagged.push({ id: r.transcript_id, message: result.message });
          console.warn(`[realign] ⚠ ${r.transcript_id} ${result.message}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // A WebTV re-cut is exactly what makes a row a realign candidate, and
        // the same re-cut leaves Kaltura re-converting its audio flavors for
        // ~15-60 min. During that window getKalturaAudioUrl throws "no flavors"
        // — an expected transient the next hourly tick clears, not a fault.
        // Classify as `deferred` and skip Sentry, mirroring the readiness gate
        // in process-scheduled.ts. Genuine failures still page.
        if (
          msg.includes("no flavors") ||
          msg.includes("404") ||
          msg.includes("not found")
        ) {
          summary["deferred"] = (summary["deferred"] ?? 0) + 1;
          console.warn(`[realign] ⏳ ${r.transcript_id} audio not ready: ${msg}`);
        } else {
          summary["error"] = (summary["error"] ?? 0) + 1;
          console.error(`[realign] error ${r.transcript_id}: ${msg}`);
          Sentry.captureException(err, {
            tags: { pipeline: "realign", transcript_id: r.transcript_id },
          });
        }
      }
    }

    return {
      candidates: rows.length,
      shrunk: shrunk.length,
      processed: toProcess.length,
      remaining: shrunk.length - toProcess.length,
      applied,
      flagged,
      summary,
      estCostUsd: Number(
        (tokensIn * (0.3 / 1e6) + tokensOut * (2.5 / 1e6)).toFixed(4),
      ),
    };
  });
  return result ?? { skipped: "lock_held" };
}
