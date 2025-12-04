import { createClient } from '@libsql/client/web';
import '@/lib/load-env';

export type TranscriptStatus = 'transcribing' | 'transcribed' | 'identifying_speakers' | 'analyzing_topics' | 'completed' | 'error';

const REQUIRED_VARS = ['TURSO_DB', 'TURSO_TOKEN'] as const;

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
  await client.execute(`
    CREATE TABLE IF NOT EXISTS speaker_mappings (
      transcript_id TEXT PRIMARY KEY,
      mapping TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.execute(`
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
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_entry_id ON transcripts(entry_id)
  `);
  await client.execute(`
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
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_videos_entry_id ON videos(entry_id)
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_videos_date ON videos(date)
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_videos_last_seen ON videos(last_seen)
  `);
  // Add pipeline_lock column if it doesn't exist
  try {
    await client.execute(`ALTER TABLE transcripts ADD COLUMN pipeline_lock TEXT`);
  } catch { /* column already exists */ }
  try {
    await client.execute(`ALTER TABLE transcripts ADD COLUMN error_message TEXT`);
  } catch { /* column already exists */ }
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
  words: Array<{ text: string; start: number; end: number; confidence: number; speaker?: string }>;
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
        words: Array<{ text: string; start: number; end: number; confidence: number }>;
      }>;
      start: number;
      end: number;
      words: Array<{ text: string; start: number; end: number; confidence: number }>;
    }>;
    start: number;
    end: number;
    words: Array<{ text: string; start: number; end: number; confidence: number }>;
  }>;
  topics?: Record<string, { key: string; label: string; description: string }>;
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

export async function getTranscript(
  entryId: string, 
  startTime?: number, 
  endTime?: number,
  completedOnly = true
): Promise<Transcript | null> {
  await ensureInitialized();
  
  let query: string;
  const args: (string | number)[] = [entryId];
  const statusFilter = completedOnly ? "AND status = 'completed'" : "";
  
  if (startTime !== undefined && endTime !== undefined) {
    query = `SELECT * FROM transcripts WHERE entry_id = ? AND start_time = ? AND end_time = ? ${statusFilter} ORDER BY updated_at DESC LIMIT 1`;
    args.push(startTime, endTime);
  } else {
    query = `SELECT * FROM transcripts WHERE entry_id = ? AND start_time IS NULL AND end_time IS NULL ${statusFilter} ORDER BY updated_at DESC LIMIT 1`;
  }
  
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

export async function getAllTranscriptsForEntry(entryId: string): Promise<Transcript[]> {
  await ensureInitialized();
  
  const result = await client.execute({
    sql: 'SELECT * FROM transcripts WHERE entry_id = ? AND status = \'completed\' ORDER BY start_time ASC',
    args: [entryId]
  });
  
  return result.rows.map(row => ({
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

export async function getTranscriptById(transcriptId: string): Promise<Transcript | null> {
  await ensureInitialized();
  const result = await client.execute({ sql: 'SELECT * FROM transcripts WHERE transcript_id = ?', args: [transcriptId] });
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
  content: TranscriptContent
): Promise<void> {
  await ensureInitialized();
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO transcripts (entry_id, transcript_id, start_time, end_time, audio_url, status, language_code, content, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(transcript_id) DO UPDATE SET status = excluded.status, language_code = excluded.language_code, content = excluded.content, updated_at = excluded.updated_at`,
    args: [entryId, transcriptId, startTime, endTime, audioUrl, status, languageCode, JSON.stringify(content), now, now]
  });
}

export async function updateTranscriptStatus(transcriptId: string, status: TranscriptStatus, errorMessage?: string): Promise<void> {
  await ensureInitialized();
  const now = new Date().toISOString();
  await client.execute({
    sql: 'UPDATE transcripts SET status = ?, error_message = ?, updated_at = ? WHERE transcript_id = ?',
    args: [status, errorMessage ?? null, now, transcriptId]
  });
}

export async function updateTranscriptContent(transcriptId: string, content: TranscriptContent): Promise<void> {
  await ensureInitialized();
  await client.execute({
    sql: 'UPDATE transcripts SET content = ?, updated_at = ? WHERE transcript_id = ?',
    args: [JSON.stringify(content), new Date().toISOString(), transcriptId]
  });
}

const PIPELINE_LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export async function tryAcquirePipelineLock(transcriptId: string): Promise<boolean> {
  await ensureInitialized();
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - PIPELINE_LOCK_TIMEOUT_MS).toISOString();
  
  // Try to acquire lock only if no lock or lock is stale
  const result = await client.execute({
    sql: `UPDATE transcripts SET pipeline_lock = ?, updated_at = ? WHERE transcript_id = ? AND (pipeline_lock IS NULL OR pipeline_lock < ?)`,
    args: [now, now, transcriptId, cutoff]
  });
  return result.rowsAffected > 0;
}

export async function releasePipelineLock(transcriptId: string): Promise<void> {
  await ensureInitialized();
  await client.execute({
    sql: 'UPDATE transcripts SET pipeline_lock = NULL, updated_at = ? WHERE transcript_id = ?',
    args: [new Date().toISOString(), transcriptId]
  });
}

export async function deleteTranscript(transcriptId: string): Promise<void> {
  await ensureInitialized();
  
  await client.execute({
    sql: 'DELETE FROM transcripts WHERE transcript_id = ?',
    args: [transcriptId]
  });
}

export async function deleteTranscriptsForEntry(entryId: string): Promise<void> {
  await ensureInitialized();
  
  await client.execute({
    sql: 'DELETE FROM transcripts WHERE entry_id = ?',
    args: [entryId]
  });
}

export async function getAllTranscriptedEntries(): Promise<string[]> {
  await ensureInitialized();
  
  const result = await client.execute(
    'SELECT DISTINCT entry_id FROM transcripts WHERE status = "completed"'
  );
  
  return result.rows.map(row => row.entry_id as string);
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

export async function saveVideo(video: Omit<VideoRecord, 'created_at' | 'updated_at'>): Promise<void> {
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

export async function getVideoByAssetId(assetId: string): Promise<VideoRecord | null> {
  await ensureInitialized();
  
  const result = await client.execute({
    sql: 'SELECT * FROM videos WHERE asset_id = ?',
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

export async function getRecentVideos(daysBack: number = 365): Promise<VideoRecord[]> {
  await ensureInitialized();
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoff = cutoffDate.toISOString().split('T')[0];
  
  const result = await client.execute({
    sql: 'SELECT * FROM videos WHERE last_seen >= ? ORDER BY date DESC, scheduled_time DESC',
    args: [cutoff],
  });
  
  return result.rows.map(row => ({
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

export async function updateVideoEntryId(assetId: string, entryId: string): Promise<void> {
  await ensureInitialized();
  
  await client.execute({
    sql: 'UPDATE videos SET entry_id = ?, updated_at = ? WHERE asset_id = ?',
    args: [entryId, new Date().toISOString(), assetId],
  });
}

export const db = client;

