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
    -- UNIQUE so video_subscriptions.kaltura_id can FK to it (migration 014).
    -- NOT NULL since migration 015: kaltura_id is the canonical pivot for the
    -- transcripts↔videos join (always derivable from asset_id).
    kaltura_id TEXT UNIQUE NOT NULL,
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
    -- Set when the underlying Kaltura entry reports status 3 (DELETED); such
    -- rows are hidden from listings (see migration 006_removed_videos.sql).
    removed_at TIMESTAMPTZ,
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
-- (kaltura_id is covered by the UNIQUE constraint's underlying index.)
CREATE INDEX IF NOT EXISTS idx_videos_date ON videos(date);
CREATE INDEX IF NOT EXISTS idx_videos_last_seen ON videos(last_seen);
CREATE INDEX IF NOT EXISTS idx_videos_body ON videos(body);
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
CREATE INDEX IF NOT EXISTS idx_videos_fts ON videos USING GIN(fts_vec);
CREATE INDEX IF NOT EXISTS idx_videos_removed_at ON videos(removed_at) WHERE removed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_videos_trgm ON videos USING GIN (COALESCE(clean_title, title) gin_trgm_ops);
-- ── auth (see migrations 002 + 011) ──────────────────────────────────────────
-- `users` is referenced by transcripts.created_by below, so it must be created
-- before that table. Magic-link tokens back the passwordless login flow.
-- `experimental_access` (migration 011) is a single boolean that gates ALL
-- experimental features (proposition analysis, speaker directory); toggled
-- directly in psql, no in-app UI. `allowed_domains` is no longer enforced
-- (open registration) but kept for reference; see lib/auth/commands.ts.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    experimental_access BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS magic_tokens (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_magic_tokens_expires ON magic_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_magic_tokens_cleanup ON magic_tokens (expires_at) WHERE used_at IS NULL;
CREATE TABLE IF NOT EXISTS allowed_domains (
    entity TEXT NOT NULL,
    domain TEXT NOT NULL,
    PRIMARY KEY (entity, domain)
);
COMMENT ON TABLE allowed_domains IS 'Allowed email domains for login. Entity ''*'' means allowed globally.';
-- ── transcripts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transcripts (
    entry_id TEXT NOT NULL,
    -- NOT NULL since migration 015 and FK to videos.kaltura_id since migration
    -- 016: canonical pivot for the transcripts↔videos join
    -- (v.kaltura_id = t.kaltura_id). entry_id stays for intra-table primary
    -- lookups but is never used for cross-table joins.
    kaltura_id TEXT NOT NULL REFERENCES videos(kaltura_id) ON DELETE CASCADE,
    transcript_id TEXT NOT NULL PRIMARY KEY,
    start_time DOUBLE PRECISION,
    end_time DOUBLE PRECISION,
    audio_url TEXT NOT NULL,
    -- Two status axes (migration 003). Splitting them lets on-demand
    -- proposition analysis run without flipping the transcript off "completed"
    -- (which would hide it from viewers keyed off transcription_status).
    transcription_status TEXT NOT NULL,
    analysis_status TEXT NOT NULL DEFAULT 'none',
    language_code TEXT,
    content JSONB NOT NULL DEFAULT '{}',
    pipeline_lock TIMESTAMPTZ,
    error_message TEXT,
    -- Audio length we transcribed, frozen at transcription time (migration 008).
    -- Baseline for detecting WebTV re-cuts; videos.duration is overwritten on sync.
    source_duration_ms INTEGER,
    -- Constant shift to ADD to stored timestamps to realign to the current audio
    -- (negative when content was trimmed from the front). NULL = no shift.
    time_offset_ms INTEGER,
    -- Audio duration (ms) the realignment was last evaluated against (migration
    -- 009). Re-align fires when the live duration drops below this; set to the
    -- current duration after each (re)align so a row self-quiesces. Set with
    -- time_offset_ms NULL = checked but not a clean front-shift (needs reprocess).
    aligned_duration_ms INTEGER,
    -- User who initiated this transcript (migration 012). Tracking only; daily
    -- limits are counter-based. NULL for script-initiated runs (pnpm retranscribe).
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transcripts_entry_id ON transcripts(entry_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_entry_lang ON transcripts(entry_id, language_code);
CREATE INDEX IF NOT EXISTS idx_transcripts_kaltura_lang ON transcripts(kaltura_id, language_code);
-- Covering index — lets getAllTranscriptedEntries scan only the index (no table rows)
CREATE INDEX IF NOT EXISTS idx_transcripts_status_entry ON transcripts(transcription_status, entry_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_status_kaltura ON transcripts(transcription_status, kaltura_id);
CREATE INDEX IF NOT EXISTS transcripts_created_by_idx ON transcripts(created_by);
-- ── speaker_mappings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS speaker_mappings (
    transcript_id TEXT PRIMARY KEY REFERENCES transcripts(transcript_id) ON DELETE CASCADE,
    mapping JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- ── processing_usage_events ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS processing_usage_events (
    id SERIAL PRIMARY KEY,
    transcript_id TEXT NOT NULL REFERENCES transcripts(transcript_id) ON DELETE CASCADE,
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
-- ── subscriptions (see migration 004) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feeds (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    match_categories TEXT[],
    match_title_ilike TEXT,
    match_event_type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE feeds IS 'Curated transcript feeds, managed via SQL. Enabled feeds auto-transcribe newly-discovered matching videos.';
CREATE TABLE IF NOT EXISTS feed_subscriptions (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feed_key TEXT NOT NULL REFERENCES feeds(key) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, feed_key)
);
CREATE INDEX IF NOT EXISTS idx_feed_subscriptions_feed ON feed_subscriptions (feed_key);
CREATE TABLE IF NOT EXISTS video_subscriptions (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kaltura_id TEXT NOT NULL REFERENCES videos(kaltura_id) ON DELETE CASCADE,
    language TEXT NOT NULL DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, kaltura_id, language)
);
CREATE INDEX IF NOT EXISTS idx_video_subscriptions_kaltura ON video_subscriptions (kaltura_id);
CREATE TABLE IF NOT EXISTS sent_transcript_notifications (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transcript_id TEXT NOT NULL REFERENCES transcripts(transcript_id) ON DELETE CASCADE,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, transcript_id)
);

-- ── rate limiting (see migration 010) ─────────────────────────────────────────
-- Shared fixed-window counter — backs per-user daily and global daily caps on
-- transcript starts. Identifier is `user:<uuid>` for per-user buckets and
-- `__global__` for the global ceiling.
CREATE TABLE IF NOT EXISTS rate_limits (
    bucket       TEXT        NOT NULL,
    identifier   TEXT        NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count        INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, identifier, window_start)
);
CREATE INDEX IF NOT EXISTS rate_limits_window_start_idx ON rate_limits (window_start);
