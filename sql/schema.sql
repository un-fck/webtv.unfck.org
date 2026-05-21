-- Azure PostgreSQL schema for webtv.unfck.org
-- Apply once to provision a new database:
--   psql "$DATABASE_URL" -f sql/schema.sql
--
-- All tables live in the `webtv` schema.
-- Application queries fully qualify table names (e.g. `webtv.videos`).
-- The SET search_path below only affects the DDL session that applies this file.
-- pg_trgm must be created in public (requires superuser, done once per DB)
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;
CREATE SCHEMA IF NOT EXISTS webtv;
SET search_path = webtv, public;
-- ── videos ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS videos (
    asset_id TEXT PRIMARY KEY,
    entry_id TEXT,
    title TEXT NOT NULL,
    clean_title TEXT,
    date DATE NOT NULL,
    scheduled_time TIMESTAMPTZ,
    duration INTEGER,
    url TEXT NOT NULL,
    body TEXT,
    category TEXT,
    event_code TEXT,
    event_type TEXT,
    session_number TEXT,
    part_number TEXT,
    pv_symbol TEXT,
    pv_available BOOLEAN,
    pv_checked_at TIMESTAMPTZ,
    slug TEXT,
    last_seen DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Generated column for full-text search (auto-maintained by PG)
    fts_vec tsvector GENERATED ALWAYS AS (
        to_tsvector('english', COALESCE(clean_title, title))
    ) STORED
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_slug ON videos(slug);
CREATE INDEX IF NOT EXISTS idx_videos_entry_id ON videos(entry_id);
CREATE INDEX IF NOT EXISTS idx_videos_date ON videos(date);
CREATE INDEX IF NOT EXISTS idx_videos_last_seen ON videos(last_seen);
CREATE INDEX IF NOT EXISTS idx_videos_body ON videos(body);
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
CREATE INDEX IF NOT EXISTS idx_videos_fts ON videos USING GIN(fts_vec);
CREATE INDEX IF NOT EXISTS idx_videos_trgm ON videos USING GIN (COALESCE(clean_title, title) gin_trgm_ops);
-- ── transcripts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transcripts (
    entry_id TEXT NOT NULL,
    transcript_id TEXT NOT NULL PRIMARY KEY,
    start_time DOUBLE PRECISION,
    end_time DOUBLE PRECISION,
    audio_url TEXT NOT NULL,
    status TEXT NOT NULL,
    language_code TEXT,
    content JSONB NOT NULL DEFAULT '{}',
    pipeline_lock TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transcripts_entry_id ON transcripts(entry_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_entry_lang ON transcripts(entry_id, language_code);
-- Covering index — lets getAllTranscriptedEntries scan only the index (no table rows)
CREATE INDEX IF NOT EXISTS idx_transcripts_status_entry ON transcripts(status, entry_id);
-- ── speaker_mappings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS speaker_mappings (
    transcript_id TEXT PRIMARY KEY,
    mapping JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- ── processing_usage_events ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS processing_usage_events (
    id SERIAL PRIMARY KEY,
    transcript_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    stage TEXT NOT NULL,
    operation TEXT NOT NULL,
    status TEXT NOT NULL,
    model TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    reasoning_tokens INTEGER,
    cached_input_tokens INTEGER,
    total_tokens INTEGER,
    usage_hours DOUBLE PRECISION,
    usage_seconds INTEGER,
    usage_quantity_type TEXT,
    usage_multiplier DOUBLE PRECISION,
    rate_card_version TEXT,
    base_rate_per_hour_usd DOUBLE PRECISION,
    feature_rate_per_hour_usd DOUBLE PRECISION,
    pricing_meta JSONB,
    duration_ms INTEGER,
    request_meta JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_transcript_id ON processing_usage_events(transcript_id);
CREATE INDEX IF NOT EXISTS idx_usage_provider_stage ON processing_usage_events(provider, stage);
CREATE INDEX IF NOT EXISTS idx_usage_created_at ON processing_usage_events(created_at);
-- ── pv_contents ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pv_contents (
    pv_symbol TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    content JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL,
    parsed_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (pv_symbol, language)
);