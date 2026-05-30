-- Migration 017: drop vendor prefixes from processing_usage_events.operation.
--
-- The vendor lives in `provider` and the model in `model`. Baking the vendor
-- into `operation` (e.g. "openai_define_topics", "gemini_transcribe") was
-- redundant and stopped being accurate once provider selection became fully
-- dynamic via STT_ROUTING. Going forward the code emits vendor-neutral
-- stage-action labels (see lib/usage-tracking.ts:UsageOperations); this
-- migration normalizes existing rows to match.
--
-- Mapping:
--   openai_initial_speaker_mapping → initial_speaker_mapping
--   openai_normalize_speakers      → normalize_speakers      (dead path, kept for history)
--   openai_resegment_paragraph     → resegment_paragraph
--   openai_define_topics           → define_topics
--   openai_tag_sentence_topics     → tag_sentence_topics
--   openai_analyze_propositions    → analyze_propositions
--   gemini_transcribe              → transcribe
--   gemini_pv_alignment            → pv_alignment
--   assembly_submit_transcription  → transcribe_submit       (dead path, kept for history)
--   assembly_poll_transcription    → transcribe_poll         (dead path, kept for history)
--   assembly_fetch_paragraphs      → transcribe_fetch        (dead path, kept for history)
--
-- The `assembly_*` rows are from a retired codepath and no current code emits
-- them; they're renamed for consistency so dashboards don't need to special-case
-- old vendor prefixes.
--
-- Apply once:
--   psql "$DATABASE_URL" -f sql/migrations/017_normalize_usage_operation_names.sql

SET search_path = webtv, public;

BEGIN;

UPDATE webtv.processing_usage_events
   SET operation = CASE operation
     WHEN 'openai_initial_speaker_mapping' THEN 'initial_speaker_mapping'
     WHEN 'openai_normalize_speakers'      THEN 'normalize_speakers'
     WHEN 'openai_resegment_paragraph'     THEN 'resegment_paragraph'
     WHEN 'openai_define_topics'           THEN 'define_topics'
     WHEN 'openai_tag_sentence_topics'     THEN 'tag_sentence_topics'
     WHEN 'openai_analyze_propositions'    THEN 'analyze_propositions'
     WHEN 'gemini_transcribe'              THEN 'transcribe'
     WHEN 'gemini_pv_alignment'            THEN 'pv_alignment'
     WHEN 'assembly_submit_transcription'  THEN 'transcribe_submit'
     WHEN 'assembly_poll_transcription'    THEN 'transcribe_poll'
     WHEN 'assembly_fetch_paragraphs'      THEN 'transcribe_fetch'
   END
 WHERE operation IN (
   'openai_initial_speaker_mapping',
   'openai_normalize_speakers',
   'openai_resegment_paragraph',
   'openai_define_topics',
   'openai_tag_sentence_topics',
   'openai_analyze_propositions',
   'gemini_transcribe',
   'gemini_pv_alignment',
   'assembly_submit_transcription',
   'assembly_poll_transcription',
   'assembly_fetch_paragraphs'
 );

COMMIT;
