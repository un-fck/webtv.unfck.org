/**
 * One-time migration: backfill the `slug` column for all existing videos.
 */
import "../lib/load-env";
import { getTursoClient, type VideoRecord } from "../lib/turso";
import { meetingSlugFromVideo } from "../lib/meeting-slug";

async function main() {
  const client = await getTursoClient();

  const result = await client.execute(
    "SELECT asset_id, pv_symbol, part_number FROM videos WHERE slug IS NULL",
  );

  console.log(`Found ${result.rows.length} videos without slugs`);

  let updated = 0;
  const slugsSeen = new Set<string>();

  for (const row of result.rows) {
    const slug = meetingSlugFromVideo({
      pv_symbol: row.pv_symbol as string | null,
      part_number: row.part_number as string | null,
      asset_id: row.asset_id as string,
    });

    // Handle duplicate slugs (shouldn't happen, but be safe)
    if (slugsSeen.has(slug)) {
      console.warn(`  Duplicate slug: ${slug} for ${row.asset_id}, skipping`);
      continue;
    }
    slugsSeen.add(slug);

    await client.execute({
      sql: "UPDATE videos SET slug = ? WHERE asset_id = ?",
      args: [slug, row.asset_id as string],
    });
    updated++;
  }

  console.log(`Updated ${updated} videos with slugs`);
}

main().catch(console.error);
