-- Migration 004: fail stale in-progress transcripts.
--
-- Historical rows got stuck mid-pipeline (transcribing / identifying_speakers
-- / analyzing_topics) when a job died without updating status. Now that
-- viewability surfaces in-progress rows to all viewers, a stuck row would show
-- a perpetual "transcribing…" instead of a Transcribe button. Mark the dead
-- ones as `error` so the UI offers a retry.
--
-- Guards:
--   * Only rows with NO progress in the last hour (the pipeline_lock stale
--     timeout is 30 min, so >1h is definitively dead) — never touches a job
--     that is actually running.
--   * Excludes `scheduled` — those legitimately wait for the cron until the
--     meeting's audio becomes available.
--
-- Apply once per database:
--   psql "$DATABASE_URL" -f sql/migrations/004_fail_stale_in_progress.sql
--
-- Idempotent — safe to re-run (a fresh DB has no stale rows; it's a no-op).
SET search_path = webtv, public;

UPDATE webtv.transcripts
   SET transcription_status = 'error',
       error_message = 'Marked failed by cleanup: stale in-progress transcript (no progress for over 1 hour)',
       pipeline_lock = NULL,
       updated_at = NOW()
 WHERE transcription_status IN (
         'transcribing',
         'identifying_speakers',
         'analyzing_topics'
       )
   AND updated_at < NOW() - INTERVAL '1 hour';
