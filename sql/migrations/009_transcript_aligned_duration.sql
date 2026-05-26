-- Migration 009: record which audio duration a realignment offset was computed
-- against, so re-cuts are detected idempotently.
--
-- `time_offset_ms` (migration 008) is the constant shift to align a transcript
-- to the current audio. But a video can be re-cut MORE THAN ONCE. To know when a
-- stored offset has gone stale we must remember the audio length it was
-- reconciled to:
--
--   * aligned_duration_ms — the current audio duration (ms) at the moment we
--     last evaluated realignment for this transcript. The realign job re-fires
--     only when the live Kaltura duration drops below
--     COALESCE(aligned_duration_ms, source_duration_ms) by a threshold — i.e.
--     ANY further reduction. After a (re)align it is set to the current
--     duration, so the row self-quiesces until the next genuine change.
--
-- Detection is on REDUCTION of duration (not "content sticking out past the
-- audio end"): a front trim that is absorbed by trailing silence shortens the
-- file without pushing content past the end, and must still be caught.
--
-- A row with aligned_duration_ms SET but time_offset_ms NULL means "checked at
-- this duration, but the change was not a clean constant front-shift (mid-cut /
-- truncation) — needs manual re-transcription"; it won't be re-evaluated until
-- the duration changes again.
--
-- Apply once to an existing database:
--   psql "$DATABASE_URL" -f sql/migrations/009_transcript_aligned_duration.sql
--
-- Idempotent — safe to re-run.
SET search_path = webtv, public;

ALTER TABLE webtv.transcripts
  ADD COLUMN IF NOT EXISTS aligned_duration_ms INTEGER;
