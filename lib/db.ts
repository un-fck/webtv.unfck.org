import { Pool } from "pg";
import { readFileSync } from "fs";
import "@/lib/load-env";
import { slugFromSymbol } from "./meeting-slug";
import { applyTimeOffset } from "./transcript-offset";

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
export type ProcessingUsageProvider =
  | "openai"
  | "gemini"
  | "azure-openai"
  | "assemblyai"
  | "alibaba";
export type ProcessingUsageStatus = "success" | "error";

// Lazily construct the Pool so importing this module during `next build`'s
// page-data collection (when DATABASE_URL isn't injected) doesn't throw.
let _pool: Pool | undefined;
function getPool(): Pool {
  if (_pool) return _pool;
  if (!process.env.DATABASE_URL) {
    throw new Error(`Missing required env var DATABASE_URL`);
  }
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Verify the server's TLS certificate (chain + hostname) against Node's
    // built-in CA bundle. Azure Database for PostgreSQL presents certs chained to
    // DigiCert roots that ship with Node, so no custom CA file is needed. The
    // previous `rejectUnauthorized: false` encrypted the connection but trusted
    // ANY certificate — i.e. no protection against a man-in-the-middle. Set
    // PG_SSL_CA to a PEM path if a future Azure cert chain isn't in the bundle.
    ssl: process.env.PG_SSL_CA
      ? { ca: readFileSync(process.env.PG_SSL_CA, "utf8") }
      : { rejectUnauthorized: true },
    // Per-instance pool size. On Vercel many instances each hold their own pool,
    // and PgBouncer (transaction mode) does the real fan-in to Postgres, so keep
    // this small — a high number here just hogs PgBouncer client slots. Override
    // with PG_POOL_MAX for long-running scripts that benefit from more.
    max: Number(process.env.PG_POOL_MAX) || 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  _pool.on("error", (err) => {
    console.error("PostgreSQL pool error:", err);
  });
  return _pool;
}

