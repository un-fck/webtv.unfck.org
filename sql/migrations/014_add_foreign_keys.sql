-- Migration 014: add foreign-key constraints across the schema.
--
-- The schema historically had no FK constraints; referential integrity was
-- enforced in app code. That's left two latent problems:
--   * `deleteTranscript()` / `deleteTranscriptsForEntry()` cascade to
--     `processing_usage_events` but never to `speaker_mappings`, leaking one
--     orphan row per retranscribe. Audit found 34 orphans there.
--   * `processing_usage_events` has 739 historical orphans (older data, manual
--     direct deletes, etc.).
--
-- Adding FKs with ON DELETE CASCADE fixes the leak going forward AND lets us
-- drop the manual cascade code in `lib/db.ts` (the wrapping `withTransaction`
-- and the explicit usage-events DELETE), since a single
-- `DELETE FROM transcripts` will cascade automatically.
--
-- Steps in order (single transaction so partial failure rolls back):
--   1. Delete orphan rows whose parents don't exist (otherwise ADD CONSTRAINT
--      fails). These are unreachable from the app (every read joins through
--      the missing parent), so deleting changes no observable behavior.
--   2. Add UNIQUE on videos.kaltura_id (prerequisite for the
--      video_subscriptions FK), and drop the now-redundant plain index that
--      the UNIQUE constraint's underlying index supersedes.
--   3. Add the FK constraints. All ON DELETE CASCADE because in every case
--      "parent gone → child meaningless."
--
-- Apply once:
--   psql "$DATABASE_URL" -f sql/migrations/014_add_foreign_keys.sql
--
-- Idempotent — safe to re-run (orphan deletes are no-ops once clean; FK adds
-- use IF NOT EXISTS via constraint-existence checks).

SET search_path = webtv, public;

BEGIN;

-- ── 1. Orphan cleanup ────────────────────────────────────────────────────────
DELETE FROM webtv.speaker_mappings
 WHERE NOT EXISTS (
   SELECT 1 FROM webtv.transcripts t
    WHERE t.transcript_id = speaker_mappings.transcript_id
 );

DELETE FROM webtv.processing_usage_events
 WHERE NOT EXISTS (
   SELECT 1 FROM webtv.transcripts t
    WHERE t.transcript_id = processing_usage_events.transcript_id
 );

-- ── 2. UNIQUE on videos.kaltura_id + drop redundant index ───────────────────
-- Required for video_subscriptions.kaltura_id FK. The audit confirmed zero
-- duplicates. The UNIQUE constraint builds its own underlying unique index,
-- which fully replaces idx_videos_kaltura_id for query planning.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'videos_kaltura_id_key' AND conrelid = 'webtv.videos'::regclass
  ) THEN
    ALTER TABLE webtv.videos ADD CONSTRAINT videos_kaltura_id_key UNIQUE (kaltura_id);
  END IF;
END $$;

DROP INDEX IF EXISTS webtv.idx_videos_kaltura_id;

-- ── 3. Foreign keys (all ON DELETE CASCADE) ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feed_subscriptions_user_id_fkey') THEN
    ALTER TABLE webtv.feed_subscriptions
      ADD CONSTRAINT feed_subscriptions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES webtv.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feed_subscriptions_feed_key_fkey') THEN
    ALTER TABLE webtv.feed_subscriptions
      ADD CONSTRAINT feed_subscriptions_feed_key_fkey
        FOREIGN KEY (feed_key) REFERENCES webtv.feeds(key) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'video_subscriptions_user_id_fkey') THEN
    ALTER TABLE webtv.video_subscriptions
      ADD CONSTRAINT video_subscriptions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES webtv.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'video_subscriptions_kaltura_id_fkey') THEN
    ALTER TABLE webtv.video_subscriptions
      ADD CONSTRAINT video_subscriptions_kaltura_id_fkey
        FOREIGN KEY (kaltura_id) REFERENCES webtv.videos(kaltura_id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sent_transcript_notifications_user_id_fkey') THEN
    ALTER TABLE webtv.sent_transcript_notifications
      ADD CONSTRAINT sent_transcript_notifications_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES webtv.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sent_transcript_notifications_transcript_id_fkey') THEN
    ALTER TABLE webtv.sent_transcript_notifications
      ADD CONSTRAINT sent_transcript_notifications_transcript_id_fkey
        FOREIGN KEY (transcript_id) REFERENCES webtv.transcripts(transcript_id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'speaker_mappings_transcript_id_fkey') THEN
    ALTER TABLE webtv.speaker_mappings
      ADD CONSTRAINT speaker_mappings_transcript_id_fkey
        FOREIGN KEY (transcript_id) REFERENCES webtv.transcripts(transcript_id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'processing_usage_events_transcript_id_fkey') THEN
    ALTER TABLE webtv.processing_usage_events
      ADD CONSTRAINT processing_usage_events_transcript_id_fkey
        FOREIGN KEY (transcript_id) REFERENCES webtv.transcripts(transcript_id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
