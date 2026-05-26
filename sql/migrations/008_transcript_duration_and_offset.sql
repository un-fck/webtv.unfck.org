-- Migration 008: record the source audio length at transcription time, and a
-- realignment offset for transcripts whose audio was later re-cut by WebTV.
--
-- Background: UN WebTV sometimes trims dead air off the FRONT of a video after
-- we have already transcribed it (e.g. 17 min of pre-meeting filler removed).
-- The transcript's timestamps then sit ahead of the (now shorter) audio by a
-- constant amount. To detect and fix this we need:
--
--   * source_duration_ms — the actual audio length we transcribed, frozen at
--     transcription time. `videos.duration` is overwritten on every re-sync, so
--     it cannot serve as a historical baseline. With this column, a length
--     change is detected exactly: current_audio_length != source_duration_ms.
--     (For rows predating this column, the max statement `end` timestamp is used
--     as a lower-bound proxy — see scripts/dev/realign.ts.)
--
--   * time_offset_ms — constant shift to ADD to every stored timestamp to align
--     the transcript to the current audio. Negative when content was trimmed
--     from the front. NULL = no realignment needed / not yet computed. The
--     player applies this offset at render time; stored timestamps are left
--     untouched so the operation is reversible and re-runnable.
--
-- Apply once to an existing database:
--   psql "$DATABASE_URL" -f sql/migrations/008_transcript_duration_and_offset.sql
--
-- Idempotent — safe to re-run.
SET search_path = webtv, public;

ALTER TABLE webtv.transcripts
  ADD COLUMN IF NOT EXISTS source_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS time_offset_ms INTEGER;
