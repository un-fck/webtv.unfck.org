-- Migration 012: attribute transcripts to the user who started them.
--
-- Tracking only. Daily limits are enforced via counters in `rate_limits`, so
-- ownership is not in the enforcement path. Purpose: future "my transcripts"
-- UI, abuse forensics, audit trail of who triggered which paid pipeline run.
--
-- `created_by` is nullable so the local `pnpm retranscribe` script (no user
-- context) and any existing rows remain valid. ON DELETE SET NULL preserves
-- the transcript row when the user who started it is deleted.
--
-- Apply once:
--   psql "$DATABASE_URL" -f sql/migrations/012_transcript_ownership.sql
--
-- Idempotent — safe to re-run.

ALTER TABLE webtv.transcripts
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES webtv.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transcripts_created_by_idx
  ON webtv.transcripts (created_by);
