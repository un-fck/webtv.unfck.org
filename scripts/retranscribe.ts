#!/usr/bin/env tsx
import "../lib/load-env";
import { getTursoClient } from "../lib/turso";
import { submitTranscription, pollTranscription } from "../lib/transcription";
import { resolveEntryId as resolveEntryIdHelper } from "../lib/kaltura-helpers";

const usage = `Usage:
  npm run retranscribe -- <asset|entry-id>
  npm run retranscribe -- all`;

const rawArg = process.argv[2];

if (!rawArg) {
  console.error(usage);
  process.exit(1);
}

async function resolveEntryId(input: string) {
  const decoded = decodeURIComponent(input.trim());
  if (!decoded) throw new Error("Empty id");
  const entryId = await resolveEntryIdHelper(decoded);
  if (!entryId) throw new Error(`Unable to resolve entry ID for: ${input}`);
  return entryId;
}

async function loadTargets(arg: string): Promise<string[]> {
  if (arg.toLowerCase() === "all") {
    const client = await getTursoClient();
    const rows = await client.execute({
      sql: "SELECT DISTINCT entry_id FROM transcripts WHERE status = 'completed' AND start_time IS NULL AND end_time IS NULL",
    });
    return rows.rows.map((row) => row.entry_id as string);
  }
  return [await resolveEntryId(arg)];
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

  for (const entryId of targets) {
    const { transcriptId } = await submitTranscription(entryId, { force: true });
    console.log(`✓ Submitted ${entryId} (${transcriptId})`);
    await pollUntilComplete(transcriptId, entryId);
  }

  console.log(`\n✓ Done. Completed ${total} transcript(s).`);
  process.exit(0);
}

run().catch((error) => {
  console.error("Retranscribe failed:", error);
  process.exit(1);
});
