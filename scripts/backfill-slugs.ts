/**
 * One-time migration: backfill the `slug` column for all existing videos.
 */
import "../lib/load-env";
import { pool } from "../lib/db";
import { meetingSlugFromVideo } from "../lib/meeting-slug";

const BATCH_SIZE = 200;

async function main() {
  const result = await pool.query(
    "SELECT asset_id, pv_symbol, part_number FROM videos WHERE slug IS NULL",
  );

  console.log(`Found ${result.rows.length} videos without slugs`);

  // Load already-assigned slugs to avoid UNIQUE constraint violations
  const existing = await pool.query(
    "SELECT slug FROM videos WHERE slug IS NOT NULL",
  );
  const slugsSeen = new Set<string>(existing.rows.map((r) => r.slug as string));
  console.log(`${slugsSeen.size} videos already have slugs`);

  const statements: Array<{ text: string; values: unknown[] }> = [];

  for (const row of result.rows) {
    const slug = meetingSlugFromVideo({
      pv_symbol: row.pv_symbol as string | null,
      part_number: row.part_number as string | null,
      asset_id: row.asset_id as string,
    });

    if (slugsSeen.has(slug)) {
      console.warn(`  Duplicate slug: ${slug} for ${row.asset_id}, skipping`);
      continue;
    }
    slugsSeen.add(slug);

    statements.push({
      text: "UPDATE videos SET slug = $1 WHERE asset_id = $2",
      values: [slug, row.asset_id as string],
    });
  }

  // Batch in chunks of 200 for efficiency
  let updated = 0;
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const batch = statements.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const stmt of batch) {
        await client.query(stmt);
      }
      await client.query("COMMIT");
      updated += batch.length;
      console.log(`  Updated ${updated}/${statements.length}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`Done. Updated ${updated} videos with slugs`);
}

main().catch(console.error);
