-- ── application role ─────────────────────────────────────────────────────────
-- openssl rand -base64 32 | tr -d '/+=' | head -c 40
-- Run this block as an admin/superuser. Change the password before applying.
DO $$ BEGIN IF NOT EXISTS (
    SELECT
    FROM pg_roles
    WHERE rolname = 'webtv_app'
) THEN CREATE ROLE webtv_app LOGIN PASSWORD 'CHANGE-ME';
END IF;
END $$;
-- Schema-level: let the app resolve objects in webtv
GRANT USAGE ON SCHEMA webtv TO webtv_app;
-- Table-level: full DML + DDL on all current and future tables in webtv
ALTER DEFAULT PRIVILEGES IN SCHEMA webtv
GRANT SELECT,
    INSERT,
    UPDATE,
    DELETE ON TABLES TO webtv_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA webtv
GRANT USAGE,
    SELECT ON SEQUENCES TO webtv_app;
-- Grant on tables that already exist (idempotent re-run)
GRANT SELECT,
    INSERT,
    UPDATE,
    DELETE ON ALL TABLES IN SCHEMA webtv TO webtv_app;
GRANT USAGE,
    SELECT ON ALL SEQUENCES IN SCHEMA webtv TO webtv_app;
-- Database-level: on the shared instance, revoke the PostgreSQL default that
-- lets EVERY role CONNECT to this database (and read its catalog metadata —
-- table/column/role names). Table data is already protected by the per-table
-- GRANTs above; this closes cross-tenant metadata enumeration. The app role
-- gets CONNECT explicitly; the database owner and superusers keep it
-- implicitly. See migration 024. Idempotent. (Run while connected to the
-- `webtv` database, as its owner or a superuser.)
REVOKE CONNECT ON DATABASE webtv FROM PUBLIC;
GRANT CONNECT ON DATABASE webtv TO webtv_app;