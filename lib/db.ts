import { Pool } from "pg";
import "@/lib/load-env";
import { extractKalturaId } from "./kaltura";
import { slugFromSymbol } from "./meeting-slug";

export type TranscriptStatus =
  | "scheduled"
  | "transcribing"
  | "identifying_speakers"
  | "analyzing_topics"
  | "analyzing_propositions"
  | "completed"
  | "error";
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

let initialized = false;

async function ensureInitialized() {
  if (initialized) return;
  initialized = true;
}

export interface RawParagraph {
  text: string;
  start: number;
  end: number;
  words: Array<{
    text: string;
    start: number;
    end: number;
    confidence: number;
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
        words: Array<{
          text: string;
          start: number;
          end: number;
          confidence: number;
        }>;
      }>;
      start: number;
      end: number;
      words: Array<{
        text: string;
        start: number;
        end: number;
        confidence: number;
      }>;
    }>;
    start: number;
    end: number;
    words: Array<{
      text: string;
      start: number;
      end: number;
      confidence: number;
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
  status: TranscriptStatus;
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
    status: row.status as TranscriptStatus,
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
  await ensureInitialized();

  const statusFilter = completedOnly ? "AND status = 'completed'" : "";
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
  await ensureInitialized();
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
  status: TranscriptStatus;
  transcript_id: string;
}

export async function getTranscriptLanguagesForEntry(
  entryId: string,
): Promise<TranscriptLanguageInfo[]> {
  await ensureInitialized();
  const result = await pool.query(
    q(
      "SELECT language_code, status, transcript_id FROM webtv.transcripts WHERE entry_id = ? ORDER BY language_code",
      [entryId],
    ),
  );
  return result.rows.map((row) => ({
    language_code: row.language_code as string | null,
    status: row.status as TranscriptStatus,
    transcript_id: row.transcript_id as string,
  }));
}

