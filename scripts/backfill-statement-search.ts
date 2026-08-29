#!/usr/bin/env tsx
// One-off backfill for the statement search index (migration 026): rebuild
// webtv.transcript_statements for every completed transcript. Idempotent —
// reindexTranscriptStatements is delete + insert per transcript, so re-runs
// (or a run racing the live pipeline's own reindex hooks) are safe.
//
//   tsx scripts/backfill-statement-search.ts
import "../lib/load-env";
import { pool, reindexTranscriptStatements } from "../lib/db";

async function main() {
  const res = await pool.query(
    `SELECT transcript_id
       FROM webtv.transcripts
      WHERE transcription_status = 'completed'
        AND suppressed_at IS NULL
      ORDER BY created_at`,
  );
  const total = res.rows.length;
  console.log(`Reindexing ${total} completed transcripts…`);

  let done = 0;
  let failed = 0;
  for (const row of res.rows) {
    const transcriptId = row.transcript_id as string;
    try {
      await reindexTranscriptStatements(transcriptId);
    } catch (err) {
      failed++;
      console.error(
        `  ✗ ${transcriptId}:`,
        err instanceof Error ? err.message : err,
      );
    }
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${total}`);
  }

  const count = await pool.query(
    `SELECT COUNT(*) AS n FROM webtv.transcript_statements`,
  );
  console.log(
    `Done: ${done - failed}/${total} transcripts indexed (${failed} failed), ` +
      `${count.rows[0].n} statement rows total.`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
