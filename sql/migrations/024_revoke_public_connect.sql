-- Migration 024: revoke the default PUBLIC CONNECT privilege on the `webtv`
-- database (shared-instance hardening).
--
-- Context: `un80-dev-pg` is a shared PostgreSQL instance (~15 tenant roles plus
-- a shared admin). By PostgreSQL default, PUBLIC holds CONNECT on every
-- database, so any sibling tenant role can open a connection to `webtv` and
-- read its system catalog — table names, column names, the full role list.
-- Table *data* is already protected by per-table GRANTs (only webtv_app and the
-- database owner can SELECT any webtv.* row), so this closes cross-tenant
-- METADATA enumeration only. It is defense-in-depth, not a data-leak fix.
--
-- No lockout risk: the `webtv` database is owned by `un80devpgadmin80`, and an
-- owner — plus any superuser (e.g. `azuresu`) — retains CONNECT implicitly,
-- independent of the PUBLIC grant. Only `webtv_app` reached the database via the
-- PUBLIC default, so it is granted CONNECT explicitly below.
--
-- APPLY AS: the database owner (`un80devpgadmin80`) or a superuser. Only they
-- can REVOKE ... FROM PUBLIC; the unprivileged `webtv_app` application role
-- (the default DATABASE_URL) CANNOT apply this migration. Idempotent — both
-- statements are no-ops once applied.

REVOKE CONNECT ON DATABASE webtv FROM PUBLIC;
GRANT CONNECT ON DATABASE webtv TO webtv_app;
