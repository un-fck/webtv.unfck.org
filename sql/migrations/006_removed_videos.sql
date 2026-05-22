-- 006_removed_videos.sql
-- Track videos whose underlying Kaltura entry has been deleted (status 3).
-- The UN regularly publishes then removes ephemeral entries (e.g. media
-- stakeout live streams). Once the Kaltura entry is DELETED the player only
-- shows "Media unavailable / Video has been removed", so we soft-disable the
-- row: hide it from schedule/search while keeping the metadata (and any
-- transcript we already produced) intact and the permalink resolvable.
--
-- Apply: psql "$DATABASE_URL" -f sql/migrations/006_removed_videos.sql

SET search_path = webtv, public;

ALTER TABLE webtv.videos
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

-- Partial index: listing queries filter on `removed_at IS NULL`, and the reaper
-- scans the (small) set of already-removed rows to un-flag false positives.
CREATE INDEX IF NOT EXISTS idx_videos_removed_at
  ON webtv.videos(removed_at)
  WHERE removed_at IS NOT NULL;
