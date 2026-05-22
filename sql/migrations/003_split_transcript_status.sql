-- Migration 003: split the overloaded `status` column into two axes.
--
-- `status` previously conflated two unrelated lifecycles:
--   * transcript production: scheduled → transcribing → identifying_speakers
--     → analyzing_topics → completed | error
--   * proposition analysis:  analyzing_propositions
--
-- Conflating them meant running on-demand analysis flipped status off
-- 'completed', so an already-finished transcript transiently "disappeared"
-- for other viewers (the viewability lookups key off status = 'completed').
--
-- After this migration:
--   * transcription_status — transcript production lifecycle (no propositions)
--   * analysis_status      — on-demand proposition analysis (none | analyzing
--                            | completed | error), independent of viewability
--
-- Apply once to an existing database:
--   psql "$DATABASE_URL" -f sql/migrations/003_split_transcript_status.sql
--
-- Idempotent — safe to re-run.
SET search_path = webtv, public;

ALTER TABLE webtv.transcripts RENAME COLUMN status TO transcription_status;

ALTER TABLE webtv.transcripts
  ADD COLUMN IF NOT EXISTS analysis_status TEXT NOT NULL DEFAULT 'none';

-- Backfill: transcripts that already carry propositions are analysis-complete.
UPDATE webtv.transcripts
   SET analysis_status = 'completed'
 WHERE jsonb_typeof(content -> 'propositions') = 'array'
   AND jsonb_array_length(content -> 'propositions') > 0;

-- Any row caught mid-proposition-analysis at migration time: the transcript
-- itself is finished, so move it to 'completed' on the production axis.
UPDATE webtv.transcripts
   SET transcription_status = 'completed'
 WHERE transcription_status = 'analyzing_propositions';
