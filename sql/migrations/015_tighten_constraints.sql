-- Migration 015: tighten schema constraints + drop redundant indexes.
--
-- Five things, grouped because they're all small and they're all "the schema
-- should reflect what's true / what we want enforced":
--
--   1. Drop `idx_transcripts_entry_id` — fully redundant with the compound
--      `idx_transcripts_entry_lang(entry_id, language_code)`, which Postgres
--      can use for any query filtering on `entry_id` (leading-column rule).
--      Audit confirmed 0 uses.
--
--   2. Drop `idx_usage_created_at` — no current query filters
--      `processing_usage_events` by date alone. ~3.8 MB recovered and one
--      less index to maintain on every usage-event insert (high-frequency).
--      Re-add if/when a date-range usage report is built.
--
--   3. NOT NULL on columns that already hold zero NULLs in practice. Catches
--      future bugs at insert time instead of letting nulls through:
--        transcripts.language_code
--        videos.clean_title, scheduled_time, duration, category
--
--   4. Partial index on `magic_tokens(email) WHERE used_at IS NULL` — speeds
--      up the per-email cooldown check (`recentTokenExists`) which currently
--      seq-scans the table. Latent O(N), invisible at today's volume.
--
--   5. CHECK constraints on `transcripts.transcription_status` and
--      `analysis_status` matching the enums the app uses. Catches typos at
--      the DB layer; mirrors the pattern from `user_features.status`.
--
-- Apply once:
--   psql "$DATABASE_URL" -f sql/migrations/015_tighten_constraints.sql
--
-- Idempotent — drops/creates use IF [NOT] EXISTS; the SET NOT NULL and CHECK
-- additions are guarded by `DO` blocks that no-op when already in place.

SET search_path = webtv, public;

BEGIN;

-- ── 1 + 2. Drop redundant / unused indexes ──────────────────────────────────
DROP INDEX IF EXISTS webtv.idx_transcripts_entry_id;
DROP INDEX IF EXISTS webtv.idx_usage_created_at;

-- ── 3. NOT NULL where data is already 100% non-null ─────────────────────────
ALTER TABLE webtv.transcripts ALTER COLUMN language_code SET NOT NULL;
ALTER TABLE webtv.videos
  ALTER COLUMN clean_title    SET NOT NULL,
  ALTER COLUMN scheduled_time SET NOT NULL,
  ALTER COLUMN duration       SET NOT NULL,
  ALTER COLUMN category       SET NOT NULL;

-- ── 4. Partial index for the per-email magic-link cooldown check ────────────
CREATE INDEX IF NOT EXISTS idx_magic_tokens_email_unused
  ON webtv.magic_tokens (email) WHERE used_at IS NULL;

-- ── 5. CHECK constraints on the status enums ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transcripts_transcription_status_check'
  ) THEN
    ALTER TABLE webtv.transcripts
      ADD CONSTRAINT transcripts_transcription_status_check
        CHECK (transcription_status IN (
          'scheduled', 'transcribing', 'identifying_speakers',
          'analyzing_topics', 'completed', 'error'
        ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transcripts_analysis_status_check'
  ) THEN
    ALTER TABLE webtv.transcripts
      ADD CONSTRAINT transcripts_analysis_status_check
        CHECK (analysis_status IN ('none', 'analyzing', 'completed', 'error'));
  END IF;
END $$;

COMMIT;
