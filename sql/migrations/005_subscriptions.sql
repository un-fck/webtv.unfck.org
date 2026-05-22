-- Migration 005: transcript subscriptions + curated feeds.
--
-- Lets logged-in users be emailed when a transcript becomes available:
--   (A) per-video subscriptions  -> `video_subscriptions`
--   (B) curated standing feeds   -> `feeds` + `feed_subscriptions`
-- A `sent_transcript_notifications` ledger dedupes emails.
--
-- Feeds are managed centrally via SQL only. An *enabled* feed auto-transcribes
-- newly-discovered matching videos (cost lever = the enabled-feed list);
-- subscribers only decide who gets emailed.
--
-- Apply once to an existing database:
--   psql "$DATABASE_URL" -f sql/migrations/005_subscriptions.sql
--
-- Idempotent — safe to re-run.
SET search_path = webtv, public;

-- Curated feeds. A video matches a feed when *all* non-null criteria match:
--   category ∈ match_categories, title ILIKE %match_title_ilike%,
--   event_type = match_event_type.
CREATE TABLE IF NOT EXISTS webtv.feeds (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  match_categories TEXT[],
  match_title_ilike TEXT,
  match_event_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE webtv.feeds IS 'Curated transcript feeds, managed via SQL. Enabled feeds auto-transcribe newly-discovered matching videos.';

-- Seed feeds (edit/extend via SQL). Disabled by default-ish? No: enabled so the
-- team can subscribe immediately; refine match columns as needed.
INSERT INTO webtv.feeds (key, label, description, match_title_ilike) VALUES
  ('press-conferences', 'Press conferences', 'Press conferences and briefings.', 'press conference'),
  ('un80', 'UN80', 'Meetings related to the UN80 initiative.', 'un80')
ON CONFLICT (key) DO NOTHING;

-- Standing feed subscriptions (scenario B).
CREATE TABLE IF NOT EXISTS webtv.feed_subscriptions (
  user_id UUID NOT NULL,
  feed_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, feed_key)
);

CREATE INDEX IF NOT EXISTS idx_feed_subscriptions_feed ON webtv.feed_subscriptions (feed_key);

-- Per-video subscriptions (scenario A). Keyed by kaltura_id + language to match
-- scheduleTranscript / getActiveTranscriptByKalturaId conventions.
CREATE TABLE IF NOT EXISTS webtv.video_subscriptions (
  user_id UUID NOT NULL,
  kaltura_id TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, kaltura_id, language)
);

CREATE INDEX IF NOT EXISTS idx_video_subscriptions_kaltura ON webtv.video_subscriptions (kaltura_id);

-- Dedupe ledger: one row per (user, transcript) once emailed.
CREATE TABLE IF NOT EXISTS webtv.sent_transcript_notifications (
  user_id UUID NOT NULL,
  transcript_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, transcript_id)
);
