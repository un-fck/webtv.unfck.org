-- Migration 007: replace the "press-conferences" feed with "daily-press-briefing".
--
-- The original press-conferences feed matched any title containing "press
-- conference"; we instead want the Spokesperson's Daily Press Briefing,
-- matched on titles containing "daily press briefing".
--
-- Drops the old feed (and any subscriptions to it, since there are no FK
-- constraints) and seeds the new one. A fresh DB applies 005 (which seeds
-- press-conferences) then this, ending in the correct state.
--
-- Apply once per database:
--   psql "$DATABASE_URL" -f sql/migrations/007_daily_press_briefing_feed.sql
--
-- Idempotent — safe to re-run.
SET search_path = webtv, public;

DELETE FROM webtv.feed_subscriptions WHERE feed_key = 'press-conferences';
DELETE FROM webtv.feeds WHERE key = 'press-conferences';

INSERT INTO webtv.feeds (key, label, description, match_title_ilike) VALUES
  ('daily-press-briefing', 'Daily Press Briefing',
   'The Spokesperson''s daily press briefing.', 'daily press briefing')
ON CONFLICT (key) DO NOTHING;
