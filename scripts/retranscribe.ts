#!/usr/bin/env tsx
import "../lib/load-env";
import { pool } from "../lib/db";
import { submitTranscription, pollTranscription } from "../lib/transcription";
import { resolveEntryId as resolveEntryIdHelper } from "../lib/kaltura-helpers";

const usage = `Usage:
  npm run retranscribe -- <asset|entry-id|kaltura-id> [--language=<code>]
  npm run retranscribe -- all [--language=<code>]

  --language defaults to "en" for a single target. For "all" it filters to
  that language; omit it to refresh every row in its own original language.`;

// Argv parsing: pull --language=<code> out of argv, treat the first remaining
// non-flag as the target. Reject unknown flags so typos like --lang=fr fail
// loudly instead of silently running the en default.
function parseArgs(argv: string[]): { target: string; language?: string } {
  let target: string | undefined;
  let language: string | undefined;
  for (const arg of argv) {
    if (arg === "--") {
      // pnpm forwards the script-args separator literally; ignore it.
      continue;
    } else if (arg.startsWith("--language=")) {
      language = arg.slice("--language=".length).trim();
      if (!language) throw new Error(`Empty --language value`);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else if (!target) {
      target = arg;
    } else {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }
  }
  if (!target) throw new Error("Missing target");
  return { target, language };
}

let parsed: { target: string; language?: string };
try {
  parsed = parseArgs(process.argv.slice(2));
} catch (e) {
  console.error(`${(e as Error).message}\n\n${usage}`);
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

interface Target {
  kalturaId: string;
  language?: string;
}

async function loadTargets(
  arg: string,
  language: string | undefined,
): Promise<Target[]> {
  if (arg.toLowerCase() === "all") {
    // For `all`, preserve each row's original language by default; if the
    // operator passed --language=xx, filter to just those rows AND pass it
    // through so downstream sees the explicit code (identical to language_code
    // here, but kept explicit for clarity).
    const result = language
      ? await pool.query<{ kaltura_id: string; language_code: string }>(
          `SELECT DISTINCT kaltura_id, language_code
             FROM webtv.transcripts
            WHERE transcription_status = 'completed'
              AND start_time IS NULL AND end_time IS NULL
              AND language_code = $1`,
          [language],
        )
      : await pool.query<{ kaltura_id: string; language_code: string }>(
          `SELECT DISTINCT kaltura_id, language_code
             FROM webtv.transcripts
            WHERE transcription_status = 'completed'
              AND start_time IS NULL AND end_time IS NULL`,
        );
    return result.rows.map((row) => ({
      kalturaId: row.kaltura_id,
      language: row.language_code,
    }));
  }
  return [{ kalturaId: await resolveKalturaId(arg), language }];
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
  const targets = await loadTargets(parsed.target, parsed.language);
  const total = targets.length;

  console.log(`Processing ${total} entry/entries...\n`);

  for (const { kalturaId, language } of targets) {
    const { transcriptId } = await submitTranscription(kalturaId, {
      force: true,
      ...(language ? { language } : {}),
    });
    const langTag = language ?? "en";
    const label = `${kalturaId} [${langTag}]`;
    console.log(`✓ Submitted ${label} (${transcriptId})`);
    await pollUntilComplete(transcriptId, label);
  }

  console.log(`\n✓ Done. Completed ${total} transcript(s).`);
  process.exit(0);
}

run().catch((error) => {
  console.error("Retranscribe failed:", error);
  process.exit(1);
});
