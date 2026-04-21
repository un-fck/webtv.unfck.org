/**
 * Fix slugs after ECOSOC filter tightening and SC resumed meeting detection.
 *
 * 1. Clear ECOSOC slugs for subsidiary body meetings (wrong symbols)
 * 2. Assign sequential part_number to resumed meetings
 * 3. Recompute slugs for all affected videos
 * 4. Backfill any remaining null slugs
 */
import "../lib/load-env";
import { getTursoClient } from "../lib/turso";
import { parseMeetingSymbol } from "../lib/pv-documents";
import { meetingSlugFromVideo } from "../lib/meeting-slug";
import type { InStatement } from "@libsql/client";

const BATCH_SIZE = 200;

async function executeBatched(
  client: Awaited<ReturnType<typeof getTursoClient>>,
  statements: InStatement[],
) {
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const batch = statements.slice(i, i + BATCH_SIZE);
    await client.batch(batch, "write");
  }
}

async function main() {
  const client = await getTursoClient();

  // Step 1: Fix ECOSOC — recalculate pv_symbol with tightened filter
  const ecosocVideos = await client.execute(
    "SELECT asset_id, title, category, date, pv_symbol, part_number FROM videos WHERE pv_symbol LIKE 'E/%'",
  );
  console.log(`Found ${ecosocVideos.rows.length} videos with ECOSOC symbols`);

  const ecosocFixes: InStatement[] = [];
  for (const row of ecosocVideos.rows) {
    const newSymbol = parseMeetingSymbol(
      row.title as string,
      row.category as string,
      row.date as string,
    );
    if (newSymbol !== row.pv_symbol) {
      const newSlug = `meeting/${row.asset_id as string}`;
      ecosocFixes.push({
        sql: "UPDATE videos SET pv_symbol = ?, slug = ? WHERE asset_id = ?",
        args: [newSymbol, newSlug, row.asset_id as string],
      });
    }
  }
  console.log(`Clearing ${ecosocFixes.length} incorrect ECOSOC symbols`);
  await executeBatched(client, ecosocFixes);

  // Step 2: Fix resumed meetings — assign sequential part numbers per symbol
  // Get ALL videos grouped by pv_symbol, ordered by date+title
  const allWithSymbol = await client.execute(
    "SELECT asset_id, title, pv_symbol, part_number, date, scheduled_time FROM videos WHERE pv_symbol IS NOT NULL ORDER BY pv_symbol, date, scheduled_time, title",
  );

  // Group by pv_symbol
  const bySymbol = new Map<string, typeof allWithSymbol.rows>();
  for (const row of allWithSymbol.rows) {
    const sym = row.pv_symbol as string;
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym)!.push(row);
  }

  const partFixes: InStatement[] = [];
  for (const [sym, rows] of bySymbol) {
    if (rows.length <= 1) continue;

    // Assign part numbers: non-resumed first, then resumed in order
    const nonResumed = rows.filter(
      (r) => !/^\(resumed\)/i.test((r.title as string).trim()),
    );
    const resumed = rows.filter((r) =>
      /^\(resumed\)/i.test((r.title as string).trim()),
    );

    // Non-resumed get part 1 (or keep existing part_number if set)
    for (const row of nonResumed) {
      const current = row.part_number as string | null;
      if (nonResumed.length === 1 && resumed.length === 0) continue; // single video, no need
      if (!current || current === "0") {
        partFixes.push({
          sql: "UPDATE videos SET part_number = '1' WHERE asset_id = ?",
          args: [row.asset_id as string],
        });
      }
    }

    // Resumed get part 2, 3, etc.
    for (let i = 0; i < resumed.length; i++) {
      const partNum = String(nonResumed.length > 0 ? i + 2 : i + 1);
      partFixes.push({
        sql: "UPDATE videos SET part_number = ? WHERE asset_id = ?",
        args: [partNum, resumed[i].asset_id as string],
      });
    }
  }

  console.log(`Fixing part_number for ${partFixes.length} videos`);
  await executeBatched(client, partFixes);

  // Step 3: Recompute all slugs from scratch
  console.log("\nRecomputing all slugs...");
  const allVideos = await client.execute(
    "SELECT asset_id, pv_symbol, part_number FROM videos",
  );

  const slugAssignments = new Map<string, string>(); // slug -> asset_id (first wins)
  const slugFixes: InStatement[] = [];

  for (const row of allVideos.rows) {
    const slug = meetingSlugFromVideo({
      pv_symbol: row.pv_symbol as string | null,
      part_number: row.part_number as string | null,
      asset_id: row.asset_id as string,
    });

    if (slugAssignments.has(slug)) {
      // Duplicate — fall back to meeting/asset_id
      const fallback = `meeting/${row.asset_id as string}`;
      slugFixes.push({
        sql: "UPDATE videos SET slug = ? WHERE asset_id = ?",
        args: [fallback, row.asset_id as string],
      });
    } else {
      slugAssignments.set(slug, row.asset_id as string);
      slugFixes.push({
        sql: "UPDATE videos SET slug = ? WHERE asset_id = ?",
        args: [slug, row.asset_id as string],
      });
    }
  }

  console.log(`Setting slugs for ${slugFixes.length} videos`);
  await executeBatched(client, slugFixes);

  // Verify
  const nullCount = await client.execute(
    "SELECT COUNT(*) as c FROM videos WHERE slug IS NULL",
  );
  console.log(
    `\nDone. Videos without slug: ${(nullCount.rows[0].c as number)}`,
  );
}

main().catch(console.error);
