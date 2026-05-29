-- Migration 015: make `kaltura_id` the canonical pivot for the
-- transcripts ↔ videos join.
--
-- Background: the schema carries two ID columns on each side
-- (videos.{entry_id, kaltura_id} and transcripts.{entry_id, kaltura_id})
-- and neither column was guaranteed to match its counterpart, because
-- videos.entry_id sometimes held a stale pre-redirect player ID and
-- transcripts.kaltura_id was nullable on legacy rows. The codebase routed
-- around this with four different join patterns (strict, two-way OR,
-- four-way OR, COALESCE).
--
-- After the data backfill (scripts/backfill-kaltura-ids.ts, extended for
-- this PR with a Phase 0 that populates videos.kaltura_id from
-- extractKalturaId(asset_id), and an orphan audit that removed 30 unreachable
-- legacy transcripts), every row in both tables now has a kaltura_id.
-- This migration enforces the invariant so every cross-table query can
-- collapse to a single canonical join: v.kaltura_id = t.kaltura_id.
--
-- Migration 016 adds the corresponding FK
-- (transcripts.kaltura_id REFERENCES videos.kaltura_id ON DELETE CASCADE).
--
-- Apply once:
--   psql "$DATABASE_URL" -f sql/migrations/015_canonical_kaltura_id_join.sql

SET search_path = webtv, public;

BEGIN;

-- Guard: refuse to run if any row is still null. The backfill script must
-- be run first.
DO $$
DECLARE
  v_nulls bigint;
  t_nulls bigint;
BEGIN
  SELECT COUNT(*) INTO v_nulls FROM webtv.videos      WHERE kaltura_id IS NULL;
  SELECT COUNT(*) INTO t_nulls FROM webtv.transcripts WHERE kaltura_id IS NULL;
  IF v_nulls > 0 OR t_nulls > 0 THEN
    RAISE EXCEPTION
      'kaltura_id still null on % video(s) and % transcript(s); run scripts/backfill-kaltura-ids.ts --apply first',
      v_nulls, t_nulls;
  END IF;
END $$;

ALTER TABLE webtv.videos      ALTER COLUMN kaltura_id SET NOT NULL;
ALTER TABLE webtv.transcripts ALTER COLUMN kaltura_id SET NOT NULL;

COMMIT;
