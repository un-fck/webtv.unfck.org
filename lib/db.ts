import { Pool } from "pg";
import "@/lib/load-env";
import { extractKalturaId } from "./kaltura";
import { slugFromSymbol } from "./meeting-slug";

// Transcript production lifecycle. Proposition analysis is a separate axis
// (`AnalysisStatus`) and intentionally not part of this enum.
export type TranscriptionStatus =
  | "scheduled"
  | "transcribing"
  | "identifying_speakers"
  | "analyzing_topics"
  | "completed"
  | "error";
// On-demand proposition analysis, independent of transcript viewability.
export type AnalysisStatus = "none" | "analyzing" | "completed" | "error";
export type ProcessingUsageProvider = "openai" | "gemini";
export type ProcessingUsageStatus = "success" | "error";

const REQUIRED_VARS = ["DATABASE_URL"] as const;

REQUIRED_VARS.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required env var ${key}`);
  }
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("PostgreSQL pool error:", err);
});

// Convert ?-style placeholders to $N for pg
export function q(
  sql: string,
  args: unknown[] = [],
): { text: string; values: unknown[] } {
  let i = 0;
  return { text: sql.replace(/\?/g, () => `$${++i}`), values: args };
}

// Expose pool for scripts that need raw query access
export { pool };

export interface RawParagraph {
  text: string;
  start: number;
  end: number;
  /** ASR speaker label for the whole paragraph (used when there are no words). */
  speaker?: string;
  /** Real per-word timestamps. Absent for providers that only return segment-level timing. */
  words?: Array<{
    text: string;
    start: number;
    end: number;
    speaker?: string;
  }>;
}

export interface TranscriptContent {
  raw_paragraphs?: RawParagraph[];
  statements: Array<{
    paragraphs: Array<{
      sentences: Array<{
        text: string;
        start: number;
        end: number;
        topic_keys?: string[];
        words?: Array<{
          text: string;
          start: number;
          end: number;
        }>;
      }>;
      start: number;
      end: number;
      words?: Array<{
        text: string;
        start: number;
        end: number;
      }>;
    }>;
    start: number;
    end: number;
    words?: Array<{
      text: string;
      start: number;
      end: number;
    }>;
  }>;
  topics?: Record<string, { key: string; label: string; description: string }>;
  propositions?: Array<{
    key: string;
    title: string;
    statement: string;
    positions: Array<{
      stance: "support" | "oppose" | "conditional" | "neutral";
      stakeholders: string[];
      summary: string;
      evidence: Array<{
        stakeholder: string;
        quote: string;
        statementIndex: number;
      }>;
    }>;
  }>;
}

export interface Transcript {
  entry_id: string;
  kaltura_id: string | null;
  transcript_id: string;
  start_time: number | null;
  end_time: number | null;
  audio_url: string;
  transcription_status: TranscriptionStatus;
  analysis_status: AnalysisStatus;
  language_code: string | null;
  content: TranscriptContent;
  pipeline_lock: Date | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProcessingUsageEventInsert {
  transcript_id: string;
  provider: ProcessingUsageProvider;
  stage: string;
  operation: string;
  status: ProcessingUsageStatus;
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  reasoning_tokens?: number | null;
  cached_input_tokens?: number | null;
  total_tokens?: number | null;
  usage_hours?: number | null;
  usage_seconds?: number | null;
  usage_quantity_type?: string | null;
  usage_multiplier?: number | null;
  rate_card_version?: string | null;
  base_rate_per_hour_usd?: number | null;
  feature_rate_per_hour_usd?: number | null;
  pricing_meta?: object | null;
  duration_ms?: number | null;
  request_meta?: object | null;
  error_message?: string | null;
}

export interface ProcessingUsageEvent {
  id: number;
  transcript_id: string;
  provider: ProcessingUsageProvider;
  stage: string;
  operation: string;
  status: ProcessingUsageStatus;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  cached_input_tokens: number | null;
  total_tokens: number | null;
  usage_hours: number | null;
  usage_seconds: number | null;
  usage_quantity_type: string | null;
  usage_multiplier: number | null;
  rate_card_version: string | null;
  base_rate_per_hour_usd: number | null;
  feature_rate_per_hour_usd: number | null;
  pricing_meta: object | null;
  duration_ms: number | null;
  request_meta: object | null;
  error_message: string | null;
  created_at: Date;
}

export interface ProcessingUsageSummaryRow {
  provider: ProcessingUsageProvider;
  stage: string;
  events: number;
  success_events: number;
  error_events: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_input_tokens: number;
  total_tokens: number;
  usage_hours: number;
  usage_seconds: number;
  estimated_cost_usd: number;
}

function mapTranscriptRow(row: Record<string, unknown>): Transcript {
  return {
    entry_id: row.entry_id as string,
    kaltura_id: (row.kaltura_id as string | null) ?? null,
    transcript_id: row.transcript_id as string,
    start_time: row.start_time as number | null,
    end_time: row.end_time as number | null,
    audio_url: row.audio_url as string,
    transcription_status: row.transcription_status as TranscriptionStatus,
    analysis_status: (row.analysis_status as AnalysisStatus) ?? "none",
    language_code: row.language_code as string | null,
    content: row.content as TranscriptContent,
    pipeline_lock: row.pipeline_lock as Date | null,
    error_message: row.error_message as string | null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

export async function getTranscript(
  entryId: string,
  startTime?: number,
  endTime?: number,
  completedOnly = true,
  languageCode?: string,
): Promise<Transcript | null> {
  const statusFilter = completedOnly
    ? "AND transcription_status = 'completed'"
    : "";
  const langFilter = languageCode ? "AND language_code = ?" : "";
  const args: unknown[] = [entryId];

  let sql: string;
  if (startTime !== undefined && endTime !== undefined) {
    sql = `SELECT * FROM webtv.transcripts WHERE entry_id = ? AND start_time = ? AND end_time = ? ${statusFilter} ${langFilter} ORDER BY updated_at DESC LIMIT 1`;
    args.push(startTime, endTime);
  } else {
    sql = `SELECT * FROM webtv.transcripts WHERE entry_id = ? AND start_time IS NULL AND end_time IS NULL ${statusFilter} ${langFilter} ORDER BY updated_at DESC LIMIT 1`;
  }
  if (languageCode) args.push(languageCode);

  const result = await pool.query(q(sql, args));
  if (result.rows.length === 0) return null;
  return mapTranscriptRow(result.rows[0]);
}

export async function getAllTranscriptsForEntry(
  entryId: string,
): Promise<Transcript[]> {
  const result = await pool.query(
    q(
      "SELECT * FROM webtv.transcripts WHERE entry_id = ? AND status = 'completed' ORDER BY start_time ASC",
      [entryId],
    ),
  );
  return result.rows.map(mapTranscriptRow);
}

export interface TranscriptLanguageInfo {
  language_code: string | null;
  transcription_status: TranscriptionStatus;
  transcript_id: string;
}

export async function getTranscriptLanguagesForEntry(
  entryId: string,
): Promise<TranscriptLanguageInfo[]> {
  const result = await pool.query(
    q(
      "SELECT language_code, transcription_status, transcript_id FROM webtv.transcripts WHERE entry_id = ? ORDER BY language_code",
      [entryId],
    ),
  );
  return result.rows.map((row) => ({
    language_code: row.language_code as string | null,
    transcription_status: row.transcription_status as TranscriptionStatus,
    transcript_id: row.transcript_id as string,
  }));
}

export async function getTranscriptById(
  transcriptId: string,
): Promise<Transcript | null> {
  const result = await pool.query(
    q("SELECT * FROM webtv.transcripts WHERE transcript_id = ?", [
      transcriptId,
    ]),
  );
  if (result.rows.length === 0) return null;
  return mapTranscriptRow(result.rows[0]);
}

export async function saveTranscript(
  entryId: string,
  transcriptId: string,
  startTime: number | null,
  endTime: number | null,
  audioUrl: string,
  status: TranscriptionStatus,
  languageCode: string | null,
  content: TranscriptContent,
  kalturaId: string | null = null,
  // Optional executor so this can run inside an advisory-locked transaction
  // (see withVideoLock) on the same connection as the lock.
  executor: Pick<Pool, "query"> = pool,
): Promise<void> {
  await executor.query(
    q(
      `INSERT INTO webtv.transcripts (entry_id, kaltura_id, transcript_id, start_time, end_time, audio_url, transcription_status, language_code, content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(transcript_id) DO UPDATE SET
         entry_id = EXCLUDED.entry_id,
         kaltura_id = COALESCE(EXCLUDED.kaltura_id, transcripts.kaltura_id),
         audio_url = EXCLUDED.audio_url,
         transcription_status = EXCLUDED.transcription_status,
         language_code = EXCLUDED.language_code,
         content = EXCLUDED.content,
         updated_at = NOW()`,
      [
        entryId,
        kalturaId,
        transcriptId,
        startTime,
        endTime,
        audioUrl,
        status,
        languageCode,
        content,
      ],
    ),
  );
}

export async function updateTranscriptionStatus(
  transcriptId: string,
  status: TranscriptionStatus,
  errorMessage?: string,
): Promise<void> {
  await pool.query(
    q(
      "UPDATE webtv.transcripts SET transcription_status = ?, error_message = ?, updated_at = NOW() WHERE transcript_id = ?",
      [status, errorMessage ?? null, transcriptId],
    ),
  );
}

// On-demand proposition analysis lives on its own axis so it never moves the
// transcript off 'completed' (which would hide it from other viewers).
export async function updateAnalysisStatus(
  transcriptId: string,
  status: AnalysisStatus,
  errorMessage?: string,
): Promise<void> {
  await pool.query(
    q(
      "UPDATE webtv.transcripts SET analysis_status = ?, error_message = ?, updated_at = NOW() WHERE transcript_id = ?",
      [status, errorMessage ?? null, transcriptId],
    ),
  );
}

export async function updateTranscriptContent(
  transcriptId: string,
  content: TranscriptContent,
): Promise<void> {
  await pool.query(
    q(
      "UPDATE webtv.transcripts SET content = ?, updated_at = NOW() WHERE transcript_id = ?",
      [content, transcriptId],
    ),
  );
}

// Idempotent + race-safe: if a non-error transcript already exists for this
// video (queued, in-progress, or completed), reuse it instead of queuing a
// duplicate. The advisory lock serializes concurrent Schedule clicks.
export async function scheduleTranscript(
  assetId: string,
  kalturaId: string,
  startTime: number | null,
  endTime: number | null,
  languageCode: string = "en",
): Promise<{ transcriptId: string; stage: TranscriptionStatus }> {
  return withVideoLock(kalturaId, null, async (client) => {
    const existing = await getActiveTranscriptByKalturaId(
      kalturaId,
      languageCode,
      client,
    );
    if (existing) {
      return {
        transcriptId: existing.transcript_id,
        stage: existing.transcription_status,
      };
    }
    const transcriptId = `scheduled-${assetId}-${Date.now()}`;
    await client.query(
      q(
        `INSERT INTO webtv.transcripts (entry_id, kaltura_id, transcript_id, start_time, end_time, audio_url, transcription_status, language_code, content)
       VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, '{}')
       ON CONFLICT(transcript_id) DO NOTHING`,
        [
          kalturaId,
          kalturaId,
          transcriptId,
          startTime,
          endTime,
          `pending:${assetId}`,
          languageCode,
        ],
      ),
    );
    return { transcriptId, stage: "scheduled" as TranscriptionStatus };
  });
}

export interface ScheduledTranscript {
  transcript_id: string;
  entry_id: string;
  start_time: number | null;
  end_time: number | null;
  audio_url: string;
  language_code: string | null;
  created_at: Date;
}

export async function getScheduledTranscripts(): Promise<
  ScheduledTranscript[]
> {
  const result = await pool.query(
    `SELECT transcript_id, entry_id, start_time, end_time, audio_url, language_code, created_at
     FROM webtv.transcripts WHERE transcription_status = 'scheduled' ORDER BY created_at ASC`,
  );
  return result.rows.map((row) => ({
    transcript_id: row.transcript_id as string,
    entry_id: row.entry_id as string,
    start_time: row.start_time as number | null,
    end_time: row.end_time as number | null,
    audio_url: row.audio_url as string,
    language_code: row.language_code as string | null,
    created_at: row.created_at as Date,
  }));
}

export async function tryAcquirePipelineLock(
  transcriptId: string,
): Promise<boolean> {
  const result = await pool.query(
    q(
      `UPDATE webtv.transcripts SET pipeline_lock = NOW(), updated_at = NOW()
       WHERE transcript_id = ? AND (pipeline_lock IS NULL OR pipeline_lock < NOW() - INTERVAL '30 minutes')`,
      [transcriptId],
    ),
  );
  return (result.rowCount ?? 0) > 0;
}

export async function releasePipelineLock(transcriptId: string): Promise<void> {
  await pool.query(
    q(
      "UPDATE webtv.transcripts SET pipeline_lock = NULL, updated_at = NOW() WHERE transcript_id = ?",
      [transcriptId],
    ),
  );
}

/**
 * Refresh the pipeline lock timestamp — a heartbeat. Long-running stages call
 * this at their boundaries so a job that is still making progress keeps its
 * lock fresh and isn't re-entered concurrently by a poll when it legitimately
 * runs past the 30-minute stale window. Only updates a lock we still hold.
 */
export async function touchPipelineLock(transcriptId: string): Promise<void> {
  await pool.query(
    q(
      "UPDATE webtv.transcripts SET pipeline_lock = NOW() WHERE transcript_id = ? AND pipeline_lock IS NOT NULL",
      [transcriptId],
    ),
  );
}

/** Run `fn` inside a single BEGIN/COMMIT on one pooled client. */
async function withTransaction<T>(
  fn: (client: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Serialize the "start transcription / schedule" critical section for one
// video+language so two simultaneous clicks can't create duplicate rows.
// The advisory lock is held only for `fn`'s transaction; `fn` runs on the
// lock's own connection (passed in) so it never needs a second pool
// connection — avoiding deadlock under the small serverless pool.
export async function withVideoLock<T>(
  kalturaId: string,
  language: string | null,
  fn: (client: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const key = `${kalturaId}:${language ?? ""}`;
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
    return fn(client);
  });
}

export async function deleteTranscript(transcriptId: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      q("DELETE FROM webtv.processing_usage_events WHERE transcript_id = ?", [
        transcriptId,
      ]),
    );
    await client.query(
      q("DELETE FROM webtv.transcripts WHERE transcript_id = ?", [
        transcriptId,
      ]),
    );
  });
}

export async function deleteTranscriptsForEntry(
  entryId: string,
  languageCode?: string,
): Promise<void> {
  const langFilter = languageCode ? " AND language_code = ?" : "";
  const args = languageCode ? [entryId, languageCode] : [entryId];

  await withTransaction(async (client) => {
    await client.query(
      q(
        `DELETE FROM webtv.processing_usage_events WHERE transcript_id IN (
           SELECT transcript_id FROM webtv.transcripts WHERE entry_id = ?${langFilter}
         )`,
        args,
      ),
    );
    await client.query(
      q(`DELETE FROM webtv.transcripts WHERE entry_id = ?${langFilter}`, args),
    );
  });
}

export async function insertProcessingUsageEvent(
  event: ProcessingUsageEventInsert,
): Promise<void> {
  await pool.query(
    q(
      `INSERT INTO webtv.processing_usage_events (
         transcript_id, provider, stage, operation, status, model,
         input_tokens, output_tokens, reasoning_tokens, cached_input_tokens, total_tokens,
         usage_hours, usage_seconds, usage_quantity_type, usage_multiplier,
         rate_card_version, base_rate_per_hour_usd, feature_rate_per_hour_usd, pricing_meta,
         duration_ms, request_meta, error_message
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.transcript_id,
        event.provider,
        event.stage,
        event.operation,
        event.status,
        event.model ?? null,
        event.input_tokens ?? null,
        event.output_tokens ?? null,
        event.reasoning_tokens ?? null,
        event.cached_input_tokens ?? null,
        event.total_tokens ?? null,
        event.usage_hours ?? null,
        event.usage_seconds ?? null,
        event.usage_quantity_type ?? null,
        event.usage_multiplier ?? null,
        event.rate_card_version ?? null,
        event.base_rate_per_hour_usd ?? null,
        event.feature_rate_per_hour_usd ?? null,
        event.pricing_meta ?? null,
        event.duration_ms ?? null,
        event.request_meta ?? null,
        event.error_message ?? null,
      ],
    ),
  );
}

