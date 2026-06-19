-- Replace the cached `slug` and the title-parsed `part_number` columns with a
-- single `pv_part smallint` derived from chronological order within a
-- pv_symbol cluster.
--
-- Background: `slug` was frozen on first INSERT, so 73 rows ended up stuck on
-- their `meeting/<asset_id>` fallback even after their pv_symbol got filled in
-- by a later sync. `part_number` came from fragile title regex (catches
-- "(Part N)" / "(Resumed)" but not "(Continued)") and disagreed with chrono
-- order in 21/55 multi-row cluster cases. URLs are now derived purely at read
-- time from (pv_symbol, pv_part) for citation form and asset_id for permalink.
--
-- After this migration, route resolvers query by (pv_symbol, pv_part) for
-- /sc/N[/P], /ga/..., etc., and by asset_id for /asset/{asset_id...}. No URL
-- backwards compatibility for /meeting/... — user has explicitly accepted
-- 404s on legacy external links to those.

BEGIN;

ALTER TABLE webtv.videos
    ADD COLUMN pv_part smallint;

-- Backfill: assign 1..N within each pv_symbol cluster by chronological order,
-- breaking ties on created_at then asset_id so the assignment is deterministic.
WITH ordered AS (
    SELECT
        asset_id,
        ROW_NUMBER() OVER (
            PARTITION BY pv_symbol
            ORDER BY scheduled_time NULLS LAST, created_at, asset_id
        ) AS n
    FROM webtv.videos
    WHERE pv_symbol IS NOT NULL
)
UPDATE webtv.videos v
   SET pv_part = o.n
  FROM ordered o
 WHERE v.asset_id = o.asset_id;

-- pv_part is populated iff pv_symbol is. Use IS NOT DISTINCT FROM so that the
-- equality works on both columns being NULL.
ALTER TABLE webtv.videos
    ADD CONSTRAINT videos_pv_part_iff_symbol
    CHECK ((pv_symbol IS NULL AND pv_part IS NULL)
        OR (pv_symbol IS NOT NULL AND pv_part IS NOT NULL));

-- Unique (pv_symbol, pv_part) within the symbol-having subset, so the citation
-- URL is unambiguous.
CREATE UNIQUE INDEX videos_pv_symbol_part_uniq
    ON webtv.videos (pv_symbol, pv_part)
    WHERE pv_symbol IS NOT NULL;

-- Drop the cached slug column and the title-parsed part_number.
DROP INDEX IF EXISTS webtv.idx_videos_slug;
ALTER TABLE webtv.videos
    DROP COLUMN slug,
    DROP COLUMN part_number;

COMMIT;