// Proxy so existing `pool.query(...)` / `pool.connect()` / `pool.on(...)` call
// sites work unchanged — the real Pool is only created on first property access.
const pool = new Proxy({} as Pool, {
  get(_target, prop, receiver) {
    const real = getPool();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
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
  kaltura_id: string;
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
  source_duration_ms: number | null;
  time_offset_ms: number | null;
  aligned_duration_ms: number | null;
  created_at: Date;
  updated_at: Date;
}

// Reduction threshold (ms) below which the realignment cron treats current
// audio as "shrunk" vs. the length we last reconciled to. Kept in sync with
// REDUCTION_TRIGGER_S in lib/realignment.ts. Exported so API responses can
// derive `flagged` from the same threshold without importing realignment.
const REALIGN_REDUCTION_TRIGGER_MS = 30_000;

/**
 * "Flagged" = completed transcript whose audio was shrunk by WebTV after
 * transcription in a way the realignment cron couldn't resolve with a single
 * front-shift (typically content removed mid- or end-of-video). The cron sets
 * `aligned_duration_ms` to the current length and leaves `time_offset_ms` NULL
 * to mark this state — see lib/realignment.ts:328-336.
 */
export function isTranscriptFlagged(t: Transcript): boolean {
  return (
    t.transcription_status === "completed" &&
    t.time_offset_ms == null &&
    t.aligned_duration_ms != null &&
    t.source_duration_ms != null &&
    t.aligned_duration_ms <
      t.source_duration_ms - REALIGN_REDUCTION_TRIGGER_MS
  );
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
    kaltura_id: row.kaltura_id as string,
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
    source_duration_ms: (row.source_duration_ms as number | null) ?? null,
    time_offset_ms: (row.time_offset_ms as number | null) ?? null,
    aligned_duration_ms: (row.aligned_duration_ms as number | null) ?? null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

// Display-facing mapper: applies the realignment offset (WebTV re-cut the audio
// after transcription) so any caller serving a transcript to users gets aligned
// timestamps — the single chokepoint, so new read sites can't silently diverge.
// NEVER use this on reprocessing/realignment paths: those must read the raw
// stored timestamps (via mapTranscriptRow / getTranscriptById), since the offset
// is computed from — and re-saved relative to — the original timeline.
function mapTranscriptRowForDisplay(row: Record<string, unknown>): Transcript {
  const t = mapTranscriptRow(row);
  if (!t.time_offset_ms) return t;
  return { ...t, content: applyTimeOffset(t.content, t.time_offset_ms) };
}

export interface TranscriptLanguageInfo {
  language_code: string | null;
  transcription_status: TranscriptionStatus;
  transcript_id: string;
}

// Transcript languages + status for a video, keyed on `kaltura_id` (the
// URL-stable player ID). Filtering by `entry_id` instead would mean trusting
// that a fresh Kaltura redirect resolution agrees with what was stored on
// the transcript row when it was first created — that has been seen to
// diverge for legacy/edge rows and silently drops valid transcripts. Since
// migration 015 every transcript row has a kaltura_id, so this is reliable.
//
// Returns at most one row per `language_code`: when retries / forced reruns
// leave multiple rows for the same (kaltura_id, language) — typically an
// error'd row plus a completed retry — pick the most recently updated, so
// the picker shows the user-meaningful state instead of an undefined
// ordering between same-language rows.
export async function getTranscriptLanguagesByKalturaId(
  kalturaId: string,
): Promise<TranscriptLanguageInfo[]> {
  const result = await pool.query(
    q(
      `SELECT DISTINCT ON (language_code)
              language_code, transcription_status, transcript_id
         FROM webtv.transcripts
        WHERE kaltura_id = ?
        ORDER BY language_code, updated_at DESC`,
      [kalturaId],
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
  // The video's stable player ID (videos.kaltura_id). Required — see migration
  // 015 + CLAUDE.md "Joining transcripts ↔ videos".
  kalturaId: string,
  // Actual audio length we transcribed (ms). Frozen baseline for detecting
  // later WebTV re-cuts (see migration 008). null when unknown.
  sourceDurationMs: number | null = null,
  // Optional executor so this can run inside an advisory-locked transaction
  // (see withVideoLock) on the same connection as the lock.
  executor: Pick<Pool, "query"> = pool,
  // User who initiated this transcript (tracking only; the daily limit is
  // counter-based). null for script-initiated runs (e.g. pnpm retranscribe).
  // On upsert we COALESCE so an existing creator is never overwritten by null.
  createdBy: string | null = null,
): Promise<void> {
  await executor.query(
    q(
      `INSERT INTO webtv.transcripts (entry_id, kaltura_id, transcript_id, start_time, end_time, audio_url, transcription_status, language_code, content, source_duration_ms, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(transcript_id) DO UPDATE SET
         entry_id = EXCLUDED.entry_id,
         kaltura_id = EXCLUDED.kaltura_id,
         audio_url = EXCLUDED.audio_url,
         transcription_status = EXCLUDED.transcription_status,
         language_code = EXCLUDED.language_code,
         content = EXCLUDED.content,
         source_duration_ms = COALESCE(EXCLUDED.source_duration_ms, transcripts.source_duration_ms),
         created_by = COALESCE(transcripts.created_by, EXCLUDED.created_by),
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
        sourceDurationMs,
        createdBy,
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
  // User who queued this transcript (tracking only; see saveTranscript).
  // null for any system-initiated scheduling.
  createdBy: string | null = null,
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
        `INSERT INTO webtv.transcripts (entry_id, kaltura_id, transcript_id, start_time, end_time, audio_url, transcription_status, language_code, content, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, '{}', ?)
       ON CONFLICT(transcript_id) DO NOTHING`,
        [
          kalturaId,
          kalturaId,
          transcriptId,
          startTime,
          endTime,
          `pending:${assetId}`,
          languageCode,
          createdBy,
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

// Advisory-lock namespaces. The 2-arg pg_advisory_*_lock form takes a
// (classid, objid) pair, partitioning the global lock keyspace by classid so
// `withVideoLock` and `withJobLock` can't collide on hashtext values that
// happen to coincide.
const LOCK_NS_VIDEO = 1;
const LOCK_NS_JOB = 2;

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
    await client.query(
      "SELECT pg_advisory_xact_lock($1, hashtext($2)::int)",
      [LOCK_NS_VIDEO, key],
    );
    return fn(client);
  });
}

/**
 * Serialize a named cron job across replicas using a session-scope advisory
 * lock. Returns `fn`'s result on success, or `null` if another replica already
 * holds the lock (caller should treat that as "skipped, not an error").
 *
 * Uses pg_try_advisory_lock (non-blocking) so a contended run exits cleanly
 * instead of piling up. Session-scope, not xact-scope, because the lock must
 * survive any internal transactions `fn` runs. The `finally` MUST explicitly
 * unlock before releasing the client back to the pool — session locks stick
 * to the underlying connection otherwise.
 */
export async function withJobLock<T>(
  jobName: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1, hashtext($2)::int) AS locked",
      [LOCK_NS_JOB, jobName],
    );
    if (!rows[0]?.locked) return null;
    try {
      return await fn();
    } finally {
      await client
        .query("SELECT pg_advisory_unlock($1, hashtext($2)::int)", [
          LOCK_NS_JOB,
          jobName,
        ])
        .catch((err) => {
          console.warn(`withJobLock(${jobName}): unlock failed`, err);
        });
    }
  } finally {
    client.release();
  }
}

// FK ON DELETE CASCADE (migration 014) handles `speaker_mappings`,
// `processing_usage_events`, and `sent_transcript_notifications` — a single
// DELETE on `transcripts` is atomic on its own, no transaction wrapper needed.

// Used by the `pnpm retranscribe` (force: true) path to wipe existing rows
// before re-running the pipeline. Keyed on `kaltura_id` rather than
// `entry_id` so the DELETE can't miss rows whose stored entry_id drifted
// from the current Kaltura redirect resolution (see CLAUDE.md "Joining
// transcripts ↔ videos" + the languages-route fix that motivated this).
export async function deleteTranscriptsForKalturaId(
  kalturaId: string,
  languageCode?: string,
): Promise<void> {
  const langFilter = languageCode ? " AND language_code = ?" : "";
  const args = languageCode ? [kalturaId, languageCode] : [kalturaId];
  const { text, values } = q(
    `DELETE FROM webtv.transcripts WHERE kaltura_id = ?${langFilter}`,
    args,
  );
  await pool.query(text, values);
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
         COALESCE(SUM(
           COALESCE((pricing_meta->>'estimated_cost_usd')::float, 0)
         ), 0) AS estimated_cost_usd
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
  return mapTranscriptRowForDisplay(result.rows[0]);
}

// A row in `transcribing | identifying_speakers | analyzing_topics` whose
// `updated_at` hasn't moved in this long is treated as abandoned (the serverless
// process died without flipping the row to `error`). Chosen well above the
// longest realistic single-stage runtime (a ~6h meeting at ~1× through STT)
// so we never kill a job that's actually progressing.
const STUCK_TRANSCRIPT_THRESHOLD = "2 hours";

// Marks any in-process transcripts matching the filter as `error` if their
// `updated_at` is older than STUCK_TRANSCRIPT_THRESHOLD. Runs inline before
// active-transcript reads so the UI never displays a permanently stuck row.
// Also clears stale `analysis_status = 'analyzing'` runs on the same axis.
async function expireStuckTranscripts(
  filter: { kalturaId?: string; entryId?: string; transcriptId?: string },
  executor: Pick<Pool, "query"> = pool,
): Promise<void> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (filter.kalturaId) {
    conds.push("kaltura_id = ?");
    args.push(filter.kalturaId);
  }
  if (filter.entryId) {
    conds.push("entry_id = ?");
    args.push(filter.entryId);
  }
  if (filter.transcriptId) {
    conds.push("transcript_id = ?");
    args.push(filter.transcriptId);
  }
  if (conds.length === 0) return;
  const scope = conds.join(" AND ");
  await executor.query(
    q(
      `UPDATE webtv.transcripts
          SET transcription_status = 'error',
              error_message = COALESCE(NULLIF(error_message, ''),
                'Pipeline stalled (no progress for >${STUCK_TRANSCRIPT_THRESHOLD}); auto-marked as error.'),
              pipeline_lock = NULL,
              updated_at = NOW()
        WHERE ${scope}
          AND transcription_status IN ('transcribing','identifying_speakers','analyzing_topics')
          AND updated_at < NOW() - INTERVAL '${STUCK_TRANSCRIPT_THRESHOLD}'`,
      args,
    ),
  );
  await executor.query(
    q(
      `UPDATE webtv.transcripts
          SET analysis_status = 'error',
              error_message = COALESCE(NULLIF(error_message, ''),
                'Analysis stalled (no progress for >${STUCK_TRANSCRIPT_THRESHOLD}); auto-marked as error.'),
              updated_at = NOW()
        WHERE ${scope}
          AND analysis_status = 'analyzing'
          AND updated_at < NOW() - INTERVAL '${STUCK_TRANSCRIPT_THRESHOLD}'`,
      args,
    ),
  );
}

/**
 * Unfiltered sweep that marks ANY in-process transcript whose `updated_at`
 * is older than the stuck threshold as `error`. Run from a cron tick so
 * SIGTERM-killed pipelines on Azure (or any host-level kill) eventually
 * recover instead of staying visibly stuck. Returns the number of rows
 * flipped on each axis so the cron run can log meaningful output.
 */
export async function sweepStuckTranscripts(): Promise<{
  transcription: number;
  analysis: number;
}> {
  const transcription = await pool.query(
    `UPDATE webtv.transcripts
        SET transcription_status = 'error',
            error_message = COALESCE(NULLIF(error_message, ''),
              'Pipeline stalled (no progress for >${STUCK_TRANSCRIPT_THRESHOLD}); auto-marked as error.'),
            pipeline_lock = NULL,
            updated_at = NOW()
      WHERE transcription_status IN ('transcribing','identifying_speakers','analyzing_topics')
        AND updated_at < NOW() - INTERVAL '${STUCK_TRANSCRIPT_THRESHOLD}'`,
  );
  const analysis = await pool.query(
    `UPDATE webtv.transcripts
        SET analysis_status = 'error',
            error_message = COALESCE(NULLIF(error_message, ''),
              'Analysis stalled (no progress for >${STUCK_TRANSCRIPT_THRESHOLD}); auto-marked as error.'),
            updated_at = NOW()
      WHERE analysis_status = 'analyzing'
        AND updated_at < NOW() - INTERVAL '${STUCK_TRANSCRIPT_THRESHOLD}'`,
  );
  return {
    transcription: transcription.rowCount ?? 0,
    analysis: analysis.rowCount ?? 0,
  };
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
  await expireStuckTranscripts({ kalturaId }, executor);
  const conditions: string[] = [
    "kaltura_id = ?",
    "transcription_status <> 'error'",
  ];
  const args: unknown[] = [kalturaId];
  if (languageCode) {
    conditions.push("language_code = ?");
    args.push(languageCode);
  }
  // Prefer a completed row over any in-progress one. When a user triggers a
  // soft-replace retranscribe (the realignment-flagged path), a new in-progress
  // row is inserted alongside the old completed one — viewers should keep
  // seeing the old completed content (with the flagged banner) until the new
  // run finishes and becomes the latest completed row.
  const result = await executor.query(
    q(
      `SELECT * FROM webtv.transcripts WHERE ${conditions.join(" AND ")}
       ORDER BY (transcription_status = 'completed') DESC, updated_at DESC LIMIT 1`,
      args,
    ),
  );
  if (result.rows.length === 0) return null;
  return mapTranscriptRowForDisplay(result.rows[0]);
}

/**
 * Returns the latest non-completed, non-error transcript row for the given
 * video+language — i.e. one currently being (re)transcribed. Used by the
 * retranscribe endpoint to avoid spawning a duplicate run when one is already
 * in flight.
 */
export async function getPendingTranscriptByKalturaId(
  kalturaId: string,
  languageCode: string,
): Promise<Transcript | null> {
  await expireStuckTranscripts({ kalturaId });
  const result = await pool.query(
    q(
      `SELECT * FROM webtv.transcripts
        WHERE kaltura_id = ? AND language_code = ?
          AND transcription_status NOT IN ('completed', 'error')
        ORDER BY created_at DESC LIMIT 1`,
      [kalturaId, languageCode],
    ),
  );
  if (result.rows.length === 0) return null;
  return mapTranscriptRowForDisplay(result.rows[0]);
}

export async function getAllTranscriptedEntries(): Promise<string[]> {
  // Returns videos.entry_id values for every video with at least one completed
  // transcript. Joined on the canonical pivot (v.kaltura_id = t.kaltura_id) —
  // see CLAUDE.md "Joining transcripts ↔ videos".
  const result = await pool.query(
    `SELECT DISTINCT v.entry_id
       FROM webtv.videos v
       JOIN webtv.transcripts t ON v.kaltura_id = t.kaltura_id
      WHERE t.transcription_status = 'completed'
        AND v.entry_id IS NOT NULL`,
  );
  return result.rows.map((row) => row.entry_id as string);
}

/**
 * Like `getAllTranscriptedEntries` but scoped to a single language. Powers
 * the two-tier T badge: a solid badge when an entry has a completed
 * transcript in the active locale, a muted badge when it only has one in
 * some other language.
 *
 * Pass through the raw locale string (`'ar'`, `'fr'`, etc.) — it matches
 * `transcripts.language_code` directly.
 */
export async function getTranscriptedEntriesByLanguage(
  language: string,
): Promise<string[]> {
  const result = await pool.query(
    q(
      `SELECT DISTINCT v.entry_id
         FROM webtv.videos v
         JOIN webtv.transcripts t ON v.kaltura_id = t.kaltura_id
        WHERE t.transcription_status = 'completed'
          AND t.language_code = ?
          AND v.entry_id IS NOT NULL`,
      [language],
    ),
  );
  return result.rows.map((row) => row.entry_id as string);
}

export interface VideoRecord {
  asset_id: string;
  entry_id: string | null;
  kaltura_id: string;
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
  removed_at: Date | null;
  last_seen: string;
  created_at: Date;
  updated_at: Date;
  // Per-locale variants of title/clean_title/category (migration 019). English
  // lives in the canonical columns above; this map covers ar/zh/fr/ru/es.
  // Missing entries fall back to English at render time.
  i18n: Record<string, VideoI18n>;
}

export interface VideoI18n {
  title?: string;
  clean_title?: string;
  category?: string;
}

function mapVideoRow(row: Record<string, unknown>): VideoRecord {
  return {
    asset_id: row.asset_id as string,
    entry_id: row.entry_id as string | null,
    kaltura_id: row.kaltura_id as string,
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
    removed_at: (row.removed_at as Date | null) ?? null,
    last_seen: row.last_seen as string,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    i18n: (row.i18n as Record<string, VideoI18n> | null) ?? {},
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
  video: Omit<VideoRecord, "created_at" | "updated_at" | "removed_at">,
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
             session_number, part_number, pv_symbol, slug, last_seen, i18n
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
           ON CONFLICT(asset_id) DO UPDATE SET
             entry_id = COALESCE(EXCLUDED.entry_id, videos.entry_id),
             kaltura_id = EXCLUDED.kaltura_id,
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
             -- Merge per-locale variants: a later sync that only re-scrapes a
             -- subset of locales must not blank the others. Newer keys win.
             i18n = videos.i18n || EXCLUDED.i18n,
             updated_at = NOW()`,
          [
            video.asset_id,
            video.entry_id,
            video.kaltura_id,
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
            JSON.stringify(video.i18n ?? {}),
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

// Listing visibility: a video whose Kaltura entry was deleted (`removed_at`)
// is hidden — UNLESS we already produced a completed transcript from it, in
// which case the page stays valuable even though the source video is gone.
// References the unaliased `videos` table, matching the listing queries below.
const VISIBLE_VIDEO = `(
  videos.removed_at IS NULL
  OR EXISTS (
    SELECT 1 FROM webtv.transcripts t
    WHERE t.transcription_status = 'completed'
      AND t.kaltura_id = videos.kaltura_id
  )
)`;

/**
 * Slim listing used by the sitemap — just enough to emit a `<url>` entry per
 * video. Keeps the query off the full row scan so sitemap regeneration stays
 * cheap as the archive grows.
 */
export async function getSitemapVideos(
  daysBack: number = 365,
): Promise<Array<{ slug: string; updated_at: Date }>> {
  const result = await pool.query(
    q(
      `SELECT slug, updated_at FROM webtv.videos
       WHERE last_seen >= CURRENT_DATE - ?::int
         AND slug IS NOT NULL
         AND ${VISIBLE_VIDEO}
       ORDER BY date DESC`,
      [daysBack],
    ),
  );
  return result.rows.map((r) => ({
    slug: r.slug as string,
    updated_at: r.updated_at as Date,
  }));
}

export async function getRecentVideos(
  daysBack: number = 365,
): Promise<VideoRecord[]> {
  const result = await pool.query(
    q(
      `SELECT * FROM webtv.videos WHERE last_seen >= CURRENT_DATE - ?::int
       AND ${VISIBLE_VIDEO} ORDER BY date DESC, scheduled_time DESC`,
      [daysBack],
    ),
  );
  return result.rows.map(mapVideoRow);
}

/**
 * Rows to reconcile against Kaltura entry status during sync: those with a
 * resolved entry_id seen within `lookbackDays`. Returns both currently-removed
 * and not-yet-removed rows so the reaper can both flag deletions and clear
 * false positives. `removed_at` lets the caller skip no-op updates.
 */
export async function getRemovalCandidates(
  lookbackDays: number,
): Promise<
  Array<{ asset_id: string; entry_id: string; removed_at: Date | null }>
> {
  const result = await pool.query(
    q(
      `SELECT asset_id, entry_id, removed_at
         FROM webtv.videos
        WHERE entry_id IS NOT NULL
          AND last_seen >= CURRENT_DATE - ?::int
        ORDER BY date DESC NULLS LAST`,
      [lookbackDays],
    ),
  );
  return result.rows as Array<{
    asset_id: string;
    entry_id: string;
    removed_at: Date | null;
  }>;
}

/** Soft-disable a video (Kaltura entry deleted). No-op if already removed. */
export async function markVideoRemoved(assetId: string): Promise<void> {
  await pool.query(
    q(
      `UPDATE webtv.videos SET removed_at = NOW(), updated_at = NOW()
       WHERE asset_id = ? AND removed_at IS NULL`,
      [assetId],
    ),
  );
}

/** Clear a removal flag (entry came back / was a false positive). */
export async function clearVideoRemoved(assetId: string): Promise<void> {
  await pool.query(
    q(
      `UPDATE webtv.videos SET removed_at = NULL, updated_at = NOW()
       WHERE asset_id = ? AND removed_at IS NOT NULL`,
      [assetId],
    ),
  );
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

// ── Unified video query (browse + search) ────────────────────────────────────
//
// `queryVideos` is the single entry point for both schedule browsing and
// free-text search. A query (`q`) is just another filter: when set, it adds an
// FTS predicate (with trigram ILIKE fallback for short tokens / FTS errors).
// Ordering is always date-based — there is no rank/relevance mode — so search
// and browse render in the same time-sorted layout. All structural filters
// (date, body, category, docs, locale) apply uniformly whether or not a query
// is present.

export interface SearchSort {
  by: "date" | "title";
  dir: "asc" | "desc";
}

/**
 * Per-locale visibility filter. When `includeOther` is false (the default
 * client state) AND `locale` is non-English, only videos with a harvested
 * `i18n[locale]` entry are returned. English is treated as always-available
 * because every video has English canonical metadata.
 *
 * Callers also receive `totalIncludingOther` so the UI can render a
 * "(N more in other languages)" CTA without a separate request.
 */
export interface LocaleFilter {
  locale: string;
  includeOther: boolean;
}

export interface VideosQueryParams {
  /** Free-text query. When set, adds an FTS predicate (with trigram ILIKE
   *  fallback). Does not change ordering — results are always date-sorted. */
  q?: string;
  daysBack?: number;
  date?: string;
  bodies?: string[];
  categories?: string[];
  status?: "past" | "scheduled";
  docs?: string[];
  /** Explicit sort. When omitted, default is `date DESC` for both browse
   *  and search. */
  sort?: SearchSort;
  page?: number;
  pageSize?: number;
  transcriptedEntryIds?: string[];
  localeFilter?: LocaleFilter;
}

export interface VideosQueryResult {
  records: VideoRecord[];
  /** Count under all active filters, including the per-locale visibility cut. */
  total: number;
  /** Count under all active filters, but ignoring the per-locale cut. Equal
   *  to `total` when the locale filter is a no-op (English, or
   *  `includeOther === true`). */
  totalIncludingOther: number;
}

/**
 * Returns true when the locale filter actually narrows the result set:
 * a non-English locale AND `includeOther` is false. The locale clause
 * (`(i18n -> ?) IS NOT NULL`) is only added in that case.
 */
function localeFilterActive(f: LocaleFilter | undefined): boolean {
  return !!f && !f.includeOther && f.locale !== "en";
}

// Explicit ORDER BY for a user-chosen sort. The `auto` (no-sort) ordering is
// always date DESC (see the `orderBy` defaults in `queryVideos`).
// `asset_id ASC` tiebreaker keeps OFFSET pagination stable across requests.
function explicitOrderBy(sort: SearchSort): string {
  const dir = sort.dir === "asc" ? "ASC" : "DESC";
  if (sort.by === "title") {
    return `COALESCE(clean_title, title) ${dir}, asset_id ASC`;
  }
  // Within a day, always earliest-first so meetings read chronologically as
  // the day unfolds — independent of the day-level sort direction.
  return `date ${dir}, scheduled_time ASC, asset_id ASC`;
}

// Runs the three-query pattern (data + localized count + optional all-locale
// count) shared by every text/structural combination. The caller has already
// assembled `conditions` (structural + optional text predicate); this helper
// appends the locale clause when active and dispatches the SQL.
async function runVideosQuery(args: {
  conditions: string[];
  conditionArgs: unknown[];
  orderBy: string;
  pageSize: number;
  offset: number;
  localeFilter?: LocaleFilter;
}): Promise<VideosQueryResult> {
  const {
    conditions,
    conditionArgs,
    orderBy,
    pageSize,
    offset,
    localeFilter,
  } = args;

  const filterActive = localeFilterActive(localeFilter);
  const whereAll = conditions.join(" AND ");
  // `(i18n -> ?) IS NOT NULL` is the semantic equivalent of the JSONB
  // existence operator `i18n ? ?`, but written so the `q()` helper's
  // `?`-to-`$N` rewrite doesn't try to substitute the operator itself.
  const whereLocalized = filterActive
    ? `${whereAll} AND (i18n -> ?) IS NOT NULL`
    : whereAll;
  const localizedArgs = filterActive
    ? [...conditionArgs, localeFilter!.locale]
    : conditionArgs;

  const dataPromise = pool.query(
    q(
      `SELECT * FROM webtv.videos WHERE ${whereLocalized}
       ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...localizedArgs, pageSize, offset],
    ),
  );
  const countLocalizedPromise = pool.query(
    q(
      `SELECT COUNT(*) AS total FROM webtv.videos WHERE ${whereLocalized}`,
      localizedArgs,
    ),
  );
  // Skip the extra count when the locale filter is a no-op.
  const countAllPromise = filterActive
    ? pool.query(
        q(
          `SELECT COUNT(*) AS total FROM webtv.videos WHERE ${whereAll}`,
          conditionArgs,
        ),
      )
    : null;
  const [data, countLocalized, countAll] = await Promise.all([
    dataPromise,
    countLocalizedPromise,
    countAllPromise,
  ]);

  const total = Number(
    (countLocalized.rows[0] as { total?: string } | undefined)?.total ?? 0,
  );
  const totalIncludingOther = countAll
    ? Number((countAll.rows[0] as { total?: string } | undefined)?.total ?? 0)
    : total;
  return {
    records: data.rows.map(mapVideoRow),
    total,
    totalIncludingOther,
  };
}

export async function queryVideos(
  params: VideosQueryParams,
): Promise<VideosQueryResult> {
  const {
    q: queryText,
    daysBack = 365,
    date,
    bodies,
    categories,
    status,
    docs,
    sort,
    page = 1,
    pageSize = 50,
    transcriptedEntryIds,
    localeFilter,
  } = params;

  // Structural WHERE — shared across all text paths (none / FTS / ILIKE).
  const conditions: string[] = [
    "last_seen >= CURRENT_DATE - ?::int",
    VISIBLE_VIDEO,
  ];
  const conditionArgs: unknown[] = [daysBack];

  if (date) {
    conditions.push("date = ?");
    conditionArgs.push(date);
  }

  if (bodies && bodies.length > 0) {
    conditions.push(`body IN (${bodies.map(() => "?").join(", ")})`);
    conditionArgs.push(...bodies);
  }

  if (categories && categories.length > 0) {
    conditions.push(`category IN (${categories.map(() => "?").join(", ")})`);
    conditionArgs.push(...categories);
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
          return { records: [], total: 0, totalIncludingOther: 0 };
        }
        if (transcriptedEntryIds.length > 0) {
          docConditions.push(
            `entry_id IN (${transcriptedEntryIds.map(() => "?").join(", ")})`,
          );
          conditionArgs.push(...transcriptedEntryIds);
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
      return { records: [], total: 0, totalIncludingOther: 0 };
    }
  }

  const offset = (page - 1) * pageSize;
  const explicit = sort ? explicitOrderBy(sort) : null;

  const trimmedQ = queryText?.trim() ?? "";
  if (trimmedQ) {
    const words = trimmedQ.split(/\s+/);
    const allShort = words.every((w) => w.length < 3);

    if (!allShort) {
      // Primary text path: FTS with websearch_to_tsquery (non-adjacent
      // keywords, English stemming). Adds the FTS predicate alongside the
      // structural filters. No ranking — results are date-ordered like the
      // browse feed.
      try {
        const ftsResult = await runVideosQuery({
          conditions: [
            ...conditions,
            "fts_vec @@ websearch_to_tsquery('english', ?)",
          ],
          conditionArgs: [...conditionArgs, trimmedQ],
          orderBy: explicit ?? "date DESC, scheduled_time ASC, asset_id ASC",
          pageSize,
          offset,
          localeFilter,
        });
        // FTS surfaced something (rows OR a non-zero count under the locale
        // filter) → trust it. Empty results fall through to ILIKE — which
        // catches partial words / typos the FTS index has no token for.
        if (ftsResult.records.length > 0 || ftsResult.total > 0) {
          return ftsResult;
        }
      } catch (err) {
        // fts_vec column may be missing in dev — warn so a broken index
        // doesn't silently degrade us to trigram-only.
        console.warn(
          "FTS query failed, falling back to trigram ILIKE:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Fallback: trigram-accelerated ILIKE. Fires for all-short tokens, when
    // FTS throws, or when FTS returned no matches. Applies the same
    // structural filters; ranking isn't available so the default order falls
    // back to date desc.
    const pattern = `%${trimmedQ}%`;
    return runVideosQuery({
      conditions: [
        ...conditions,
        "(title ILIKE ? OR clean_title ILIKE ?)",
      ],
      conditionArgs: [...conditionArgs, pattern, pattern],
      orderBy: explicit ?? "date DESC, scheduled_time ASC, asset_id ASC",
      pageSize,
      offset,
      localeFilter,
    });
  }

  // No text query — structural filters only.
  return runVideosQuery({
    conditions,
    conditionArgs,
    orderBy: explicit ?? "date DESC, scheduled_time ASC, asset_id ASC",
    pageSize,
    offset,
    localeFilter,
  });
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

/** One speaker mapping plus the meeting metadata needed to build links. */
export interface SpeakerMappingWithMeta {
  transcript_id: string;
  mapping: SpeakerMapping;
  entry_id: string;
  language_code: string | null;
  asset_id: string | null;
  pv_symbol: string | null;
  part_number: string | null;
  title: string | null;
  date: string | null;
}

/**
 * Every speaker mapping joined to its meeting metadata, for the cross-transcript
 * speaker directory. A meeting (`entry_id`) can have several transcripts — extra
 * languages or re-transcription runs — which would otherwise surface the same
 * statement multiple times. `DISTINCT ON (entry_id)` keeps a single
 * representative transcript per meeting (completed → English → newest). The
 * LATERAL picks one `videos` row per entry (most-recently-seen). Returns the
 * small JSONB mappings only — never the heavy `content` blob.
 */
export async function getSpeakerMappingsWithMeta(): Promise<
  SpeakerMappingWithMeta[]
> {
  const result = await pool.query(
    `SELECT DISTINCT ON (t.entry_id)
            sm.transcript_id, sm.mapping,
            t.entry_id, t.language_code,
            v.asset_id, v.pv_symbol, v.part_number,
            COALESCE(v.clean_title, v.title) AS title, v.date
       FROM webtv.speaker_mappings sm
       JOIN webtv.transcripts t ON t.transcript_id = sm.transcript_id
       LEFT JOIN webtv.videos v ON v.kaltura_id = t.kaltura_id
      WHERE t.transcription_status <> 'error'
      ORDER BY t.entry_id,
               (t.transcription_status = 'completed') DESC,
               (t.language_code = 'en') DESC,
               t.updated_at DESC`,
  );
  return result.rows.map((row) => ({
    transcript_id: row.transcript_id as string,
    mapping: row.mapping as SpeakerMapping,
    entry_id: row.entry_id as string,
    language_code: (row.language_code as string | null) ?? null,
    asset_id: (row.asset_id as string | null) ?? null,
    pv_symbol: (row.pv_symbol as string | null) ?? null,
    part_number: (row.part_number as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    date: row.date ? String(row.date) : null,
  }));
}

export interface ExtractedStatement {
  start: number | null;
  text: string;
}

/**
 * Extract only the specific statements we need (by transcript + index),
 * pulling just the start time and concatenated sentence text out of the JSONB
 * server-side. Avoids transferring whole `content` blobs (avg ~550KB each) when
 * a speaker profile only needs a handful of statements per transcript.
 * Keyed by `${transcriptId}:${statementIndex}`.
 */
export async function getStatementsForRefs(
  refs: Array<{ transcriptId: string; statementIndex: number }>,
): Promise<Map<string, ExtractedStatement>> {
  const out = new Map<string, ExtractedStatement>();
  if (refs.length === 0) return out;

  const tids = refs.map((r) => r.transcriptId);
  const idxs = refs.map((r) => r.statementIndex);
  const result = await pool.query(
    `SELECT p.tid AS transcript_id,
            p.idx AS statement_index,
            -- Apply the realignment offset here too (the speaker feed links into
            -- the player by timestamp), keeping this path aligned with the
            -- display getters. COALESCE: most rows have no offset.
            ((t.content->'statements'->p.idx->>'start')::float8
               + COALESCE(t.time_offset_ms, 0)) AS start,
            (
              SELECT string_agg(sent->>'text', ' ')
                FROM jsonb_array_elements(
                       t.content->'statements'->p.idx->'paragraphs'
                     ) AS para,
                     jsonb_array_elements(para->'sentences') AS sent
            ) AS text
       FROM webtv.transcripts t
       JOIN unnest($1::text[], $2::int[]) AS p(tid, idx)
         ON p.tid = t.transcript_id`,
    [tids, idxs],
  );
  for (const row of result.rows) {
    out.set(`${row.transcript_id}:${row.statement_index}`, {
      start: row.start != null ? Number(row.start) : null,
      text: (row.text as string | null)?.trim() ?? "",
    });
  }
  return out;
}

// Resolve a video by its stable player ID. kaltura_id is the canonical pivot
// (NOT NULL + UNIQUE; see migration 015), so a single equality is sufficient.
export async function getVideoByKalturaId(
  kalturaId: string,
): Promise<VideoRecord | null> {
  const result = await pool.query(
    q(`SELECT * FROM webtv.videos WHERE kaltura_id = ? LIMIT 1`, [kalturaId]),
  );
  if (result.rows.length === 0) return null;
  return mapVideoRow(result.rows[0]);
}

/**
 * For each transcript, return statementIndex → durationMs (end − start) for
 * every statement. Used by the speaker directory to drop short statements
 * (where the camera typically hasn't framed the speaker yet) from counts and
 * feeds at the source.
 */
export async function getStatementDurationsForTranscripts(
  transcriptIds: string[],
): Promise<Map<string, Map<number, number>>> {
  const out = new Map<string, Map<number, number>>();
  if (transcriptIds.length === 0) return out;
  const result = await pool.query(
    `SELECT t.transcript_id,
            (s.ord - 1)::int                       AS statement_index,
            (s.stmt->>'end')::float8
              - (s.stmt->>'start')::float8         AS duration_ms
       FROM webtv.transcripts t,
            jsonb_array_elements(t.content->'statements')
              WITH ORDINALITY AS s(stmt, ord)
      WHERE t.transcript_id = ANY($1::text[])`,
    [transcriptIds],
  );
  for (const row of result.rows) {
    const tid = row.transcript_id as string;
    let inner = out.get(tid);
    if (!inner) {
      inner = new Map();
      out.set(tid, inner);
    }
    const d = row.duration_ms;
    inner.set(Number(row.statement_index), d == null ? 0 : Number(d));
  }
  return out;
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
  /** When the "transcript ready" email was sent to this user, if it has been. */
  emailed_at: Date | null;
}

export async function getUserVideoSubscriptions(
  userId: string,
): Promise<UserVideoSubscription[]> {
  // emailed_at: notification ledger keyed by transcript_id, joined back through
  // transcripts on the canonical kaltura_id pivot.
  const result = await pool.query(
    q(
      `SELECT vs.kaltura_id, vs.language, vs.created_at,
              COALESCE(v.clean_title, v.title) AS title, v.slug,
              (SELECT MAX(stn.sent_at)
                 FROM webtv.sent_transcript_notifications stn
                 JOIN webtv.transcripts t ON t.transcript_id = stn.transcript_id
                WHERE stn.user_id = vs.user_id
                  AND t.kaltura_id = vs.kaltura_id
              ) AS emailed_at
         FROM webtv.video_subscriptions vs
         LEFT JOIN webtv.videos v ON v.kaltura_id = vs.kaltura_id
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
    emailed_at: (row.emailed_at as Date | null) ?? null,
  }));
}

export async function addFeedSubscription(
  userId: string,
  feedKey: string,
  language: string,
): Promise<void> {
  await pool.query(
    q(
      `INSERT INTO webtv.feed_subscriptions (user_id, feed_key, language)
       VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
      [userId, feedKey, language],
    ),
  );
}

export async function removeFeedSubscription(
  userId: string,
  feedKey: string,
  language: string,
): Promise<void> {
  await pool.query(
    q(
      `DELETE FROM webtv.feed_subscriptions
        WHERE user_id = ? AND feed_key = ? AND language = ?`,
      [userId, feedKey, language],
    ),
  );
}

export interface UserFeedSubscription {
  feed_key: string;
  language: string;
}

export async function getUserFeedSubscriptions(
  userId: string,
): Promise<UserFeedSubscription[]> {
  const result = await pool.query(
    q(
      `SELECT feed_key, language FROM webtv.feed_subscriptions WHERE user_id = ?`,
      [userId],
    ),
  );
  return result.rows.map((row) => ({
    feed_key: row.feed_key as string,
    language: row.language as string,
  }));
}

// ── Notification engine queries ───────────────────────────────────────────────

export interface CompletedTranscriptRef {
  transcript_id: string;
  kaltura_id: string;
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
    kaltura_id: row.kaltura_id as string,
    entry_id: row.entry_id as string,
    language_code: (row.language_code as string | null) ?? null,
  }));
}

export interface Recipient {
  user_id: string;
  email: string;
}

// Users with a per-video subscription matching this player ID AND the
// completing transcript's language. Subscriptions are per-(video, language)
// (see `video_subscriptions` PK); dropping the language filter would email
// Spanish subscribers when the Chinese transcript completes, etc.
export async function getVideoSubscribers(
  kalturaId: string,
  language: string,
): Promise<Recipient[]> {
  const result = await pool.query(
    q(
      `SELECT DISTINCT u.id AS user_id, u.email
         FROM webtv.video_subscriptions vs
         JOIN webtv.users u ON u.id = vs.user_id
        WHERE vs.kaltura_id = ?
          AND vs.language = ?`,
      [kalturaId, language],
    ),
  );
  return result.rows.map((row) => ({
    user_id: row.user_id as string,
    email: row.email as string,
  }));
}

// Users subscribed to any of the given feed keys for the given language.
// Feed subscriptions are per-(feed, language) since migration 018; dropping
// the language filter would email everyone subscribed to e.g. "Security
// Council" each time ANY language of a matching meeting completed.
export async function getFeedSubscribers(
  feedKeys: string[],
  language: string,
): Promise<Recipient[]> {
  if (feedKeys.length === 0) return [];
  const result = await pool.query(
    q(
      `SELECT DISTINCT u.id AS user_id, u.email
         FROM webtv.feed_subscriptions fs
         JOIN webtv.users u ON u.id = fs.user_id
        WHERE fs.feed_key = ANY(?)
          AND fs.language = ?`,
      [feedKeys, language],
    ),
  );
  return result.rows.map((row) => ({
    user_id: row.user_id as string,
    email: row.email as string,
  }));
}

// Atomically claim the right to send (user, transcript). Returns true if this
// caller wrote the ledger row, false if another caller had already claimed it.
// Claim BEFORE sending so two concurrent replicas can't both pass the check
// and double-send. The trade: an SMTP failure after a successful claim leaves
// the ledger row in place and the user never gets the email — acceptable
// because (a) SMTP failures are logged + reported to Sentry, and (b) duplicate
// emails are a worse user-visible failure than a rare missed notification.
export async function claimTranscriptNotification(
  userId: string,
  transcriptId: string,
): Promise<boolean> {
  const result = await pool.query(
    q(
      `INSERT INTO webtv.sent_transcript_notifications (user_id, transcript_id)
       VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING user_id`,
      [userId, transcriptId],
    ),
  );
  return (result.rowCount ?? 0) > 0;
}