export async function listProcessingUsageEventsByTranscript(
  transcriptId: string,
): Promise<ProcessingUsageEvent[]> {
  const result = await pool.query(
    q(
      "SELECT * FROM webtv.processing_usage_events WHERE transcript_id = ? ORDER BY created_at ASC, id ASC",
      [transcriptId],
    ),
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    transcript_id: row.transcript_id as string,
    provider: row.provider as ProcessingUsageProvider,
    stage: row.stage as string,
    operation: row.operation as string,
    status: row.status as ProcessingUsageStatus,
    model: (row.model as string) ?? null,
    input_tokens: (row.input_tokens as number) ?? null,
    output_tokens: (row.output_tokens as number) ?? null,
    reasoning_tokens: (row.reasoning_tokens as number) ?? null,
    cached_input_tokens: (row.cached_input_tokens as number) ?? null,
    total_tokens: (row.total_tokens as number) ?? null,
    usage_hours: (row.usage_hours as number) ?? null,
    usage_seconds: (row.usage_seconds as number) ?? null,
    usage_quantity_type: (row.usage_quantity_type as string) ?? null,
    usage_multiplier: (row.usage_multiplier as number) ?? null,
    rate_card_version: (row.rate_card_version as string) ?? null,
    base_rate_per_hour_usd: (row.base_rate_per_hour_usd as number) ?? null,
    feature_rate_per_hour_usd:
      (row.feature_rate_per_hour_usd as number) ?? null,
    pricing_meta: (row.pricing_meta as object) ?? null,
    duration_ms: (row.duration_ms as number) ?? null,
    request_meta: (row.request_meta as object) ?? null,
    error_message: (row.error_message as string) ?? null,
    created_at: row.created_at as Date,
  }));
}

