-- Migration 021: experimental-features wait list.
--
-- Replaces the "contact the maintainers" note on the About page with an
-- in-app wait-list button. Joining records a timestamp on the user row;
-- NULL means not on the list. A timestamp (rather than a boolean) doubles
-- as join order, so access can be granted oldest-first:
--
--   SELECT email FROM webtv.users
--   WHERE experimental_waitlist_at IS NOT NULL AND NOT experimental_access
--   ORDER BY experimental_waitlist_at;
--
-- Granting access stays manual (single flag from migration 011):
--
--   UPDATE webtv.users SET experimental_access = TRUE WHERE email = '<email>';
--
-- The wait-list timestamp is deliberately NOT cleared when access is
-- granted — it remains as a record of when the user asked.
--
-- Apply once per database:
--   psql "$DATABASE_URL" -f sql/migrations/021_experimental_waitlist.sql
--
-- Idempotent — safe to re-run.

ALTER TABLE webtv.users
  ADD COLUMN IF NOT EXISTS experimental_waitlist_at TIMESTAMPTZ;