export async function getTranscriptById(
  transcriptId: string,
): Promise<Transcript | null> {
  await ensureInitialized();
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
  status: TranscriptStatus,
  languageCode: string | null,
  content: TranscriptContent,
  kalturaId: string | null = null,
): Promise<void> {
  await ensureInitialized();
  await pool.query(
    q(
      `INSERT INTO webtv.transcripts (entry_id, kaltura_id, transcript_id, start_time, end_time, audio_url, status, language_code, content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(transcript_id) DO UPDATE SET
         entry_id = EXCLUDED.entry_id,
         kaltura_id = COALESCE(EXCLUDED.kaltura_id, transcripts.kaltura_id),
         audio_url = EXCLUDED.audio_url,
         status = EXCLUDED.status,
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

export async function updateTranscriptStatus(
  transcriptId: string,
  status: TranscriptStatus,
  errorMessage?: string,
): Promise<void> {
  await ensureInitialized();
  await pool.query(
    q(
      "UPDATE webtv.transcripts SET status = ?, error_message = ?, updated_at = NOW() WHERE transcript_id = ?",
      [status, errorMessage ?? null, transcriptId],
    ),
  );
}

export async function updateTranscriptContent(
  transcriptId: string,
  content: TranscriptContent,
): Promise<void> {
  await ensureInitialized();
  await pool.query(
    q(
      "UPDATE webtv.transcripts SET content = ?, updated_at = NOW() WHERE transcript_id = ?",
      [content, transcriptId],
    ),
  );
}

export async function scheduleTranscript(
  assetId: string,
  kalturaId: string,
  startTime: number | null,
  endTime: number | null,
): Promise<string> {
  await ensureInitialized();
  const transcriptId = `scheduled-${assetId}-${Date.now()}`;
  await pool.query(
    q(
      `INSERT INTO webtv.transcripts (entry_id, kaltura_id, transcript_id, start_time, end_time, audio_url, status, language_code, content)
       VALUES (?, ?, ?, ?, ?, ?, 'scheduled', null, '{}')
       ON CONFLICT(transcript_id) DO NOTHING`,
      [
        kalturaId,
        kalturaId,
        transcriptId,
        startTime,
        endTime,
        `pending:${assetId}`,
      ],
    ),
  );
  return transcriptId;
}

export interface ScheduledTranscript {
  transcript_id: string;
  entry_id: string;
  start_time: number | null;
  end_time: number | null;
  audio_url: string;
  created_at: Date;
}

export async function getScheduledTranscripts(): Promise<
  ScheduledTranscript[]
> {
  await ensureInitialized();
  const result = await pool.query(
    `SELECT transcript_id, entry_id, start_time, end_time, audio_url, created_at
     FROM webtv.transcripts WHERE status = 'scheduled' ORDER BY created_at ASC`,
  );
  return result.rows.map((row) => ({
    transcript_id: row.transcript_id as string,
    entry_id: row.entry_id as string,
    start_time: row.start_time as number | null,
    end_time: row.end_time as number | null,
    audio_url: row.audio_url as string,
    created_at: row.created_at as Date,
  }));
}

export async function tryAcquirePipelineLock(
  transcriptId: string,
): Promise<boolean> {
  await ensureInitialized();
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
  await ensureInitialized();
  await pool.query(
    q(
      "UPDATE webtv.transcripts SET pipeline_lock = NULL, updated_at = NOW() WHERE transcript_id = ?",
      [transcriptId],
    ),
  );
}

export async function deleteTranscript(transcriptId: string): Promise<void> {
  await ensureInitialized();
  await pool.query(
    q("DELETE FROM webtv.processing_usage_events WHERE transcript_id = ?", [
      transcriptId,
    ]),
  );
  await pool.query(
    q("DELETE FROM webtv.transcripts WHERE transcript_id = ?", [transcriptId]),
  );
}

export async function deleteTranscriptsForEntry(
  entryId: string,
  languageCode?: string,
): Promise<void> {
  await ensureInitialized();
  const langFilter = languageCode ? " AND language_code = ?" : "";
  const args = languageCode ? [entryId, languageCode] : [entryId];

  await pool.query(
    q(
      `DELETE FROM webtv.processing_usage_events WHERE transcript_id IN (
         SELECT transcript_id FROM webtv.transcripts WHERE entry_id = ?${langFilter}
       )`,
      args,
    ),
  );
  await pool.query(
    q(`DELETE FROM webtv.transcripts WHERE entry_id = ?${langFilter}`, args),
  );
}

export async function insertProcessingUsageEvent(
  event: ProcessingUsageEventInsert,
): Promise<void> {
  await ensureInitialized();
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
  await ensureInitialized();
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
  await ensureInitialized();
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
  await ensureInitialized();
  const conditions: string[] = ["kaltura_id = ?"];
  const args: unknown[] = [kalturaId];
  if (completedOnly) conditions.push("status = 'completed'");
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

export async function getAllTranscriptedEntries(): Promise<string[]> {
  await ensureInitialized();
  // Return identifiers that match `videos.entry_id`. Some legacy transcripts
  // were keyed by a resolved (canonical) entry that differs from the
  // pre-redirect Kaltura ID stored on `videos.entry_id`, so we also accept a
  // match via `videos.kaltura_id` (the stable player ID) when available.
  const result = await pool.query(
    `SELECT DISTINCT v.entry_id
       FROM webtv.videos v
       JOIN webtv.transcripts t
         ON t.status = 'completed'
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
    q(
      "SELECT slug FROM webtv.videos WHERE slug = ? OR slug LIKE ?",
      [base, `${base}-part-%`],
    ),
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
  await ensureInitialized();

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
  await ensureInitialized();
  const result = await pool.query(
    q("SELECT * FROM webtv.videos WHERE asset_id = ?", [assetId]),
  );
  if (result.rows.length === 0) return null;
  return mapVideoRow(result.rows[0]);
}

export async function getVideoBySlug(
  slug: string,
): Promise<VideoRecord | null> {
  await ensureInitialized();
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
  await ensureInitialized();
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
  await ensureInitialized();
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
  await ensureInitialized();

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
    } catch {
      // fts_vec column may not exist yet in dev — fall through to LIKE
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
  await ensureInitialized();

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
  await ensureInitialized();
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
  await ensureInitialized();
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
  await ensureInitialized();
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
  await ensureInitialized();
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
  await ensureInitialized();
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
  await ensureInitialized();
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
  await ensureInitialized();
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
  await ensureInitialized();
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