export async function getProcessingUsageSummaryByTranscript(
  transcriptId: string,
): Promise<ProcessingUsageSummaryRow[]> {
  const result = await pool.query(
    q(
      `SELECT
         provider,
         stage,
         COUNT(*) AS events,
         SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_events,
         SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_events,
         COALESCE(SUM(input_tokens), 0) AS input_tokens,
         COALESCE(SUM(output_tokens), 0) AS output_tokens,
         COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
         COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COALESCE(SUM(usage_hours), 0) AS usage_hours,
         COALESCE(SUM(usage_seconds), 0) AS usage_seconds,
         COALESCE(SUM(CASE
           WHEN usage_hours IS NOT NULL
             THEN usage_hours * (COALESCE(base_rate_per_hour_usd, 0) + COALESCE(feature_rate_per_hour_usd, 0))
           ELSE 0
         END), 0) AS estimated_cost_usd
       FROM webtv.processing_usage_events
       WHERE transcript_id = ?
       GROUP BY provider, stage
       ORDER BY provider, stage`,
      [transcriptId],
    ),
  );
  return result.rows.map((row) => ({
    provider: row.provider as ProcessingUsageProvider,
    stage: row.stage as string,
    events: Number(row.events),
    success_events: Number(row.success_events),
    error_events: Number(row.error_events),
    input_tokens: Number(row.input_tokens),
    output_tokens: Number(row.output_tokens),
    reasoning_tokens: Number(row.reasoning_tokens),
    cached_input_tokens: Number(row.cached_input_tokens),
    total_tokens: Number(row.total_tokens),
    usage_hours: Number(row.usage_hours),
    usage_seconds: Number(row.usage_seconds),
    estimated_cost_usd: Number(row.estimated_cost_usd),
  }));
}

