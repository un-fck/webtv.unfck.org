import { createClient } from "@libsql/client/web";
import "@/lib/load-env";

export type TranscriptStatus =
  | "scheduled"
  | "transcribing"
  | "transcribed"
  | "identifying_speakers"
  | "analyzing_topics"
  | "analyzing_propositions"
  | "completed"
  | "error";
export type ProcessingUsageProvider = "openai" | "assemblyai" | "gemini";
export type ProcessingUsageStatus = "success" | "error";

const REQUIRED_VARS = ["TURSO_DB", "TURSO_TOKEN"] as const;

REQUIRED_VARS.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required env var ${key} for Turso`);
  }
});

const client = createClient({
  url: process.env.TURSO_DB!,
  authToken: process.env.TURSO_TOKEN!,
});

let initialized = false;

async function ensureInitialized() {
  if (initialized) return;

  // Create all tables in parallel
  await Promise.all([
    client.execute(`
      CREATE TABLE IF NOT EXISTS speaker_mappings (
        transcript_id TEXT PRIMARY KEY,
        mapping TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    client.execute(`
      CREATE TABLE IF NOT EXISTS transcripts (
        entry_id TEXT NOT NULL,
        transcript_id TEXT NOT NULL PRIMARY KEY,
        start_time REAL,
        end_time REAL,
        audio_url TEXT NOT NULL,
        status TEXT NOT NULL,
        language_code TEXT,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    client.execute(`
      CREATE TABLE IF NOT EXISTS videos (
        asset_id TEXT PRIMARY KEY,
        entry_id TEXT,
        title TEXT NOT NULL,
        clean_title TEXT,
        date TEXT NOT NULL,
        scheduled_time TEXT,
        duration INTEGER,
        url TEXT NOT NULL,
        body TEXT,
        category TEXT,
        event_code TEXT,
        event_type TEXT,
        session_number TEXT,
        part_number TEXT,
        last_seen TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    client.execute(`
      CREATE TABLE IF NOT EXISTS processing_usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transcript_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        stage TEXT NOT NULL,
        operation TEXT NOT NULL,
        status TEXT NOT NULL,
        model TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        reasoning_tokens INTEGER,
        cached_input_tokens INTEGER,
        total_tokens INTEGER,
        usage_hours REAL,
        usage_seconds INTEGER,
        usage_quantity_type TEXT,
        usage_multiplier REAL,
        rate_card_version TEXT,
        base_rate_per_hour_usd REAL,
        feature_rate_per_hour_usd REAL,
        pricing_meta TEXT,
        duration_ms INTEGER,
        request_meta TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
  ]);

  // Create all indexes in parallel (tables must exist first)
  await Promise.all([
    client.execute(
      `CREATE INDEX IF NOT EXISTS idx_entry_id ON transcripts(entry_id)`,
    ),
    client.execute(
      `CREATE INDEX IF NOT EXISTS idx_videos_entry_id ON videos(entry_id)`,
    ),
    client.execute(
      `CREATE INDEX IF NOT EXISTS idx_videos_date ON videos(date)`,
    ),
    client.execute(
      `CREATE INDEX IF NOT EXISTS idx_videos_last_seen ON videos(last_seen)`,
    ),
    client.execute(
      `CREATE INDEX IF NOT EXISTS idx_usage_transcript_id ON processing_usage_events(transcript_id)`,
    ),
    client.execute(
      `CREATE INDEX IF NOT EXISTS idx_usage_provider_stage ON processing_usage_events(provider, stage)`,
    ),
    client.execute(
      `CREATE INDEX IF NOT EXISTS idx_usage_created_at ON processing_usage_events(created_at)`,
    ),
  ]);

  // Add new columns if they don't exist (parallel, errors are expected on re-runs)
  await Promise.all([
    client
      .execute(`ALTER TABLE transcripts ADD COLUMN pipeline_lock TEXT`)
      .catch(() => {
        /* column already exists */
      }),
    client
      .execute(`ALTER TABLE transcripts ADD COLUMN error_message TEXT`)
      .catch(() => {
        /* column already exists */
      }),
  ]);

  // Normalize language codes: tag NULL and legacy codes (e.g. 'en_us') as 'en'
  await Promise.all([
    client
      .execute(
        `UPDATE transcripts SET language_code = 'en' WHERE language_code IS NULL`,
      )
      .catch(() => {}),
    client
      .execute(
        `UPDATE transcripts SET language_code = 'en' WHERE language_code LIKE 'en%' AND language_code != 'en'`,
      )
      .catch(() => {}),
  ]);

  // Composite index for language-filtered lookups
  await client
    .execute(
      `CREATE INDEX IF NOT EXISTS idx_transcripts_entry_lang ON transcripts(entry_id, language_code)`,
    )
    .catch(() => {
      /* index already exists */
    });

  initialized = true;
}

export async function getTursoClient() {
  await ensureInitialized();
  return client;
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
  transcript_id: string;
  start_time: number | null;
  end_time: number | null;
  audio_url: string;
  status: TranscriptStatus;
  language_code: string | null;
  content: TranscriptContent;
  pipeline_lock: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
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
  pricing_meta?: string | null;
  duration_ms?: number | null;
  request_meta?: string | null;
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
  pricing_meta: string | null;
  duration_ms: number | null;
  request_meta: string | null;
  error_message: string | null;
  created_at: string;
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

export async function getTranscript(
  entryId: string,
  startTime?: number,
  endTime?: number,
  completedOnly = true,
  languageCode?: string,
): Promise<Transcript | null> {
  await ensureInitialized();

  let query: string;
  const args: (string | number)[] = [entryId];
  const statusFilter = completedOnly ? "AND status = 'completed'" : "";
  const langFilter = languageCode ? "AND language_code = ?" : "";

  if (startTime !== undefined && endTime !== undefined) {
    query = `SELECT * FROM transcripts WHERE entry_id = ? AND start_time = ? AND end_time = ? ${statusFilter} ${langFilter} ORDER BY updated_at DESC LIMIT 1`;
    args.push(startTime, endTime);
  } else {
    query = `SELECT * FROM transcripts WHERE entry_id = ? AND start_time IS NULL AND end_time IS NULL ${statusFilter} ${langFilter} ORDER BY updated_at DESC LIMIT 1`;
  }
  if (languageCode) args.push(languageCode);

  const result = await client.execute({ sql: query, args });
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    entry_id: row.entry_id as string,
    transcript_id: row.transcript_id as string,
    start_time: row.start_time as number | null,
    end_time: row.end_time as number | null,
    audio_url: row.audio_url as string,
    status: row.status as TranscriptStatus,
    language_code: row.language_code as string | null,
    content: JSON.parse(row.content as string),
    pipeline_lock: row.pipeline_lock as string | null,
    error_message: row.error_message as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function getAllTranscriptsForEntry(
  entryId: string,
): Promise<Transcript[]> {
  await ensureInitialized();

  const result = await client.execute({
    sql: "SELECT * FROM transcripts WHERE entry_id = ? AND status = 'completed' ORDER BY start_time ASC",
    args: [entryId],
  });

  return result.rows.map((row) => ({
    entry_id: row.entry_id as string,
    transcript_id: row.transcript_id as string,
    start_time: row.start_time as number | null,
    end_time: row.end_time as number | null,
    audio_url: row.audio_url as string,
    status: row.status as TranscriptStatus,
    language_code: row.language_code as string | null,
    content: JSON.parse(row.content as string),
    pipeline_lock: row.pipeline_lock as string | null,
    error_message: row.error_message as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }));
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

  const result = await client.execute({
    sql: "SELECT language_code, status, transcript_id FROM transcripts WHERE entry_id = ? ORDER BY language_code",
    args: [entryId],
  });

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
  const result = await client.execute({
    sql: "SELECT * FROM transcripts WHERE transcript_id = ?",
    args: [transcriptId],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    entry_id: row.entry_id as string,
    transcript_id: row.transcript_id as string,
    start_time: row.start_time as number | null,
    end_time: row.end_time as number | null,
    audio_url: row.audio_url as string,
    status: row.status as TranscriptStatus,
    language_code: row.language_code as string | null,
    content: JSON.parse(row.content as string),
    pipeline_lock: row.pipeline_lock as string | null,
    error_message: row.error_message as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
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
): Promise<void> {
  await ensureInitialized();
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO transcripts (entry_id, transcript_id, start_time, end_time, audio_url, status, language_code, content, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(transcript_id) DO UPDATE SET status = excluded.status, language_code = excluded.language_code, content = excluded.content, updated_at = excluded.updated_at`,
    args: [
      entryId,
      transcriptId,
      startTime,
      endTime,
      audioUrl,
      status,
      languageCode,
      JSON.stringify(content),
      now,
      now,
    ],
  });
}

export async function updateTranscriptStatus(
  transcriptId: string,
  status: TranscriptStatus,
  errorMessage?: string,
): Promise<void> {
  await ensureInitialized();
  const now = new Date().toISOString();
  await client.execute({
    sql: "UPDATE transcripts SET status = ?, error_message = ?, updated_at = ? WHERE transcript_id = ?",
    args: [status, errorMessage ?? null, now, transcriptId],
  });
}

export async function updateTranscriptContent(
  transcriptId: string,
  content: TranscriptContent,
): Promise<void> {
  await ensureInitialized();
  await client.execute({
    sql: "UPDATE transcripts SET content = ?, updated_at = ? WHERE transcript_id = ?",
    args: [JSON.stringify(content), new Date().toISOString(), transcriptId],
  });
}

export async function scheduleTranscript(
  assetId: string,
  kalturaId: string,
  startTime: number | null,
  endTime: number | null,
): Promise<string> {
  await ensureInitialized();
  const transcriptId = `scheduled-${assetId}-${Date.now()}`;
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO transcripts (entry_id, transcript_id, start_time, end_time, audio_url, status, language_code, content, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'scheduled', null, '{}', ?, ?)
          ON CONFLICT(transcript_id) DO NOTHING`,
    args: [
      kalturaId,
      transcriptId,
      startTime,
      endTime,
      `pending:${assetId}`,
      now,
      now,
    ],
  });
  return transcriptId;
}

export interface ScheduledTranscript {
  transcript_id: string;
  entry_id: string; // kaltura_id at schedule time (may be the asset_id before resolution)
  start_time: number | null;
  end_time: number | null;
  audio_url: string; // contains "pending:<assetId>" for unresolved entries
  created_at: string;
}

export async function getScheduledTranscripts(): Promise<
  ScheduledTranscript[]
> {
  await ensureInitialized();
  const result = await client.execute(
    `SELECT transcript_id, entry_id, start_time, end_time, audio_url, created_at
     FROM transcripts WHERE status = 'scheduled' ORDER BY created_at ASC`,
  );
  return result.rows.map((row) => ({
    transcript_id: row.transcript_id as string,
    entry_id: row.entry_id as string,
    start_time: row.start_time as number | null,
    end_time: row.end_time as number | null,
    audio_url: row.audio_url as string,
    created_at: row.created_at as string,
  }));
}

const PIPELINE_LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export async function tryAcquirePipelineLock(
  transcriptId: string,
): Promise<boolean> {
  await ensureInitialized();
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - PIPELINE_LOCK_TIMEOUT_MS).toISOString();

  // Try to acquire lock only if no lock or lock is stale
  const result = await client.execute({
    sql: `UPDATE transcripts SET pipeline_lock = ?, updated_at = ? WHERE transcript_id = ? AND (pipeline_lock IS NULL OR pipeline_lock < ?)`,
    args: [now, now, transcriptId, cutoff],
  });
  return result.rowsAffected > 0;
}

export async function releasePipelineLock(transcriptId: string): Promise<void> {
  await ensureInitialized();
  await client.execute({
    sql: "UPDATE transcripts SET pipeline_lock = NULL, updated_at = ? WHERE transcript_id = ?",
    args: [new Date().toISOString(), transcriptId],
  });
}

export async function deleteTranscript(transcriptId: string): Promise<void> {
  await ensureInitialized();

  await client.execute({
    sql: "DELETE FROM processing_usage_events WHERE transcript_id = ?",
    args: [transcriptId],
  });
  await client.execute({
    sql: "DELETE FROM transcripts WHERE transcript_id = ?",
    args: [transcriptId],
  });
}

export async function deleteTranscriptsForEntry(
  entryId: string,
  languageCode?: string,
): Promise<void> {
  await ensureInitialized();

  const langFilter = languageCode ? " AND language_code = ?" : "";
  const args = languageCode ? [entryId, languageCode] : [entryId];

  await client.execute({
    sql: `DELETE FROM processing_usage_events WHERE transcript_id IN (
      SELECT transcript_id FROM transcripts WHERE entry_id = ?${langFilter}
    )`,
    args,
  });
  await client.execute({
    sql: `DELETE FROM transcripts WHERE entry_id = ?${langFilter}`,
    args,
  });
}

export async function insertProcessingUsageEvent(
  event: ProcessingUsageEventInsert,
): Promise<void> {
  await ensureInitialized();
  await client.execute({
    sql: `INSERT INTO processing_usage_events (
      transcript_id, provider, stage, operation, status, model,
      input_tokens, output_tokens, reasoning_tokens, cached_input_tokens, total_tokens,
      usage_hours, usage_seconds, usage_quantity_type, usage_multiplier,
      rate_card_version, base_rate_per_hour_usd, feature_rate_per_hour_usd, pricing_meta,
      duration_ms, request_meta, error_message, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
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
      new Date().toISOString(),
    ],
  });
}

