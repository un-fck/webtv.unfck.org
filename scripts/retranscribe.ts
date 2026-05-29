#!/usr/bin/env tsx
import "../lib/load-env";
import { pool } from "../lib/db";
import { submitTranscription, pollTranscription } from "../lib/transcription";
import { resolveEntryId as resolveEntryIdHelper } from "../lib/kaltura-helpers";

const usage = `Usage:
  npm run retranscribe -- <asset|entry-id|kaltura-id>
  npm run retranscribe -- all`;

const rawArg = process.argv[2];

if (!rawArg) {
  console.error(usage);
  process.exit(1);
}

// Resolve any identifier (asset_id, entry_id, kaltura_id) to the canonical
// videos.kaltura_id — the player ID submitTranscription expects. Falls back to
// a Kaltura redirect if the input isn't already in our videos table.
async function resolveKalturaId(input: string): Promise<string> {
  const decoded = decodeURIComponent(input.trim());
  if (!decoded) throw new Error("Empty id");
  const direct = await pool.query<{ kaltura_id: string }>(
    `SELECT kaltura_id FROM webtv.videos
      WHERE asset_id = $1 OR kaltura_id = $1 OR entry_id = $1
      LIMIT 1`,
    [decoded],
  );
  if (direct.rows[0]) return direct.rows[0].kaltura_id;
  const entryId = await resolveEntryIdHelper(decoded);
  if (!entryId) throw new Error(`Unable to resolve: ${input}`);
  const viaEntry = await pool.query<{ kaltura_id: string }>(
    `SELECT kaltura_id FROM webtv.videos WHERE entry_id = $1 LIMIT 1`,
    [entryId],
  );
  if (viaEntry.rows[0]) return viaEntry.rows[0].kaltura_id;
  throw new Error(`No video row for ${input} (resolved ${entryId})`);
}

async function loadTargets(arg: string): Promise<string[]> {
  if (arg.toLowerCase() === "all") {
    const result = await pool.query(
      `SELECT DISTINCT kaltura_id FROM webtv.transcripts
        WHERE transcription_status = 'completed'
          AND start_time IS NULL AND end_time IS NULL`,
    );
    return result.rows.map((row) => row.kaltura_id as string);
  }
  return [await resolveKalturaId(arg)];
}

async function pollUntilComplete(
  transcriptId: string,
  label: string,
): Promise<void> {
  const maxAttempts = 240; // 20 minutes max
  const pollInterval = 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await pollTranscription(transcriptId);

    if (result.stage === "completed") {
      console.log(`  ✓ Completed ${label}`);
      return;
    } else if (result.stage === "error") {
      throw new Error(
        `Transcription failed for ${label}: ${result.error_message}`,
      );
    }

    if (attempt % 12 === 0) {
      // Every 60s
      console.log(
        `  ⏳ Still processing ${label} (${result.stage})... (${Math.round((attempt * pollInterval) / 1000)}s)`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Timeout polling ${label}`);
}

async function run() {
  const targets = await loadTargets(rawArg);
  const total = targets.length;

  console.log(`Processing ${total} entry/entries...\n`);

  for (const kalturaId of targets) {
    const { transcriptId } = await submitTranscription(kalturaId, {
      force: true,
    });
    console.log(`✓ Submitted ${kalturaId} (${transcriptId})`);
    await pollUntilComplete(transcriptId, kalturaId);
  }

  console.log(`\n✓ Done. Completed ${total} transcript(s).`);
  process.exit(0);
}

run().catch((error) => {
  console.error("Retranscribe failed:", error);
  process.exit(1);
});
