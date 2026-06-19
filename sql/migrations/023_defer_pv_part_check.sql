-- Make `videos_pv_part_iff_symbol` DEFERRABLE INITIALLY DEFERRED so the
-- two-step "INSERT then assignPvPartsForCluster" sequence used by
-- `saveVideo` and the pv-symbol backfill works.
--
-- Without this, Postgres evaluates the CHECK at the end of the INSERT/UPDATE
-- statement, which fails the moment pv_symbol is set but pv_part hasn't been
-- assigned yet — even though the very next statement in the same transaction
-- would have filled pv_part in. Deferred-until-commit semantics make the
-- constraint enforce the *final* state of the transaction, which is what we
-- actually care about.

BEGIN;

ALTER TABLE webtv.videos
    DROP CONSTRAINT videos_pv_part_iff_symbol;

ALTER TABLE webtv.videos
    ADD CONSTRAINT videos_pv_part_iff_symbol
    CHECK ((pv_symbol IS NULL AND pv_part IS NULL)
        OR (pv_symbol IS NOT NULL AND pv_part IS NOT NULL))
    DEFERRABLE INITIALLY DEFERRED;

COMMIT;
