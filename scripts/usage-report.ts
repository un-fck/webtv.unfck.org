#!/usr/bin/env tsx
import "../lib/load-env";

import {
  getTursoClient,
  getProcessingUsageSummaryByTranscript,
  listProcessingUsageEventsByTranscript,
} from "../lib/turso";
import { resolveEntryId as resolveEntryIdHelper } from "../lib/kaltura-helpers";

const inputId = process.argv[2];

if (!inputId) {
  console.error(
    "Usage: npm run usage-report -- <transcript-id|entry-id|video-id-or-url> [--events]",
  );
  process.exit(1);
}

const includeEvents = process.argv.includes("--events");

function normalizeVideoInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const decoded = decodeURIComponent(trimmed);
  const match = decoded.match(/\/video\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : decoded;
}

async function resolveTranscriptId(rawInput: string): Promise<string | null> {
  const client = await getTursoClient();
  const normalized = normalizeVideoInput(rawInput);
  const candidates = Array.from(new Set([rawInput, normalized]));

  // 1) Direct transcript_id lookup
  for (const candidate of candidates) {
    const byTranscript = await client.execute({
      sql: "SELECT transcript_id FROM transcripts WHERE transcript_id = ? LIMIT 1",
      args: [candidate],
    });
    if (byTranscript.rows.length > 0) {
      return byTranscript.rows[0].transcript_id as string;
    }
  }

  // 2) entry_id lookup (latest transcript)
  for (const candidate of candidates) {
    const byEntry = await client.execute({
      sql: "SELECT transcript_id FROM transcripts WHERE entry_id = ? ORDER BY updated_at DESC LIMIT 1",
      args: [candidate],
    });
    if (byEntry.rows.length > 0) {
      return byEntry.rows[0].transcript_id as string;
    }
  }

  // 3) Resolve video/asset id -> entry_id -> latest transcript
  const resolvedEntryId = await resolveEntryIdHelper(normalized);
  if (resolvedEntryId) {
    const byResolvedEntry = await client.execute({
      sql: "SELECT transcript_id FROM transcripts WHERE entry_id = ? ORDER BY updated_at DESC LIMIT 1",
      args: [resolvedEntryId],
    });
    if (byResolvedEntry.rows.length > 0) {
      return byResolvedEntry.rows[0].transcript_id as string;
    }
  }

  return null;
}

async function run() {
  const transcriptId = await resolveTranscriptId(inputId);
  if (!transcriptId) {
    console.log(`No transcript found for input: ${inputId}`);
    return;
  }

  if (transcriptId !== inputId) {
    console.log(`Resolved input "${inputId}" -> transcript "${transcriptId}"`);
  }

  const summary = await getProcessingUsageSummaryByTranscript(transcriptId);
  if (summary.length === 0) {
    console.log(`No usage rows found for transcript: ${transcriptId}`);
    return;
  }

  console.log(`Usage summary for transcript ${transcriptId}`);
  console.table(
    summary.map((row) => ({
      provider: row.provider,
      stage: row.stage,
      events: row.events,
      success_events: row.success_events,
      error_events: row.error_events,
      input_tokens: row.input_tokens,
      output_tokens: row.output_tokens,
      reasoning_tokens: row.reasoning_tokens,
      cached_input_tokens: row.cached_input_tokens,
      total_tokens: row.total_tokens,
      usage_hours: Number(row.usage_hours.toFixed(6)),
      usage_seconds: row.usage_seconds,
      estimated_cost_usd: Number(row.estimated_cost_usd.toFixed(6)),
    })),
  );

  if (includeEvents) {
    const events = await listProcessingUsageEventsByTranscript(transcriptId);
    console.log("\nRaw events:");
    console.table(
      events.map((event) => ({
        id: event.id,
        provider: event.provider,
        stage: event.stage,
        operation: event.operation,
        status: event.status,
        model: event.model,
        input_tokens: event.input_tokens,
        output_tokens: event.output_tokens,
        reasoning_tokens: event.reasoning_tokens,
        usage_hours: event.usage_hours,
        duration_ms: event.duration_ms,
        created_at: event.created_at,
      })),
    );
  }
}

run().catch((error) => {
  console.error("usage-report failed:", error);
  process.exit(1);
});
