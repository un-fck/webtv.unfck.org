-- Azure PostgreSQL schema for UN Transcripts
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
    clean_title TEXT NOT NULL,
    date DATE NOT NULL,
    scheduled_time TIMESTAMPTZ NOT NULL,
    duration INTEGER NOT NULL,
    url TEXT NOT NULL,
    body TEXT,
    category TEXT NOT NULL,
    event_code TEXT,
    event_type TEXT,
    session_number TEXT,
    pv_symbol TEXT,
    -- Chronological ordinal within a pv_symbol cluster (1..N). Populated iff
    -- pv_symbol is. Derived in saveVideo from (scheduled_time, created_at)
    -- under an advisory lock keyed on the symbol; per-row value is frozen
    -- after first assignment so citation URLs like /sc/10175/2 stay stable
    -- when WebTV later adds another recording to the cluster. See
    -- migration 022.
    pv_part SMALLINT,
    pv_available BOOLEAN,
    pv_checked_at TIMESTAMPTZ,
    -- Independent removal signals, one per source (migration 025):
    --   kaltura_deleted_at   — Kaltura entry reports status 3 (DELETED)
    --   webtv_unpublished_at — WebTV asset page 404s (unpublished)
    -- Each detector only ever touches its own column, so clearing one can't
    -- un-hide a removal the other made. `removed_at` below is derived from both.
    kaltura_deleted_at TIMESTAMPTZ,
    webtv_unpublished_at TIMESTAMPTZ,
    last_seen DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Per-locale variants of title/clean_title/category, harvested from the
    -- ar/zh/fr/ru/es WebTV schedule pages alongside the English canonical
    -- columns (migration 019). Shape: { [locale]: { title, clean_title,
    -- category } }. Missing keys fall back to English at render time.
    i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Derived removal flag: set iff either source column is (migration 025).
    -- LEAST() ignores NULLs, so this is NULL only when both sources are NULL.
    -- Every `removed_at IS NULL` check in the app reads this transparently.
    removed_at TIMESTAMPTZ
        GENERATED ALWAYS AS (LEAST(kaltura_deleted_at, webtv_unpublished_at)) STORED,
    -- Generated column for full-text search (auto-maintained by PG)
    fts_vec tsvector GENERATED ALWAYS AS (
        to_tsvector('english', COALESCE(clean_title, title))
    ) STORED,
    CONSTRAINT videos_pv_part_iff_symbol CHECK (
        (pv_symbol IS NULL AND pv_part IS NULL)
        OR (pv_symbol IS NOT NULL AND pv_part IS NOT NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS videos_pv_symbol_part_uniq
    ON videos (pv_symbol, pv_part) WHERE pv_symbol IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_videos_entry_id ON videos(entry_id);
-- (kaltura_id is covered by the UNIQUE constraint's underlying index.)
CREATE INDEX IF NOT EXISTS idx_videos_date ON videos(date);
CREATE INDEX IF NOT EXISTS idx_videos_last_seen ON videos(last_seen);
CREATE INDEX IF NOT EXISTS idx_videos_body ON videos(body);
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
CREATE INDEX IF NOT EXISTS idx_videos_fts ON videos USING GIN(fts_vec);
CREATE INDEX IF NOT EXISTS idx_videos_removed_at ON videos(removed_at) WHERE removed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_videos_trgm ON videos USING GIN (COALESCE(clean_title, title) gin_trgm_ops);
-- ── auth (see migrations 002 + 011 + 021) ────────────────────────────────────
-- `users` is referenced by transcripts.created_by below, so it must be created
-- before that table. Magic-link tokens back the passwordless login flow.
-- `experimental_access` (migration 011) is a single boolean that gates ALL
-- experimental features (proposition analysis, speaker directory); toggled
-- directly in psql, no in-app UI. `experimental_waitlist_at` (migration 021)
-- records when the user joined the experimental-features wait list via the
-- About page (NULL = not on the list; kept as a record even after access is
-- granted). `allowed_domains` is no longer enforced (open registration) but
-- kept for reference; see lib/auth/commands.ts.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    experimental_access BOOLEAN NOT NULL DEFAULT FALSE,
    experimental_waitlist_at TIMESTAMPTZ,
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
-- Per-email cooldown check (`recentTokenExists`); migration 015.
CREATE INDEX IF NOT EXISTS idx_magic_tokens_email_unused ON magic_tokens (email) WHERE used_at IS NULL;
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
    -- 'interrupted' (migration 020): worker died mid-flight (SIGTERM, OOM,
    -- crash). Distinct from `error` (intrinsic failure) so the picker can
    -- safely auto-retry interrupted rows while leaving genuine errors alone.
    transcription_status TEXT NOT NULL
      CHECK (transcription_status IN (
        'scheduled', 'transcribing', 'identifying_speakers',
        'analyzing_topics', 'completed', 'error', 'interrupted'
      )),
    analysis_status TEXT NOT NULL DEFAULT 'none'
      CHECK (analysis_status IN ('none', 'analyzing', 'completed', 'error', 'interrupted')),
    language_code TEXT NOT NULL,
    content JSONB NOT NULL DEFAULT '{}',
    -- Liveness heartbeat (migration 020, renamed from pipeline_lock). Owning
    -- worker refreshes ~every 60s; the liveness sweep flips rows whose
    -- heartbeat is stale (>5min) to `interrupted`.
    heartbeat_at TIMESTAMPTZ,
    -- Identity of the process currently running this row (migration 020).
    -- Lets the SIGTERM handler scope its "flip my own rows to interrupted"
    -- UPDATE without affecting sibling replicas. NULL when no worker holds it.
    worker_id TEXT,
    -- Times the picker has resumed this row after an interruption (migration
    -- 020). Picker caps at 5 before escalating to `error`. `error` itself is
    -- never auto-retried regardless of this counter.
    retry_count INT NOT NULL DEFAULT 0,
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
-- (entry_id alone is covered by the compound idx_transcripts_entry_lang below.)
CREATE INDEX IF NOT EXISTS idx_transcripts_entry_lang ON transcripts(entry_id, language_code);
CREATE INDEX IF NOT EXISTS idx_transcripts_kaltura_lang ON transcripts(kaltura_id, language_code);
-- Covering index — lets getAllTranscriptedEntries scan only the index (no table rows)
CREATE INDEX IF NOT EXISTS idx_transcripts_status_entry ON transcripts(transcription_status, entry_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_status_kaltura ON transcripts(transcription_status, kaltura_id);
CREATE INDEX IF NOT EXISTS transcripts_created_by_idx ON transcripts(created_by);
-- Partial index for per-worker scans: SIGTERM-time cleanup and the
-- periodic heartbeat tick (migration 020).
CREATE INDEX IF NOT EXISTS idx_transcripts_worker_id ON transcripts(worker_id) WHERE worker_id IS NOT NULL;
-- ── speaker_mappings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS speaker_mappings (
    transcript_id TEXT PRIMARY KEY REFERENCES transcripts(transcript_id) ON DELETE CASCADE,
    mapping JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- ── transcript_statements ─────────────────────────────────────────────────────
-- Statement-level search index (migration 026). One row per ON-RECORD
-- statement of a COMPLETED transcript, populated by
-- reindexTranscriptStatements (lib/db.ts) — statements flagged is_off_record
-- in the speaker mapping are skipped, mirroring lib/off-record.ts, and
-- statement_idx keeps the raw content index.
-- start_ms is RAW; the realignment offset (transcripts.time_offset_ms) is
-- applied at query time, so re-cuts never require reindexing. Word search
-- goes through tsv (per-language regconfig; zh routes to trigram instead);
-- digit-bearing terms ("L.73", "2735") go through trigram containment on
-- text, because document symbols hide inside compound FTS tokens.
CREATE TABLE IF NOT EXISTS transcript_statements (
    transcript_id TEXT NOT NULL REFERENCES transcripts(transcript_id) ON DELETE CASCADE,
    statement_idx INTEGER NOT NULL,
    -- Denormalized from transcripts.language_code: the generated tsvector
    -- must pick its regconfig from the row itself.
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
CREATE INDEX IF NOT EXISTS idx_transcript_statements_tsv ON transcript_statements USING GIN (tsv);
CREATE INDEX IF NOT EXISTS idx_transcript_statements_trgm ON transcript_statements USING GIN (text public.gin_trgm_ops);
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
    language TEXT NOT NULL DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, feed_key, language)
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
