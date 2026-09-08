-- Explicit replacement requests may notify their requester again; ordinary
-- subscriptions are deduplicated across transcript versions using the existing
-- notification ledger. Apply before deploying the accompanying application code.
-- Historical rows intentionally stay false: do not send retrospective requests.
ALTER TABLE webtv.transcripts
    ADD COLUMN IF NOT EXISTS is_retranscription BOOLEAN NOT NULL DEFAULT FALSE;