export async function getTranscriptByKalturaId(
  kalturaId: string,
  languageCode?: string,
  completedOnly = true,
): Promise<Transcript | null> {
  const conditions: string[] = ["kaltura_id = ?"];
  const args: unknown[] = [kalturaId];
  if (completedOnly) conditions.push("transcription_status = 'completed'");
  if (languageCode) {
    conditions.push("language_code = ?");
    args.push(languageCode);
  }
  const result = await pool.query(
    q(
      `SELECT * FROM webtv.transcripts WHERE ${conditions.join(" AND ")}
       ORDER BY updated_at DESC LIMIT 1`,
      args,
    ),
  );
  if (result.rows.length === 0) return null;
  return mapTranscriptRow(result.rows[0]);
}

// Latest non-error transcript for a player ID — completed, in-progress, or
// scheduled. Powers the viewability path: a transcript is shown whenever its
// content exists, and in-progress/scheduled rows are surfaced to all viewers
// (with their stage) so others don't start a duplicate.
export async function getActiveTranscriptByKalturaId(
  kalturaId: string,
  languageCode?: string,
  executor: Pick<Pool, "query"> = pool,
): Promise<Transcript | null> {
  const conditions: string[] = [
    "kaltura_id = ?",
    "transcription_status <> 'error'",
  ];
  const args: unknown[] = [kalturaId];
  if (languageCode) {
    conditions.push("language_code = ?");
    args.push(languageCode);
  }
  const result = await executor.query(
    q(
      `SELECT * FROM webtv.transcripts WHERE ${conditions.join(" AND ")}
       ORDER BY updated_at DESC LIMIT 1`,
      args,
    ),
  );
  if (result.rows.length === 0) return null;
  return mapTranscriptRow(result.rows[0]);
}

// Latest non-error full-meeting transcript for a resolved (canonical) entry.
// Mirrors getActiveTranscriptByKalturaId for the entry-id path so that a newer
// `error` row (e.g. a failed re-transcription) can't mask an older usable
// (completed/in-progress) transcript for the same entry.
export async function getActiveTranscriptByEntryId(
  entryId: string,
  languageCode?: string,
  executor: Pick<Pool, "query"> = pool,
): Promise<Transcript | null> {
  const conditions: string[] = [
    "entry_id = ?",
    "start_time IS NULL",
    "end_time IS NULL",
    "transcription_status <> 'error'",
  ];
  const args: unknown[] = [entryId];
  if (languageCode) {
    conditions.push("language_code = ?");
    args.push(languageCode);
  }
  const result = await executor.query(
    q(
      `SELECT * FROM webtv.transcripts WHERE ${conditions.join(" AND ")}
       ORDER BY updated_at DESC LIMIT 1`,
      args,
    ),
  );
  if (result.rows.length === 0) return null;
  return mapTranscriptRow(result.rows[0]);
}

export async function getAllTranscriptedEntries(): Promise<string[]> {
  // Return identifiers that match `videos.entry_id`. Some legacy transcripts
  // were keyed by a resolved (canonical) entry that differs from the
  // pre-redirect Kaltura ID stored on `videos.entry_id`, so we also accept a
  // match via `videos.kaltura_id` (the stable player ID) when available.
  const result = await pool.query(
    `SELECT DISTINCT v.entry_id
       FROM webtv.videos v
       JOIN webtv.transcripts t
         ON t.transcription_status = 'completed'
        AND (t.entry_id = v.entry_id OR t.kaltura_id = v.kaltura_id)
      WHERE v.entry_id IS NOT NULL`,
  );
  return result.rows.map((row) => row.entry_id as string);
}

export interface VideoRecord {
  asset_id: string;
  entry_id: string | null;
  kaltura_id: string | null;
  title: string;
  clean_title: string | null;
  date: string;
  scheduled_time: Date | null;
  duration: number | null;
  url: string;
  body: string | null;
  category: string | null;
  event_code: string | null;
  event_type: string | null;
  session_number: string | null;
  part_number: string | null;
  pv_symbol: string | null;
  pv_available: boolean | null;
  pv_checked_at: Date | null;
  slug: string | null;
  last_seen: string;
  created_at: Date;
  updated_at: Date;
}

