-- Soft-suppress completed transcripts produced by legacy STT models whose
-- output should no longer be served. The transcript content, speaker mapping,
-- statement index, and usage history remain intact for audit/recovery.
--
-- Model attribution prefers the latest successful transcription usage event.
-- Rows predating complete usage telemetry fall back to the historical
-- transcript-id conventions documented in
-- analysis/transcription-models-by-month/artifact.json:
--   * AssemblyAI API UUID / assemblyai-* => Universal-2
--   * gemini-*                           => Gemini transcription
-- Explicit Universal-3/3.5 prefixes are resolved before the broad
-- assemblyai-* fallback so they can never be misclassified.
--
-- Only completed rows are backfilled. Error rows are already invisible, and
-- touching scheduled/interrupted rows could interfere with worker recovery.
--
-- Apply: psql "$DATABASE_URL" -f sql/migrations/027_suppress_legacy_transcripts.sql

BEGIN;

SET search_path = webtv, public;

ALTER TABLE webtv.transcripts
  ADD COLUMN IF NOT EXISTS suppressed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suppression_reason TEXT;

ALTER TABLE webtv.transcripts
  DROP CONSTRAINT IF EXISTS transcripts_suppression_fields_check;

ALTER TABLE webtv.transcripts
  ADD CONSTRAINT transcripts_suppression_fields_check
  CHECK ((suppressed_at IS NULL) = (suppression_reason IS NULL));

CREATE INDEX IF NOT EXISTS idx_transcripts_suppressed_at
  ON webtv.transcripts(suppressed_at)
  WHERE suppressed_at IS NOT NULL;

WITH latest_successful_transcription AS (
  SELECT DISTINCT ON (transcript_id)
         transcript_id,
         provider,
         model
    FROM webtv.processing_usage_events
   WHERE status = 'success'
     AND (
       operation = 'transcribe'
       OR stage IN ('transcription', 'transcribing')
     )
   ORDER BY transcript_id, created_at DESC, id DESC
), attributed AS (
  SELECT t.transcript_id,
         CASE
           -- Explicit successful telemetry is authoritative.
           WHEN u.model IS NOT NULL THEN u.model
           -- Legacy AssemblyAI telemetry omitted the model; that API path did
           -- not send speech_models and therefore used Universal-2.
           WHEN u.provider = 'assemblyai' THEN 'universal-2'
           -- A Gemini transcription usage row is sufficient attribution even
           -- for legacy rows whose model field was not populated.
           WHEN u.provider = 'gemini' THEN 'gemini'
           -- No successful telemetry: use stable historical ID conventions.
           WHEN u.transcript_id IS NULL
             AND t.transcript_id LIKE 'assemblyai-universal-3-5-pro-%'
             THEN 'universal-3-5-pro'
           WHEN u.transcript_id IS NULL
             AND t.transcript_id LIKE 'assemblyai-universal-3-pro-%'
             THEN 'universal-3-pro'
           WHEN u.transcript_id IS NULL
             AND (
               t.transcript_id LIKE 'assemblyai-%'
               OR t.transcript_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             )
             THEN 'universal-2'
           WHEN u.transcript_id IS NULL
             AND t.transcript_id LIKE 'gemini-%'
             THEN 'gemini'
           ELSE NULL
         END AS transcription_model
    FROM webtv.transcripts t
    LEFT JOIN latest_successful_transcription u USING (transcript_id)
   WHERE t.transcription_status = 'completed'
)
UPDATE webtv.transcripts t
   SET suppressed_at = NOW(),
       suppression_reason = CASE a.transcription_model
         WHEN 'universal-2' THEN 'legacy_stt_model:universal-2'
         ELSE 'legacy_stt_model:gemini'
       END
  FROM attributed a
 WHERE a.transcript_id = t.transcript_id
   AND (
     a.transcription_model = 'universal-2'
     OR a.transcription_model LIKE 'gemini%'
   )
   AND t.suppressed_at IS NULL;

COMMIT;
