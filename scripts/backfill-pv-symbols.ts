#!/usr/bin/env tsx
/**
 * Backfill pv_symbol on rows where parseMeetingSymbol now succeeds but
 * the row was scraped before the parser learned the pattern (treaty
 * bodies, daily briefings).
 *
 * Workflow:
 *   1. Visit every row where pv_symbol IS NULL.
 *   2. Re-parse the title via parseMeetingSymbol().
 *   3. If a symbol comes back, in one transaction: UPDATE the row, then
 *      assignPvPartsForCluster() so pv_part fills in for the cluster.
 *
 * Dry-run by default; pass --apply to commit changes.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-pv-symbols.ts             # dry-run, all rows
 *   pnpm tsx scripts/backfill-pv-symbols.ts --apply     # commit changes
 *   pnpm tsx scripts/backfill-pv-symbols.ts --limit=50  # cap rows visited
 */
import "../lib/load-env";
import {
  pool,
  q,
  withTransaction,
  assignPvPartsForCluster,
} from "../lib/db";
import { parseMeetingSymbol } from "../lib/pv-documents";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

interface Row {
  asset_id: string;
  title: string;
  category: string | null;
  date: string;
}

async function main() {
  const { rows } = await pool.query<Row>(
    q(
      `SELECT asset_id, title, category, date::text AS date
         FROM webtv.videos
        WHERE pv_symbol IS NULL
        ORDER BY date DESC`,
      [],
    ),
  );

  let visited = 0;
  let updated = 0;
  const byPrefix = new Map<string, number>();

  for (const row of rows) {
    if (visited >= LIMIT) break;
    visited++;
    const symbol = parseMeetingSymbol(
      row.title,
      row.category ?? "",
      row.date,
    );
    if (!symbol) continue;

    // Cluster on the family prefix for the summary.
    const prefix = symbol.split("/")[0];
    byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1);
    updated++;

    if (!APPLY) continue;

    await withTransaction(async (client) => {
      await client.query(
        q(`UPDATE webtv.videos SET pv_symbol = ? WHERE asset_id = ?`, [
          symbol,
          row.asset_id,
        ]),
      );
      await assignPvPartsForCluster(client, symbol);
    });
  }

  console.log(
    `${APPLY ? "Applied" : "Dry-run"}: visited ${visited}/${rows.length} rows, ` +
      `${updated} would gain a pv_symbol.`,
  );
  for (const [prefix, n] of [...byPrefix.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${prefix.padEnd(12)} ${n}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