function mapVideoRow(row: Record<string, unknown>): VideoRecord {
  return {
    asset_id: row.asset_id as string,
    entry_id: row.entry_id as string | null,
    kaltura_id: (row.kaltura_id as string | null) ?? null,
    title: row.title as string,
    clean_title: row.clean_title as string | null,
    date: row.date as string,
    scheduled_time: row.scheduled_time as Date | null,
    duration: row.duration as number | null,
    url: row.url as string,
    body: row.body as string | null,
    category: row.category as string | null,
    event_code: row.event_code as string | null,
    event_type: row.event_type as string | null,
    session_number: row.session_number as string | null,
    part_number: row.part_number as string | null,
    pv_symbol: (row.pv_symbol as string | null) ?? null,
    pv_available: (row.pv_available as boolean | null) ?? null,
    pv_checked_at: (row.pv_checked_at as Date | null) ?? null,
    slug: (row.slug as string | null) ?? null,
    last_seen: row.last_seen as string,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

/**
 * Resolve the unique slug to store for a video, using DB collision data rather
 * than brittle title parsing.
 *
 * - The base slug comes from `pv_symbol` (or the inherently-unique
 *   `meeting/{asset_id}` fallback).
 * - If this asset_id already has a row, its existing slug is kept (URL stability
 *   — we never repoint a published URL).
 * - Otherwise the base slug is used if free, else the lowest free
 *   `{base}-part-N` (N ≥ 2) is chosen.
 */
async function resolveVideoSlug(
  assetId: string,
  pvSymbol: string | null,
): Promise<string> {
  const base = (pvSymbol && slugFromSymbol(pvSymbol)) || `meeting/${assetId}`;

  // Keep an existing asset's slug stable.
  const existing = await pool.query(
    q("SELECT slug FROM webtv.videos WHERE asset_id = ?", [assetId]),
  );
  const existingSlug = existing.rows[0]?.slug as string | undefined;
  if (existingSlug) return existingSlug;

  // Gather slugs already using this base (the base itself or any -part-N).
  const taken = await pool.query(
    q("SELECT slug FROM webtv.videos WHERE slug = ? OR slug LIKE ?", [
      base,
      `${base}-part-%`,
    ]),
  );
  const used = new Set(taken.rows.map((r) => r.slug as string));
  if (!used.has(base)) return base;

  let n = 2;
  while (used.has(`${base}-part-${n}`)) n++;
  return `${base}-part-${n}`;
}

export async function saveVideo(
  video: Omit<VideoRecord, "created_at" | "updated_at">,
): Promise<void> {
  // Up to a few attempts to absorb a race where a concurrent save claims the
  // slug we picked between our SELECT and INSERT (slug UNIQUE index → 23505).
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = await resolveVideoSlug(video.asset_id, video.pv_symbol);
    try {
      await pool.query(
        q(
          `INSERT INTO webtv.videos (
             asset_id, entry_id, kaltura_id, title, clean_title, date, scheduled_time,
             duration, url, body, category, event_code, event_type,
             session_number, part_number, pv_symbol, slug, last_seen
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(asset_id) DO UPDATE SET
             entry_id = COALESCE(EXCLUDED.entry_id, videos.entry_id),
             kaltura_id = COALESCE(EXCLUDED.kaltura_id, videos.kaltura_id),
             title = EXCLUDED.title,
             clean_title = EXCLUDED.clean_title,
             scheduled_time = EXCLUDED.scheduled_time,
             duration = EXCLUDED.duration,
             body = EXCLUDED.body,
             category = EXCLUDED.category,
             event_code = EXCLUDED.event_code,
             event_type = EXCLUDED.event_type,
             session_number = EXCLUDED.session_number,
             part_number = EXCLUDED.part_number,
             pv_symbol = COALESCE(EXCLUDED.pv_symbol, videos.pv_symbol),
             slug = videos.slug,
             last_seen = EXCLUDED.last_seen,
             updated_at = NOW()`,
          [
            video.asset_id,
            video.entry_id,
            video.kaltura_id ?? extractKalturaId(video.asset_id),
            video.title,
            video.clean_title,
            video.date,
            video.scheduled_time,
            video.duration,
            video.url,
            video.body,
            video.category,
            video.event_code,
            video.event_type,
            video.session_number,
            video.part_number,
            video.pv_symbol,
            slug,
            video.last_seen,
          ],
        ),
      );
      return;
    } catch (err) {
      // 23505 = unique_violation. Only retry slug collisions; rethrow otherwise.
      const code = (err as { code?: string }).code;
      if (code === "23505" && attempt < 4) continue;
      throw err;
    }
  }
}

export async function getVideoByAssetId(
  assetId: string,
): Promise<VideoRecord | null> {
  const result = await pool.query(
    q("SELECT * FROM webtv.videos WHERE asset_id = ?", [assetId]),
  );
  if (result.rows.length === 0) return null;
  return mapVideoRow(result.rows[0]);
}

export async function getVideoBySlug(
  slug: string,
): Promise<VideoRecord | null> {
  let result = await pool.query(
    q("SELECT * FROM webtv.videos WHERE slug = ?", [slug]),
  );

  if (result.rows.length === 0 && slug.startsWith("meeting/")) {
    const rest = slug.slice("meeting/".length);
    const assetId = rest.replace(/-part-\d+$/, "");
    result = await pool.query(
      q("SELECT * FROM webtv.videos WHERE asset_id = ?", [assetId]),
    );
  }

  if (result.rows.length === 0) return null;
  return mapVideoRow(result.rows[0]);
}

export async function getRecentVideos(
  daysBack: number = 365,
): Promise<VideoRecord[]> {
  const result = await pool.query(
    q(
      "SELECT * FROM webtv.videos WHERE last_seen >= CURRENT_DATE - ?::int ORDER BY date DESC, scheduled_time DESC",
      [daysBack],
    ),
  );
  return result.rows.map(mapVideoRow);
}

export async function updateVideoEntryId(
  assetId: string,
  entryId: string,
): Promise<void> {
  await pool.query(
    q(
      "UPDATE webtv.videos SET entry_id = ?, updated_at = NOW() WHERE asset_id = ?",
      [entryId, assetId],
    ),
  );
}

export interface SearchSort {
  by: "date" | "title";
  dir: "asc" | "desc";
}

// Maps an explicit sort to a hardcoded ORDER BY clause (no user-input
// interpolation). Returns null for relevance ordering (default).
function searchOrderBy(sort?: SearchSort): string | null {
  if (!sort) return null;
  const dir = sort.dir === "asc" ? "ASC" : "DESC";
  if (sort.by === "title") return `COALESCE(clean_title, title) ${dir}`;
  return `date ${dir}, scheduled_time ${dir}`;
}

export async function searchVideos(
  query: string,
  limit = 50,
  offset = 0,
  sort?: SearchSort,
): Promise<VideoRecord[]> {
  const words = query.trim().split(/\s+/);
  const allShort = words.every((w) => w.length < 3);
  const orderBy = searchOrderBy(sort);

  if (!allShort) {
    // Primary: FTS with websearch_to_tsquery (handles non-adjacent keywords)
    try {
      const ftsResult = await pool.query(
        q(
          `SELECT *, ts_rank(fts_vec, websearch_to_tsquery('english', ?)) AS rank
           FROM webtv.videos
           WHERE fts_vec @@ websearch_to_tsquery('english', ?)
           ORDER BY ${orderBy ?? "rank DESC, date DESC"}
           LIMIT ? OFFSET ?`,
          [query, query, limit, offset],
        ),
      );
      if (ftsResult.rows.length > 0) {
        return ftsResult.rows.map(mapVideoRow);
      }
    } catch (err) {
      // fts_vec column may not exist yet in dev — fall through to LIKE.
      // Warn so a broken FTS index doesn't silently degrade us to trigram-only.
      console.warn(
        "FTS query failed, falling back to trigram ILIKE:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Fallback: trigram-accelerated ILIKE (handles short tokens / partial typing)
  const pattern = `%${query}%`;
  const result = await pool.query(
    q(
      `SELECT * FROM webtv.videos WHERE title ILIKE ? OR clean_title ILIKE ?
       ORDER BY ${orderBy ?? "date DESC, scheduled_time DESC"}
       LIMIT ? OFFSET ?`,
      [pattern, pattern, limit, offset],
    ),
  );
  return result.rows.map(mapVideoRow);
}

// ── Server-side pagination ────────────────────────────────────────────────────

export interface VideosPageParams {
  daysBack?: number;
  date?: string;
  bodies?: string[];
  categories?: string[];
  status?: "past" | "scheduled";
  docs?: string[];
  sortBy?: "date" | "title";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  transcriptedEntryIds?: string[];
}

export interface VideosPage {
  records: VideoRecord[];
  total: number;
}

export async function getVideosPage(
  params: VideosPageParams,
): Promise<VideosPage> {
  const {
    daysBack = 365,
    date,
    bodies,
    categories,
    status,
    docs,
    sortBy = "date",
    sortDir = "desc",
    page = 1,
    pageSize = 50,
    transcriptedEntryIds,
  } = params;

  const conditions: string[] = ["last_seen >= CURRENT_DATE - ?::int"];
  const args: unknown[] = [daysBack];

  if (date) {
    conditions.push("date = ?");
    args.push(date);
  }

  if (bodies && bodies.length > 0) {
    conditions.push(`body IN (${bodies.map(() => "?").join(", ")})`);
    args.push(...bodies);
  }

  if (categories && categories.length > 0) {
    conditions.push(`category IN (${categories.map(() => "?").join(", ")})`);
    args.push(...categories);
  }

  if (status === "past") {
    conditions.push(`(scheduled_time IS NULL OR scheduled_time < NOW())`);
  } else if (status === "scheduled") {
    conditions.push(`(scheduled_time IS NOT NULL AND scheduled_time >= NOW())`);
  }

  if (docs && docs.length > 0) {
    const docConditions: string[] = [];
    if (docs.includes("transcript")) {
      if (transcriptedEntryIds) {
        if (transcriptedEntryIds.length === 0 && docs.length === 1) {
          return { records: [], total: 0 };
        }
        if (transcriptedEntryIds.length > 0) {
          docConditions.push(
            `entry_id IN (${transcriptedEntryIds.map(() => "?").join(", ")})`,
          );
          args.push(...transcriptedEntryIds);
        }
      }
    }
    if (docs.includes("pv")) {
      docConditions.push(
        "(pv_available = TRUE AND (pv_symbol IS NULL OR pv_symbol NOT LIKE '%/SR.%'))",
      );
    }
    if (docs.includes("sr")) {
      docConditions.push("(pv_available = TRUE AND pv_symbol LIKE '%/SR.%')");
    }
    if (docConditions.length > 0) {
      conditions.push(`(${docConditions.join(" OR ")})`);
    } else if (
      docs.includes("transcript") &&
      (!transcriptedEntryIds || transcriptedEntryIds.length === 0)
    ) {
      return { records: [], total: 0 };
    }
  }

  const where = conditions.join(" AND ");

  let orderBy: string;
  if (sortBy === "title") {
    orderBy = `clean_title ${sortDir === "asc" ? "ASC" : "DESC"}, date DESC`;
  } else {
    if (status === "past" || !status) {
      orderBy = `CASE WHEN scheduled_time IS NOT NULL AND scheduled_time >= NOW() THEN 0 ELSE 1 END ASC, date ${sortDir === "asc" ? "ASC" : "DESC"}, scheduled_time ${sortDir === "asc" ? "ASC" : "DESC"}`;
    } else {
      orderBy = `date ${sortDir === "asc" ? "ASC" : "DESC"}, scheduled_time ${sortDir === "asc" ? "ASC" : "DESC"}`;
    }
  }

  const offsetVal = (page - 1) * pageSize;
  const countArgs = [...args];
  const dataArgs = [...args, pageSize, offsetVal];

  const [countResult, dataResult] = await Promise.all([
    pool.query(
      q(`SELECT COUNT(*) AS total FROM webtv.videos WHERE ${where}`, countArgs),
    ),
    pool.query(
      q(
        `SELECT * FROM webtv.videos WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        dataArgs,
      ),
    ),
  ]);

  const total = Number(countResult.rows[0]?.total ?? 0);
  const records = dataResult.rows.map(mapVideoRow);
  return { records, total };
}

export async function getAvailableDates(
  daysBack: number = 365,
): Promise<string[]> {
  const result = await pool.query(
    q(
      "SELECT DISTINCT TO_CHAR(date, 'YYYY-MM-DD') AS date FROM webtv.videos WHERE last_seen >= CURRENT_DATE - ?::int ORDER BY date DESC",
      [daysBack],
    ),
  );
  return result.rows.map((row) => row.date as string);
}

export async function getFilterOptions(daysBack: number = 365): Promise<{
  bodies: string[];
  categories: string[];
  bodyCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
}> {
  const [bodiesResult, categoriesResult] = await Promise.all([
    pool.query(
      q(
        "SELECT body, COUNT(*) as cnt FROM webtv.videos WHERE last_seen >= CURRENT_DATE - ?::int AND body IS NOT NULL GROUP BY body ORDER BY body",
        [daysBack],
      ),
    ),
    pool.query(
      q(
        "SELECT category, COUNT(*) as cnt FROM webtv.videos WHERE last_seen >= CURRENT_DATE - ?::int AND category IS NOT NULL GROUP BY category ORDER BY category",
        [daysBack],
      ),
    ),
  ]);

  const bodyCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  for (const row of bodiesResult.rows)
    bodyCounts[row.body as string] = Number(row.cnt);
  for (const row of categoriesResult.rows)
    categoryCounts[row.category as string] = Number(row.cnt);

  return {
    bodies: Object.keys(bodyCounts),
    categories: Object.keys(categoryCounts),
    bodyCounts,
    categoryCounts,
  };
}

export async function updatePVAvailability(
  assetId: string,
  available: boolean,
): Promise<void> {
  await pool.query(
    q(
      "UPDATE webtv.videos SET pv_available = ?, pv_checked_at = NOW(), updated_at = NOW() WHERE asset_id = ?",
      [available, assetId],
    ),
  );
}

export async function getVideosNeedingPVCheck(
  maxAgeDays: number = 90,
  recheckAfterDays: number = 7,
): Promise<Array<{ asset_id: string; pv_symbol: string }>> {
  const result = await pool.query(
    q(
      `SELECT asset_id, pv_symbol FROM webtv.videos
       WHERE pv_symbol IS NOT NULL
         AND date >= CURRENT_DATE - ?::int
         AND (
           pv_checked_at IS NULL
           OR (pv_available = FALSE AND pv_checked_at < NOW() - make_interval(days => ?::int))
         )
       ORDER BY date DESC`,
      [maxAgeDays, recheckAfterDays],
    ),
  );
  return result.rows.map((row) => ({
    asset_id: row.asset_id as string,
    pv_symbol: row.pv_symbol as string,
  }));
}

// ── PV Content CRUD ───────────────────────────────────────────────────────────

export async function getPVContent(
  pvSymbol: string,
  language: string = "en",
): Promise<{ content: object; fetchedAt: Date; parsedAt: Date } | null> {
  const result = await pool.query(
    q(
      "SELECT content, fetched_at, parsed_at FROM webtv.pv_contents WHERE pv_symbol = ? AND language = ?",
      [pvSymbol, language],
    ),
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    content: row.content as object,
    fetchedAt: row.fetched_at as Date,
    parsedAt: row.parsed_at as Date,
  };
}

export async function savePVContent(
  pvSymbol: string,
  language: string,
  content: object,
): Promise<void> {
  await pool.query(
    q(
      `INSERT INTO webtv.pv_contents (pv_symbol, language, content, fetched_at, parsed_at)
       VALUES (?, ?, ?, NOW(), NOW())
       ON CONFLICT (pv_symbol, language)
       DO UPDATE SET content = EXCLUDED.content, parsed_at = NOW()`,
      [pvSymbol, language, content],
    ),
  );
}

// ── Speaker mappings ──────────────────────────────────────────────────────────

export interface SpeakerInfo {
  name: string | null;
  function: string | null;
  affiliation: string | null;
  group: string | null;
  is_off_record?: boolean;
}

export type SpeakerMapping = Record<string, SpeakerInfo>;

export async function getSpeakerMapping(
  transcriptId: string,
): Promise<SpeakerMapping | null> {
  const result = await pool.query(
    q("SELECT mapping FROM webtv.speaker_mappings WHERE transcript_id = ?", [
      transcriptId,
    ]),
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].mapping as SpeakerMapping;
}

export async function setSpeakerMapping(
  transcriptId: string,
  mapping: SpeakerMapping,
): Promise<void> {
  await pool.query(
    q(
      `INSERT INTO webtv.speaker_mappings (transcript_id, mapping)
       VALUES (?, ?)
       ON CONFLICT(transcript_id) DO UPDATE SET
         mapping = EXCLUDED.mapping,
         updated_at = NOW()`,
      [transcriptId, mapping],
    ),
  );
}

// Resolve a video by its stable player ID (or canonical entry as a fallback),
// matching the join semantics used elsewhere between transcripts and videos.
export async function getVideoByKalturaId(
  kalturaId: string,
): Promise<VideoRecord | null> {
  const result = await pool.query(
    q(
      `SELECT * FROM webtv.videos
        WHERE kaltura_id = ? OR entry_id = ?
        ORDER BY (kaltura_id = ?) DESC
        LIMIT 1`,
      [kalturaId, kalturaId, kalturaId],
    ),
  );
  if (result.rows.length === 0) return null;
  return mapVideoRow(result.rows[0]);
}

// ── Feeds & subscriptions (migration 004) ─────────────────────────────────────

export interface Feed {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  match_categories: string[] | null;
  match_title_ilike: string | null;
  match_event_type: string | null;
}

function mapFeedRow(row: Record<string, unknown>): Feed {
  return {
    key: row.key as string,
    label: row.label as string,
    description: (row.description as string | null) ?? null,
    enabled: row.enabled as boolean,
    match_categories: (row.match_categories as string[] | null) ?? null,
    match_title_ilike: (row.match_title_ilike as string | null) ?? null,
    match_event_type: (row.match_event_type as string | null) ?? null,
  };
}

export async function getAllFeeds(): Promise<Feed[]> {
  const result = await pool.query(
    `SELECT * FROM webtv.feeds ORDER BY label ASC`,
  );
  return result.rows.map(mapFeedRow);
}

export async function getEnabledFeeds(): Promise<Feed[]> {
  const result = await pool.query(
    `SELECT * FROM webtv.feeds WHERE enabled = TRUE ORDER BY label ASC`,
  );
  return result.rows.map(mapFeedRow);
}

export async function addVideoSubscription(
  userId: string,
  kalturaId: string,
  language: string,
): Promise<void> {
  await pool.query(
    q(
      `INSERT INTO webtv.video_subscriptions (user_id, kaltura_id, language)
       VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
      [userId, kalturaId, language],
    ),
  );
}

export async function removeVideoSubscription(
  userId: string,
  kalturaId: string,
  language: string,
): Promise<void> {
  await pool.query(
    q(
      `DELETE FROM webtv.video_subscriptions
        WHERE user_id = ? AND kaltura_id = ? AND language = ?`,
      [userId, kalturaId, language],
    ),
  );
}

export async function getVideoSubscription(
  userId: string,
  kalturaId: string,
  language: string,
): Promise<boolean> {
  const result = await pool.query(
    q(
      `SELECT 1 FROM webtv.video_subscriptions
        WHERE user_id = ? AND kaltura_id = ? AND language = ? LIMIT 1`,
      [userId, kalturaId, language],
    ),
  );
  return result.rows.length > 0;
}

export interface UserVideoSubscription {
  kaltura_id: string;
  language: string;
  title: string | null;
  slug: string | null;
  created_at: Date;
}

export async function getUserVideoSubscriptions(
  userId: string,
): Promise<UserVideoSubscription[]> {
  const result = await pool.query(
    q(
      `SELECT vs.kaltura_id, vs.language, vs.created_at,
              COALESCE(v.clean_title, v.title) AS title, v.slug
         FROM webtv.video_subscriptions vs
         LEFT JOIN webtv.videos v
           ON v.kaltura_id = vs.kaltura_id OR v.entry_id = vs.kaltura_id
        WHERE vs.user_id = ?
        ORDER BY vs.created_at DESC`,
      [userId],
    ),
  );
  return result.rows.map((row) => ({
    kaltura_id: row.kaltura_id as string,
    language: row.language as string,
    title: (row.title as string | null) ?? null,
    slug: (row.slug as string | null) ?? null,
    created_at: row.created_at as Date,
  }));
}

export async function addFeedSubscription(
  userId: string,
  feedKey: string,
): Promise<void> {
  await pool.query(
    q(
      `INSERT INTO webtv.feed_subscriptions (user_id, feed_key)
       VALUES (?, ?) ON CONFLICT DO NOTHING`,
      [userId, feedKey],
    ),
  );
}

export async function removeFeedSubscription(
  userId: string,
  feedKey: string,
): Promise<void> {
  await pool.query(
    q(
      `DELETE FROM webtv.feed_subscriptions WHERE user_id = ? AND feed_key = ?`,
      [userId, feedKey],
    ),
  );
}

export async function getUserFeedSubscriptions(
  userId: string,
): Promise<string[]> {
  const result = await pool.query(
    q(`SELECT feed_key FROM webtv.feed_subscriptions WHERE user_id = ?`, [
      userId,
    ]),
  );
  return result.rows.map((row) => row.feed_key as string);
}

// ── Notification engine queries ───────────────────────────────────────────────

export interface CompletedTranscriptRef {
  transcript_id: string;
  kaltura_id: string | null;
  entry_id: string;
  language_code: string | null;
}

// Recently-completed transcripts with content, candidates for notification.
export async function getRecentlyCompletedTranscripts(
  sinceHours: number,
): Promise<CompletedTranscriptRef[]> {
  const result = await pool.query(
    q(
      `SELECT transcript_id, kaltura_id, entry_id, language_code
         FROM webtv.transcripts
        WHERE transcription_status = 'completed'
          AND updated_at > NOW() - (? || ' hours')::interval
          AND jsonb_exists(content, 'statements')`,
      [String(sinceHours)],
    ),
  );
  return result.rows.map((row) => ({
    transcript_id: row.transcript_id as string,
    kaltura_id: (row.kaltura_id as string | null) ?? null,
    entry_id: row.entry_id as string,
    language_code: (row.language_code as string | null) ?? null,
  }));
}

export interface Recipient {
  user_id: string;
  email: string;
}

// Users with a per-video subscription matching this player ID (any language).
export async function getVideoSubscribers(
  kalturaId: string,
): Promise<Recipient[]> {
  const result = await pool.query(
    q(
      `SELECT DISTINCT u.id AS user_id, u.email
         FROM webtv.video_subscriptions vs
         JOIN webtv.users u ON u.id = vs.user_id
        WHERE vs.kaltura_id = ?`,
      [kalturaId],
    ),
  );
  return result.rows.map((row) => ({
    user_id: row.user_id as string,
    email: row.email as string,
  }));
}

// Users subscribed to any of the given feed keys.
export async function getFeedSubscribers(
  feedKeys: string[],
): Promise<Recipient[]> {
  if (feedKeys.length === 0) return [];
  const result = await pool.query(
    q(
      `SELECT DISTINCT u.id AS user_id, u.email
         FROM webtv.feed_subscriptions fs
         JOIN webtv.users u ON u.id = fs.user_id
        WHERE fs.feed_key = ANY(?)`,
      [feedKeys],
    ),
  );
  return result.rows.map((row) => ({
    user_id: row.user_id as string,
    email: row.email as string,
  }));
}

// User IDs already emailed for a transcript (so we don't re-send).
export async function getNotifiedUserIds(
  transcriptId: string,
): Promise<Set<string>> {
  const result = await pool.query(
    q(
      `SELECT user_id FROM webtv.sent_transcript_notifications
        WHERE transcript_id = ?`,
      [transcriptId],
    ),
  );
  return new Set(result.rows.map((row) => row.user_id as string));
}

// Record that (user, transcript) has been emailed. Idempotent.
export async function markTranscriptNotified(
  userId: string,
  transcriptId: string,
): Promise<void> {
  await pool.query(
    q(
      `INSERT INTO webtv.sent_transcript_notifications (user_id, transcript_id)
       VALUES (?, ?) ON CONFLICT DO NOTHING`,
      [userId, transcriptId],
    ),
  );
}
