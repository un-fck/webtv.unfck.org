-- Fixed-window rate limiting, backed by Postgres so the counter is shared
-- across all serverless instances (in-memory counters don't work on Vercel —
-- each instance would have its own, defeating the limit).
--
-- One row per (bucket, identifier, window_start). `bucket` namespaces the limit
-- (e.g. "transcribe", "auth-request"); `identifier` is usually the client IP.
-- `window_start` is the start of the fixed window the hit fell into. The app
-- upserts and increments `count` atomically per request and compares it to the
-- per-bucket limit.

CREATE TABLE IF NOT EXISTS webtv.rate_limits (
  bucket       text        NOT NULL,
  identifier   text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, identifier, window_start)
);

-- Supports the periodic cleanup of expired windows.
CREATE INDEX IF NOT EXISTS rate_limits_window_start_idx
  ON webtv.rate_limits (window_start);
