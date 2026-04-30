/**
 * Fix slugs after ECOSOC filter tightening and SC resumed meeting detection.
 *
 * 1. Clear ECOSOC slugs for subsidiary body meetings (wrong symbols)
 * 2. Assign sequential part_number to resumed meetings
 * 3. Recompute slugs for all affected videos
 * 4. Backfill any remaining null slugs
 */
import "../lib/load-env";
import { pool } from "../lib/db";
import { parseMeetingSymbol } from "../lib/pv-documents";
import { meetingSlugFromVideo } from "../lib/meeting-slug";

const BATCH_SIZE = 200;

type Statement = { sql: string; args: unknown[] };

async function executeBatched(statements: Statement[]) {
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const batch = statements.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const stmt of batch) {
        let idx = 0;
        const text = stmt.sql.replace(/\?/g, () => `$${++idx}`);
        await client.query({ text, values: stmt.args });
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

async function main() {
  // Step 1: Fix ECOSOC — recalculate pv_symbol with tightened filter
  const ecosocVideos = await pool.query(
    "SELECT asset_id, title, category, date, pv_symbol, part_number FROM videos WHERE pv_symbol LIKE 'E/%'",
  );
  console.log(`Found ${ecosocVideos.rows.length} videos with ECOSOC symbols`);

  const ecosocFixes: Statement[] = [];
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
  await executeBatched(ecosocFixes);

  // Step 2: Fix resumed meetings — assign sequential part numbers per symbol
  const allWithSymbol = await pool.query(
    "SELECT asset_id, title, pv_symbol, part_number, date, scheduled_time FROM videos WHERE pv_symbol IS NOT NULL ORDER BY pv_symbol, date, scheduled_time, title",
  );

  const bySymbol = new Map<string, typeof allWithSymbol.rows>();
  for (const row of allWithSymbol.rows) {
    const sym = row.pv_symbol as string;
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym)!.push(row);
  }

  const partFixes: Statement[] = [];
  for (const [, rows] of bySymbol) {
    if (rows.length <= 1) continue;

    const nonResumed = rows.filter(
      (r) => !/^\(resumed\)/i.test((r.title as string).trim()),
    );
    const resumed = rows.filter((r) =>
      /^\(resumed\)/i.test((r.title as string).trim()),
    );

    for (const row of nonResumed) {
      const current = row.part_number as string | null;
      if (nonResumed.length === 1 && resumed.length === 0) continue;
      if (!current || current === "0") {
        partFixes.push({
          sql: "UPDATE videos SET part_number = ? WHERE asset_id = ?",
          args: ["1", row.asset_id as string],
        });
      }
    }

    for (let i = 0; i < resumed.length; i++) {
      const partNum = String(nonResumed.length > 0 ? i + 2 : i + 1);
      partFixes.push({
        sql: "UPDATE videos SET part_number = ? WHERE asset_id = ?",
        args: [partNum, resumed[i].asset_id as string],
      });
    }
  }

  console.log(`Fixing part_number for ${partFixes.length} videos`);
  await executeBatched(partFixes);

  // Step 3: Recompute all slugs from scratch
  console.log("\nRecomputing all slugs...");
  const allVideos = await pool.query(
    "SELECT asset_id, pv_symbol, part_number FROM videos",
  );

  const slugAssignments = new Map<string, string>();
  const slugFixes: Statement[] = [];

  for (const row of allVideos.rows) {
    const slug = meetingSlugFromVideo({
      pv_symbol: row.pv_symbol as string | null,
      part_number: row.part_number as string | null,
      asset_id: row.asset_id as string,
    });

    if (slugAssignments.has(slug)) {
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
  await executeBatched(slugFixes);

  // Verify
  const nullCount = await pool.query(
    "SELECT COUNT(*) AS c FROM videos WHERE slug IS NULL",
  );
  console.log(`\nDone. Videos without slug: ${Number(nullCount.rows[0].c)}`);
}

main().catch(console.error);
