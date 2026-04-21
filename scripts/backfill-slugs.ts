/**
 * One-time migration: backfill the `slug` column for all existing videos.
 */
import "../lib/load-env";
import { getTursoClient } from "../lib/turso";
import { meetingSlugFromVideo } from "../lib/meeting-slug";
import type { InStatement } from "@libsql/client";

async function main() {
  const client = await getTursoClient();

  const result = await client.execute(
    "SELECT asset_id, pv_symbol, part_number FROM videos WHERE slug IS NULL",
  );

  console.log(`Found ${result.rows.length} videos without slugs`);

  // Load already-assigned slugs to avoid UNIQUE constraint violations
  const existing = await client.execute(
    "SELECT slug FROM videos WHERE slug IS NOT NULL",
  );
  const slugsSeen = new Set<string>(
    existing.rows.map((r) => r.slug as string),
  );
  console.log(`${slugsSeen.size} videos already have slugs`);

  const statements: InStatement[] = [];

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
      sql: "UPDATE videos SET slug = ? WHERE asset_id = ?",
      args: [slug, row.asset_id as string],
    });
  }

  // Batch in chunks of 200 for efficiency
  const BATCH_SIZE = 200;
  let updated = 0;
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const batch = statements.slice(i, i + BATCH_SIZE);
    await client.batch(batch, "write");
    updated += batch.length;
    console.log(`  Updated ${updated}/${statements.length}`);
  }

  console.log(`Done. Updated ${updated} videos with slugs`);
}

main().catch(console.error);
