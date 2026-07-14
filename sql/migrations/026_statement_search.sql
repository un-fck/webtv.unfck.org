-- Statement-level search index for full-text search inside transcripts.
--
-- One row per ON-RECORD statement of a COMPLETED transcript (populated by
-- `reindexTranscriptStatements` in lib/db.ts). Statements flagged
-- `is_off_record` in the speaker mapping are skipped at index time —
-- the same rule as the serving boundary in lib/off-record.ts — so the index
-- never contains material the transcript page hides; `statement_idx` keeps
-- the raw content index. `start_ms` stores the RAW statement start; the realignment
-- offset (`transcripts.time_offset_ms`) is applied at query time like every
-- other serving path, so a WebTV re-cut never requires reindexing.
--
-- Two search paths over the same rows (see lib/statement-search.ts):
--   * `tsv` (GIN)            — stemmed word search, per-language regconfig.
--     zh gets 'simple' (unsegmented CJK makes FTS useless; Chinese queries
--     route to the trigram path instead).
--   * `text` (GIN trigram)   — substring/regex containment for digit-bearing
--     terms ("L.73", "2735", "S/2026/243"): document symbols live inside
--     compound FTS tokens ('a/80/l.73'), so token-equality search can't find
--     fragments — containment can, and it also survives STT garbling of
--     symbol prefixes ("A/AT/L.73").
--
-- Backfill after applying: `tsx scripts/backfill-statement-search.ts`.

BEGIN;

CREATE TABLE webtv.transcript_statements (
    transcript_id TEXT NOT NULL
        REFERENCES webtv.transcripts (transcript_id) ON DELETE CASCADE,
    statement_idx INTEGER NOT NULL,
    -- Denormalized from transcripts.language_code so the generated tsvector
    -- can pick its regconfig without a join (generated columns must be
    -- immutable expressions over the row).
    language_code TEXT NOT NULL,
    start_ms INTEGER NOT NULL,
    text TEXT NOT NULL,
    tsv tsvector GENERATED ALWAYS AS (
        to_tsvector(
            CASE language_code
                WHEN 'en' THEN 'english'::regconfig
                WHEN 'fr' THEN 'french'::regconfig
                WHEN 'es' THEN 'spanish'::regconfig
                WHEN 'ru' THEN 'russian'::regconfig
                WHEN 'ar' THEN 'arabic'::regconfig
                ELSE 'simple'::regconfig
            END,
            text
        )
    ) STORED,
    PRIMARY KEY (transcript_id, statement_idx)
);

CREATE INDEX idx_transcript_statements_tsv
    ON webtv.transcript_statements USING GIN (tsv);
-- pg_trgm lives in `public` (see schema.sql header); the operator class must
-- be schema-qualified because nothing sets search_path.
CREATE INDEX idx_transcript_statements_trgm
    ON webtv.transcript_statements USING GIN (text public.gin_trgm_ops);

COMMIT;
