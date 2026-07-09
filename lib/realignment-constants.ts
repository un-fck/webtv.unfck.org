/**
 * Realignment threshold shared between the detection/compute side
 * (lib/realignment.ts, lib/cron/realign.ts — server-only, pulls in Gemini
 * helpers) and the data-access side (lib/db.ts:isTranscriptFlagged — imported
 * by API routes and server components). A leaf module keeps the two in sync
 * without dragging the realignment machinery into every bundle that only
 * needs the number.
 *
 * Current audio must be more than this much shorter than the last reconciled
 * length (COALESCE(aligned_duration_ms, source_duration_ms, last-statement-end
 * proxy)) before a transcript counts as re-cut.
 */
export const REDUCTION_TRIGGER_S = 30;
export const REDUCTION_TRIGGER_MS = REDUCTION_TRIGGER_S * 1000;
