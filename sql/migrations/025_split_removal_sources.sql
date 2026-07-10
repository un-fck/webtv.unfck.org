-- 025_split_removal_sources.sql
-- Split the single `removed_at` flag into two independent, per-source columns
-- so WebTV-unpublish and Kaltura-delete can be tracked (and cleared) without
-- racing each other.
--
-- Background: `removed_at` (migration 006) was written solely by the Kaltura
-- reaper — it flips a row removed when the Kaltura entry reports status 3
-- (DELETED). We now also want to hide a video when its WebTV *asset page* 404s
-- (unpublished), even while its Kaltura entry stays READY. If both signals wrote
-- one shared column, the Kaltura reaper's "entry is READY → clear removed_at"
-- step would keep un-hiding videos the WebTV detector had just hidden (the exact
-- WebTV-404-but-Kaltura-READY case we care about).
--
-- Fix: one nullable timestamp per source. `removed_at` becomes a GENERATED
-- column = LEAST(the two), so every existing `removed_at IS NULL` check keeps
-- working unchanged, and each detector only ever touches its own column.
-- LEAST() ignores NULLs (returns the non-null one; NULL only when both are NULL),
-- which is exactly "removed if either source fired, at the earlier time".
--
-- Apply: psql "$DATABASE_URL" -f sql/migrations/025_split_removal_sources.sql

BEGIN;

SET search_path = webtv, public;

ALTER TABLE webtv.videos
  ADD COLUMN IF NOT EXISTS kaltura_deleted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webtv_unpublished_at TIMESTAMPTZ;

-- Every removal to date was Kaltura-sourced (the only reaper so far).
UPDATE webtv.videos
   SET kaltura_deleted_at = removed_at
 WHERE removed_at IS NOT NULL;

-- Replace the plain column with a derived one. Drop the dependent partial index
-- first, then recreate it against the generated column.
DROP INDEX IF EXISTS webtv.idx_videos_removed_at;

ALTER TABLE webtv.videos
  DROP COLUMN removed_at;

ALTER TABLE webtv.videos
  ADD COLUMN removed_at TIMESTAMPTZ
  GENERATED ALWAYS AS (LEAST(kaltura_deleted_at, webtv_unpublished_at)) STORED;

CREATE INDEX IF NOT EXISTS idx_videos_removed_at
  ON webtv.videos(removed_at)
  WHERE removed_at IS NOT NULL;

COMMIT;
