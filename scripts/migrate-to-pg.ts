#!/usr/bin/env tsx
/**
 * One-time migration: Turso (libSQL/SQLite) → Azure PostgreSQL.
 *
 * Prerequisites:
 *   1. Apply sql/schema.sql to the target PostgreSQL database
 *   2. Set both TURSO_DB + TURSO_TOKEN and DATABASE_URL in .env.local
 *
 * Usage: pnpm migrate-to-pg
 *
 * Idempotent — uses ON CONFLICT DO NOTHING so it is safe to re-run.
 */
import "../lib/load-env";

import { createClient } from "@libsql/client";
import { Pool } from "pg";

const BATCH_SIZE = 500;

function tursoClient() {
  const url = process.env.TURSO_DB;
  const authToken = process.env.TURSO_TOKEN;
  if (!url) throw new Error("TURSO_DB is not set");
  return createClient({ url, authToken });
}

function pgPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
  pool.on("connect", (client) => {
    client.query("SET search_path = webtv").catch(() => {});
  });
  return pool;
}

async function migrateTable(
  tableName: string,
  turso: ReturnType<typeof createClient>,
  pool: Pool,
  transform?: (row: Record<string, unknown>) => Record<string, unknown>,
  readBatchSize: number = 200,
) {
  console.log(`\n→ Migrating ${tableName}...`);
  const start = Date.now();

  // Count total rows
  const countResult = await turso.execute(
    `SELECT COUNT(*) as n FROM ${tableName}`,
  );
  const totalRows = Number(countResult.rows[0].n);
  console.log(`  Found ${totalRows} rows in Turso`);

  if (totalRows === 0) {
    console.log(`  Skipped (empty)`);
    return;
  }

  // Get column names from a small sample
  const sample = await turso.execute(`SELECT * FROM ${tableName} LIMIT 1`);
  const columns = Object.keys(
    sample.rows[0] as unknown as Record<string, unknown>,
  );

  let inserted = 0;
  let offset = 0;

  while (offset < totalRows) {
    // Read in pages to avoid Turso response size limits
    const result = await turso.execute(
      `SELECT * FROM ${tableName} LIMIT ${readBatchSize} OFFSET ${offset}`,
    );
    const rows = result.rows as unknown as Record<string, unknown>[];
    if (rows.length === 0) break;

    const transformed = transform ? rows.map(transform) : rows;

    // Write batch to PG
    for (let i = 0; i < transformed.length; i += BATCH_SIZE) {
      const batch = transformed.slice(i, i + BATCH_SIZE);

      const placeholders = batch.map(
        (_, bIdx) =>
          `(${columns.map((_, cIdx) => `$${bIdx * columns.length + cIdx + 1}`).join(", ")})`,
      );
      const values = batch.flatMap((row) => columns.map((col) => row[col]));

      await pool.query({
        text: `INSERT INTO ${tableName} (${columns.map((c) => `"${c}"`).join(", ")})
               VALUES ${placeholders.join(", ")}
               ON CONFLICT DO NOTHING`,
        values,
      });
    }

    inserted += rows.length;
    offset += rows.length;
    console.log(`  Inserted ${inserted}/${totalRows}`);
  }

  console.log(
    `  Done: ${inserted} rows in ${((Date.now() - start) / 1000).toFixed(1)}s`,
  );
}

function parseJsonColumn(value: unknown): object | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value as object;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as object;
    } catch {
      return null;
    }
  }
  return null;
}

function ensureTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value);
  if (!s) return null;
  if (s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s)) return s;
  return s + "Z";
}

async function run() {
  console.log("Turso → Azure PostgreSQL migration");
  console.log("=====================================");

  const turso = tursoClient();
  const pool = pgPool();

  try {
    // 1. videos — boolean, TIMESTAMPTZ, strip broken offset from scheduled_time
    await migrateTable("videos", turso, pool, (row) => ({
      ...row,
      pv_available:
        row.pv_available === null
          ? null
          : row.pv_available === 1 || row.pv_available === true,
      scheduled_time:
        typeof row.scheduled_time === "string"
          ? row.scheduled_time.slice(0, 19) + "Z"
          : row.scheduled_time,
      pv_checked_at: ensureTimestamp(row.pv_checked_at),
      created_at: ensureTimestamp(row.created_at),
      updated_at: ensureTimestamp(row.updated_at),
    }));

    // 2. pv_contents — content: TEXT → JSONB, timestamps
    await migrateTable("pv_contents", turso, pool, (row) => ({
      ...row,
      content: parseJsonColumn(row.content),
      fetched_at: ensureTimestamp(row.fetched_at),
      parsed_at: ensureTimestamp(row.parsed_at),
    }));

    // 3. transcripts — content: TEXT → JSONB, timestamps (small batches due to large content)
    await migrateTable(
      "transcripts",
      turso,
      pool,
      (row) => ({
        ...row,
        content: parseJsonColumn(row.content),
        pipeline_lock: ensureTimestamp(row.pipeline_lock),
        created_at: ensureTimestamp(row.created_at),
        updated_at: ensureTimestamp(row.updated_at),
      }),
      10,
    );

    // 4. speaker_mappings — mapping: TEXT → JSONB, timestamps
    await migrateTable("speaker_mappings", turso, pool, (row) => ({
      ...row,
      mapping: parseJsonColumn(row.mapping),
      updated_at: ensureTimestamp(row.updated_at),
    }));

    // 5. processing_usage_events — JSONB + timestamps
    await migrateTable("processing_usage_events", turso, pool, (row) => ({
      ...row,
      pricing_meta: parseJsonColumn(row.pricing_meta),
      request_meta: parseJsonColumn(row.request_meta),
      created_at: ensureTimestamp(row.created_at),
    }));

    // Reset the serial sequence for processing_usage_events after explicit id inserts.
    // Requires USAGE privilege on the sequence — run as superuser if this fails:
    //   SELECT setval('webtv.processing_usage_events_id_seq', (SELECT MAX(id) FROM webtv.processing_usage_events));
    try {
      await pool.query(
        `SELECT setval('processing_usage_events_id_seq', COALESCE((SELECT MAX(id) FROM processing_usage_events), 0))`,
      );
      console.log("  Sequence reset OK");
    } catch (err) {
      console.warn(
        "  ⚠ Could not reset sequence (run as superuser):",
        (err as Error).message,
      );
    }

    console.log("\n✓ Migration complete.");

    // Row count verification
    console.log("\nVerification (PostgreSQL row counts):");
    const tables = [
      "videos",
      "pv_contents",
      "transcripts",
      "speaker_mappings",
      "processing_usage_events",
    ];
    for (const table of tables) {
      const r = await pool.query(`SELECT COUNT(*) AS n FROM ${table}`);
      console.log(`  ${table}: ${Number(r.rows[0].n)}`);
    }
  } finally {
    await pool.end();
    turso.close();
  }
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
