-- Migration 001: add `kaltura_id` to videos and transcripts.
--
-- `kaltura_id` is the stable pre-redirect Kaltura player ID (e.g. `1_1ciclmz4`),
-- derived from the asset_id. Storing it lets us cache-check transcripts and
-- resolve the "has transcript" join without round-tripping the Kaltura API
-- (transcripts were keyed by the resolved/canonical entry, which can differ
-- from the pre-redirect ID stored on videos.entry_id).
--
-- Apply once to an existing database:
--   psql "$DATABASE_URL" -f sql/migrations/001_add_kaltura_id.sql
--
-- Then run the data backfill:
--   tsx scripts/backfill-kaltura-id.ts
--
-- Idempotent — safe to re-run.
SET search_path = webtv, public;

ALTER TABLE webtv.videos ADD COLUMN IF NOT EXISTS kaltura_id TEXT;
ALTER TABLE webtv.transcripts ADD COLUMN IF NOT EXISTS kaltura_id TEXT;

CREATE INDEX IF NOT EXISTS idx_videos_kaltura_id ON webtv.videos(kaltura_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_kaltura_lang ON webtv.transcripts(kaltura_id, language_code);
CREATE INDEX IF NOT EXISTS idx_transcripts_status_kaltura ON webtv.transcripts(status, kaltura_id);
