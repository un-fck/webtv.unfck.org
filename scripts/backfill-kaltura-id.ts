/**
 * Data backfill for the `kaltura_id` column.
 *
 * Prerequisite: apply the schema migration first —
 *   psql "$DATABASE_URL" -f sql/migrations/001_add_kaltura_id.sql
 *
 * Steps:
 *   1. Backfill `videos.kaltura_id` from `extractKalturaId(asset_id)`.
 *   2. Backfill `transcripts.kaltura_id` by joining to videos via entry_id
 *      (fast path — works whenever transcripts.entry_id == videos.entry_id).
 *   3. Resolve the remaining legacy rows (transcripts keyed by Kaltura's
 *      canonical entry while videos hold the pre-redirect ID) via the
 *      Kaltura API.
 *
 * Idempotent — safe to re-run.
 */
import "../lib/load-env";
import { pool } from "../lib/db";
import { extractKalturaId } from "../lib/kaltura";
import { getKalturaAudioUrl } from "../lib/transcription";

async function main() {
  console.log("Backfilling videos.kaltura_id…");
  const videos = await pool.query(
    `SELECT asset_id FROM webtv.videos WHERE kaltura_id IS NULL`,
  );
  let vCount = 0;
  for (const row of videos.rows) {
    const kid = extractKalturaId(row.asset_id as string);
    if (!kid) continue;
    await pool.query(
      `UPDATE webtv.videos SET kaltura_id = $1 WHERE asset_id = $2`,
      [kid, row.asset_id],
    );
    vCount++;
  }
  console.log(`  ✓ updated ${vCount} videos`);

  console.log("Backfilling transcripts.kaltura_id via entry_id join…");
  const r = await pool.query(
    `UPDATE webtv.transcripts t
        SET kaltura_id = v.kaltura_id
       FROM webtv.videos v
      WHERE t.kaltura_id IS NULL
        AND v.kaltura_id IS NOT NULL
        AND t.entry_id = v.entry_id`,
  );
  console.log(`  ✓ updated ${r.rowCount ?? 0} transcripts`);

  // Second pass: legacy mismatch. Transcripts keyed by Kaltura's canonical
  // entry while `videos.entry_id` still holds the pre-redirect ID. We don't
  // know the mapping locally, so resolve candidate videos via Kaltura until
  // every orphan transcript has been mapped.
  const orphansResult = await pool.query(
    `SELECT DISTINCT t.entry_id
       FROM webtv.transcripts t
       LEFT JOIN webtv.videos v ON v.entry_id = t.entry_id
      WHERE t.kaltura_id IS NULL AND v.entry_id IS NULL`,
  );
  const orphanEntries = new Set<string>(
    orphansResult.rows.map((r) => r.entry_id as string),
  );
  console.log(
    `${orphanEntries.size} orphan transcript entries to resolve via Kaltura…`,
  );
  if (orphanEntries.size > 0) {
    // Restrict to videos that don't already have a transcript matching by
    // entry_id — those are the ones whose pre-redirect Kaltura ID might map
    // to an orphan entry.
    const candidateVideos = await pool.query(
      `SELECT v.kaltura_id
         FROM webtv.videos v
        WHERE v.kaltura_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM webtv.transcripts t
             WHERE t.status = 'completed'
               AND (t.entry_id = v.entry_id OR t.kaltura_id = v.kaltura_id)
          )
        ORDER BY v.date DESC`,
    );
    let resolved = 0;
    let calls = 0;
    for (const v of candidateVideos.rows) {
      if (orphanEntries.size === 0) break;
      const kid = v.kaltura_id as string;
      calls++;
      try {
        const { entryId } = await getKalturaAudioUrl(kid, "english");
        if (orphanEntries.has(entryId)) {
          const u = await pool.query(
            `UPDATE webtv.transcripts SET kaltura_id = $1 WHERE entry_id = $2 AND kaltura_id IS NULL`,
            [kid, entryId],
          );
          if ((u.rowCount ?? 0) > 0) {
            resolved += u.rowCount ?? 0;
            orphanEntries.delete(entryId);
            console.log(
              `  ✓ ${kid} → ${entryId} (${u.rowCount} rows, ${orphanEntries.size} orphans left)`,
            );
          }
        }
      } catch (err) {
        console.warn(
          `  ✗ Failed to resolve ${kid}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    console.log(
      `  ✓ resolved ${resolved} legacy transcripts (${calls} Kaltura calls)`,
    );
  }

  const remaining = await pool.query(
    `SELECT COUNT(*) AS n FROM webtv.transcripts WHERE kaltura_id IS NULL`,
  );
  console.log(
    `  ${remaining.rows[0].n} transcripts still have NULL kaltura_id`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
