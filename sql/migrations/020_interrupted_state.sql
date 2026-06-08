-- Migration 020: durable job processing — interrupted state + heartbeat + worker_id.
--
-- Replaces the brittle "pipeline_lock as re-entry mutex" pattern with an
-- explicit `interrupted` lifecycle state. A pipeline killed mid-flight (Azure
-- deploy SIGTERM, OOM, host kill) now lands in `interrupted` and is picked
-- up by the boot-time picker on the next worker — instead of sitting stuck
-- for up to 2 hours before the old sweeper flipped it to `error` with no
-- automatic retry.
--
-- Changes:
--   1. `pipeline_lock` → `heartbeat_at`. Same data; the role changes from
--      "re-entry mutex" to a pure liveness signal refreshed by the owning
--      worker every ~60s.
--   2. Add `worker_id` so a dying worker's SIGTERM handler can scope its
--      "flip my own in-flight rows to interrupted" UPDATE to its own rows
--      (multi-replica safe).
--   3. Add `retry_count` so the picker can cap automatic resumes of
--      `interrupted` rows (5) before escalating to `error`. Genuine errors
--      are never auto-retried regardless.
--   4. Allow `interrupted` on both status axes (transcription_status and
--      analysis_status).
--   5. Partial index on `worker_id` for the per-worker scans (SIGTERM-time
--      cleanup, heartbeat tick).
--
-- Apply once per database:
--   psql "$DATABASE_URL" -f sql/migrations/020_interrupted_state.sql
--
-- Idempotent — safe to re-run.
SET search_path = webtv, public;

-- 1. Rename pipeline_lock → heartbeat_at (only if not already renamed).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'webtv'
       AND table_name = 'transcripts'
       AND column_name = 'pipeline_lock'
  ) THEN
    ALTER TABLE webtv.transcripts RENAME COLUMN pipeline_lock TO heartbeat_at;
  END IF;
END $$;

-- 2, 3. New columns.
ALTER TABLE webtv.transcripts
  ADD COLUMN IF NOT EXISTS worker_id TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;

-- 4. Expand CHECK constraints to allow 'interrupted'. DROP+ADD because
-- inline column-level CHECKs are unnamed when first declared; PostgreSQL
-- generates the predictable `<table>_<column>_check` name we re-use here.
ALTER TABLE webtv.transcripts
  DROP CONSTRAINT IF EXISTS transcripts_transcription_status_check;
ALTER TABLE webtv.transcripts
  ADD CONSTRAINT transcripts_transcription_status_check
  CHECK (transcription_status IN (
    'scheduled', 'transcribing', 'identifying_speakers',
    'analyzing_topics', 'completed', 'error', 'interrupted'
  ));

ALTER TABLE webtv.transcripts
  DROP CONSTRAINT IF EXISTS transcripts_analysis_status_check;
ALTER TABLE webtv.transcripts
  ADD CONSTRAINT transcripts_analysis_status_check
  CHECK (analysis_status IN ('none', 'analyzing', 'completed', 'error', 'interrupted'));

-- 5. Partial index for per-worker scans (SIGTERM cleanup + heartbeat tick).
CREATE INDEX IF NOT EXISTS idx_transcripts_worker_id
  ON webtv.transcripts(worker_id)
  WHERE worker_id IS NOT NULL;
