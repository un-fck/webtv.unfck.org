-- Migration 016: add the FK that completes the canonical pivot from migration 015.
--
-- After migration 015 made `transcripts.kaltura_id NOT NULL` and the orphan
-- cleanup deleted every transcript with no matching video, the
-- `transcripts.kaltura_id → videos(kaltura_id)` constraint is finally feasible.
--
-- ON DELETE CASCADE mirrors migration 014's other FKs ("parent gone → child
-- meaningless"). In practice no code hard-deletes from webtv.videos (soft
-- delete via `removed_at` is the pattern), so the CASCADE is defensive.
--
-- The manual application-level cascade in lib/db.ts was already removed in
-- migration 014 (the comment above `deleteTranscriptsForEntry` notes that
-- `speaker_mappings` and `processing_usage_events` cascade via their FKs).
-- No app-code changes needed here.
--
-- Apply once:
--   psql "$DATABASE_URL" -f sql/migrations/016_transcripts_kaltura_fk.sql

SET search_path = webtv, public;

BEGIN;

-- Final safety check: any transcript with no matching video would block the
-- ADD CONSTRAINT. Should be zero after the migration-015 cleanup.
DO $$
DECLARE orphans bigint;
BEGIN
  SELECT COUNT(*) INTO orphans
    FROM webtv.transcripts t
   WHERE NOT EXISTS (
     SELECT 1 FROM webtv.videos v WHERE v.kaltura_id = t.kaltura_id
   );
  IF orphans > 0 THEN
    RAISE EXCEPTION
      '% transcript(s) have no matching video by kaltura_id; resolve before adding the FK',
      orphans;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'transcripts_kaltura_id_fkey'
       AND conrelid = 'webtv.transcripts'::regclass
  ) THEN
    ALTER TABLE webtv.transcripts
      ADD CONSTRAINT transcripts_kaltura_id_fkey
        FOREIGN KEY (kaltura_id) REFERENCES webtv.videos(kaltura_id)
        ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
