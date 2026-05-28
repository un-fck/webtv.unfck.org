-- Migration 011: single experimental-access flag per user.
--
-- All experimental features (proposition analysis, speaker directory) are
-- gated by this one boolean. No per-feature distinction, no in-app
-- request/approval flow, no admin role. The flag is toggled directly by
-- whoever has DB access:
--
--   UPDATE webtv.users SET experimental_access = TRUE WHERE email = '<email>';
--
-- Users are pointed to a contact note on the About page to request access.
--
-- Apply once:
--   psql "$DATABASE_URL" -f sql/migrations/011_experimental_access.sql
--
-- Idempotent — safe to re-run.

ALTER TABLE webtv.users
  ADD COLUMN IF NOT EXISTS experimental_access BOOLEAN NOT NULL DEFAULT FALSE;
