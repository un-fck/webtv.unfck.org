-- Migration 018: per-language feed subscriptions.
--
-- Until now `feed_subscriptions` had no language column. The notification
-- cron (`getFeedSubscribers`) was emailing every feed subscriber whenever ANY
-- language of a matching meeting completed, so subscribing to "Security
-- Council" produced one email per completed language instead of one per
-- subscribed language. `video_subscriptions` was already per-language since
-- migration 008 — this brings feed subs in line.
--
-- Existing rows backfill to 'en' (the implicit historical default).

SET search_path TO webtv, public;

ALTER TABLE feed_subscriptions
    ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';

ALTER TABLE feed_subscriptions DROP CONSTRAINT IF EXISTS feed_subscriptions_pkey;
ALTER TABLE feed_subscriptions ADD PRIMARY KEY (user_id, feed_key, language);