export async function listProcessingUsageEventsByTranscript(
  transcriptId: string,
): Promise<ProcessingUsageEvent[]> {
  await ensureInitialized();
  const result = await client.execute({
    sql: "SELECT * FROM processing_usage_events WHERE transcript_id = ? ORDER BY created_at ASC, id ASC",
    args: [transcriptId],
  });
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
    pricing_meta: (row.pricing_meta as string) ?? null,
    duration_ms: (row.duration_ms as number) ?? null,
    request_meta: (row.request_meta as string) ?? null,
    error_message: (row.error_message as string) ?? null,
    created_at: row.created_at as string,
  }));
}

export async function getProcessingUsageSummaryByTranscript(
  transcriptId: string,
): Promise<ProcessingUsageSummaryRow[]> {
  await ensureInitialized();
  const result = await client.execute({
    sql: `SELECT
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
        WHEN usage_hours IS NOT NULL THEN usage_hours * (COALESCE(base_rate_per_hour_usd, 0) + COALESCE(feature_rate_per_hour_usd, 0))
        ELSE 0
      END), 0) AS estimated_cost_usd
      FROM processing_usage_events
      WHERE transcript_id = ?
      GROUP BY provider, stage
      ORDER BY provider, stage`,
    args: [transcriptId],
  });

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

export async function getAllTranscriptedEntries(): Promise<string[]> {
  await ensureInitialized();

  const result = await client.execute(
    'SELECT DISTINCT entry_id FROM transcripts WHERE status = "completed"',
  );

  return result.rows.map((row) => row.entry_id as string);
}

export interface VideoRecord {
  asset_id: string;
  entry_id: string | null;
  title: string;
  clean_title: string | null;
  date: string;
  scheduled_time: string | null;
  duration: number | null;
  url: string;
  body: string | null;
  category: string | null;
  event_code: string | null;
  event_type: string | null;
  session_number: string | null;
  part_number: string | null;
  last_seen: string;
  created_at: string;
  updated_at: string;
}

export async function saveVideo(
  video: Omit<VideoRecord, "created_at" | "updated_at">,
): Promise<void> {
  await ensureInitialized();

  const now = new Date().toISOString();

  await client.execute({
    sql: `
      INSERT INTO videos (
        asset_id, entry_id, title, clean_title, date, scheduled_time,
        duration, url, body, category, event_code, event_type,
        session_number, part_number, last_seen, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(asset_id) DO UPDATE SET
        entry_id = COALESCE(excluded.entry_id, entry_id),
        title = excluded.title,
        clean_title = excluded.clean_title,
        scheduled_time = excluded.scheduled_time,
        duration = excluded.duration,
        body = excluded.body,
        category = excluded.category,
        event_code = excluded.event_code,
        event_type = excluded.event_type,
        session_number = excluded.session_number,
        part_number = excluded.part_number,
        last_seen = excluded.last_seen,
        updated_at = excluded.updated_at
    `,
    args: [
      video.asset_id,
      video.entry_id,
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
      video.last_seen,
      now,
      now,
    ],
  });
}

export async function getVideoByAssetId(
  assetId: string,
): Promise<VideoRecord | null> {
  await ensureInitialized();

  const result = await client.execute({
    sql: "SELECT * FROM videos WHERE asset_id = ?",
    args: [assetId],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    asset_id: row.asset_id as string,
    entry_id: row.entry_id as string | null,
    title: row.title as string,
    clean_title: row.clean_title as string | null,
    date: row.date as string,
    scheduled_time: row.scheduled_time as string | null,
    duration: row.duration as number | null,
    url: row.url as string,
    body: row.body as string | null,
    category: row.category as string | null,
    event_code: row.event_code as string | null,
    event_type: row.event_type as string | null,
    session_number: row.session_number as string | null,
    part_number: row.part_number as string | null,
    last_seen: row.last_seen as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function getRecentVideos(
  daysBack: number = 365,
): Promise<VideoRecord[]> {
  await ensureInitialized();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoff = cutoffDate.toISOString().split("T")[0];

  const result = await client.execute({
    sql: "SELECT * FROM videos WHERE last_seen >= ? ORDER BY date DESC, scheduled_time DESC",
    args: [cutoff],
  });

  return result.rows.map((row) => ({
    asset_id: row.asset_id as string,
    entry_id: row.entry_id as string | null,
    title: row.title as string,
    clean_title: row.clean_title as string | null,
    date: row.date as string,
    scheduled_time: row.scheduled_time as string | null,
    duration: row.duration as number | null,
    url: row.url as string,
    body: row.body as string | null,
    category: row.category as string | null,
    event_code: row.event_code as string | null,
    event_type: row.event_type as string | null,
    session_number: row.session_number as string | null,
    part_number: row.part_number as string | null,
    last_seen: row.last_seen as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }));
}

export async function updateVideoEntryId(
  assetId: string,
  entryId: string,
): Promise<void> {
  await ensureInitialized();

  await client.execute({
    sql: "UPDATE videos SET entry_id = ?, updated_at = ? WHERE asset_id = ?",
    args: [entryId, new Date().toISOString(), assetId],
  });
}

export async function searchVideos(
  query: string,
  limit = 50,
  offset = 0,
): Promise<VideoRecord[]> {
  await ensureInitialized();

  const pattern = `%${query}%`;
  const result = await client.execute({
    sql: "SELECT * FROM videos WHERE title LIKE ? OR clean_title LIKE ? ORDER BY date DESC, scheduled_time DESC LIMIT ? OFFSET ?",
    args: [pattern, pattern, limit, offset],
  });

  return result.rows.map((row) => ({
    asset_id: row.asset_id as string,
    entry_id: row.entry_id as string | null,
    title: row.title as string,
    clean_title: row.clean_title as string | null,
    date: row.date as string,
    scheduled_time: row.scheduled_time as string | null,
    duration: row.duration as number | null,
    url: row.url as string,
    body: row.body as string | null,
    category: row.category as string | null,
    event_code: row.event_code as string | null,
    event_type: row.event_type as string | null,
    session_number: row.session_number as string | null,
    part_number: row.part_number as string | null,
    last_seen: row.last_seen as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }));
}

export const db = client;
