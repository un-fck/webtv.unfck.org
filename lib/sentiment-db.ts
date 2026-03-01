import { getTursoClient } from './turso';
import type {
  TrackedItem,
  TrackedItemType,
  SentimentObservation,
  SentimentDimensions,
  TrackedItemMatch,
  TrackedItemSummary,
  SentimentTimelinePoint,
  CountrySentimentRow,
  SentimentHeatmapCell,
  Stance,
} from './sentiment-types';

// ─── Tracked Items CRUD ──────────────────────────────────────────────

export async function createTrackedItem(item: {
  id: string;
  type: TrackedItemType;
  title: string;
  slug: string;
  description: string;
  reference_text?: string | null;
  reference_document?: string | null;
  matching_keywords?: string[];
}): Promise<void> {
  const client = await getTursoClient();
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO tracked_items (id, type, title, slug, description, reference_text, reference_document, matching_keywords, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      item.id,
      item.type,
      item.title,
      item.slug,
      item.description,
      item.reference_text ?? null,
      item.reference_document ?? null,
      item.matching_keywords ? JSON.stringify(item.matching_keywords) : null,
      now,
      now,
    ],
  });
}

export async function getTrackedItems(): Promise<TrackedItem[]> {
  const client = await getTursoClient();
  const result = await client.execute('SELECT * FROM tracked_items ORDER BY created_at DESC');
  return result.rows.map(parseTrackedItemRow);
}

export async function getTrackedItemBySlug(slug: string): Promise<TrackedItem | null> {
  const client = await getTursoClient();
  const result = await client.execute({
    sql: 'SELECT * FROM tracked_items WHERE slug = ?',
    args: [slug],
  });
  if (result.rows.length === 0) return null;
  return parseTrackedItemRow(result.rows[0]);
}

export async function getTrackedItemById(id: string): Promise<TrackedItem | null> {
  const client = await getTursoClient();
  const result = await client.execute({
    sql: 'SELECT * FROM tracked_items WHERE id = ?',
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return parseTrackedItemRow(result.rows[0]);
}

export async function updateTrackedItem(id: string, updates: {
  title?: string;
  description?: string;
  reference_text?: string | null;
  reference_document?: string | null;
  matching_keywords?: string[];
}): Promise<void> {
  const client = await getTursoClient();
  const sets: string[] = [];
  const args: (string | null)[] = [];

  if (updates.title !== undefined) { sets.push('title = ?'); args.push(updates.title); }
  if (updates.description !== undefined) { sets.push('description = ?'); args.push(updates.description); }
  if (updates.reference_text !== undefined) { sets.push('reference_text = ?'); args.push(updates.reference_text); }
  if (updates.reference_document !== undefined) { sets.push('reference_document = ?'); args.push(updates.reference_document); }
  if (updates.matching_keywords !== undefined) { sets.push('matching_keywords = ?'); args.push(JSON.stringify(updates.matching_keywords)); }

  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  args.push(new Date().toISOString());
  args.push(id);

  await client.execute({
    sql: `UPDATE tracked_items SET ${sets.join(', ')} WHERE id = ?`,
    args,
  });
}

export async function deleteTrackedItem(id: string): Promise<void> {
  const client = await getTursoClient();
  // Cascade: delete observations and matches first
  await client.execute({ sql: 'DELETE FROM sentiment_observations WHERE tracked_item_id = ?', args: [id] });
  await client.execute({ sql: 'DELETE FROM tracked_item_matches WHERE tracked_item_id = ?', args: [id] });
  await client.execute({ sql: 'DELETE FROM tracked_items WHERE id = ?', args: [id] });
}

export async function getTrackedItemsWithSummary(): Promise<TrackedItemSummary[]> {
  const client = await getTursoClient();
  const result = await client.execute(`
    SELECT
      ti.*,
      COALESCE(stats.meeting_count, 0) as meeting_count,
      COALESCE(stats.observation_count, 0) as observation_count,
      stats.latest_meeting_date,
      stats.avg_overall
    FROM tracked_items ti
    LEFT JOIN (
      SELECT
        tracked_item_id,
        COUNT(DISTINCT transcript_id) as meeting_count,
        COUNT(*) as observation_count,
        MAX(meeting_date) as latest_meeting_date,
        AVG(sentiment_overall) as avg_overall
      FROM sentiment_observations
      GROUP BY tracked_item_id
    ) stats ON stats.tracked_item_id = ti.id
    ORDER BY ti.created_at DESC
  `);
  return result.rows.map(row => ({
    ...parseTrackedItemRow(row),
    meeting_count: Number(row.meeting_count) || 0,
    observation_count: Number(row.observation_count) || 0,
    latest_meeting_date: (row.latest_meeting_date as string) ?? null,
    avg_overall: row.avg_overall != null ? Number(row.avg_overall) : null,
  }));
}

// ─── Sentiment Observations ──────────────────────────────────────────

export async function insertSentimentObservations(observations: Array<{
  tracked_item_id: string;
  transcript_id: string;
  entry_id: string;
  meeting_date: string;
  speaker_name: string | null;
  speaker_affiliation: string | null;
  speaker_group: string | null;
  speaker_function: string | null;
  stance: Stance;
  sentiment: SentimentDimensions;
  sentiment_overall: number;
  summary: string;
  key_quote: string | null;
  quote_statement_index: number | null;
  relevance_score: number;
  analyzed_statement_count: number;
}>): Promise<void> {
  if (observations.length === 0) return;
  const client = await getTursoClient();
  const now = new Date().toISOString();

  for (const obs of observations) {
    await client.execute({
      sql: `INSERT INTO sentiment_observations (
        tracked_item_id, transcript_id, entry_id, meeting_date,
        speaker_name, speaker_affiliation, speaker_group, speaker_function,
        stance, sentiment_urgency, sentiment_enthusiasm, sentiment_frustration,
        sentiment_concern, sentiment_confidence, sentiment_flexibility, sentiment_formality,
        sentiment_overall, summary, key_quote, quote_statement_index,
        relevance_score, analyzed_statement_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        obs.tracked_item_id, obs.transcript_id, obs.entry_id, obs.meeting_date,
        obs.speaker_name, obs.speaker_affiliation, obs.speaker_group, obs.speaker_function,
        obs.stance, obs.sentiment.urgency, obs.sentiment.enthusiasm, obs.sentiment.frustration,
        obs.sentiment.concern, obs.sentiment.confidence, obs.sentiment.flexibility, obs.sentiment.formality,
        obs.sentiment_overall, obs.summary, obs.key_quote, obs.quote_statement_index,
        obs.relevance_score, obs.analyzed_statement_count, now,
      ],
    });
  }
}

export async function getSentimentObservationsForItem(trackedItemId: string): Promise<SentimentObservation[]> {
  const client = await getTursoClient();
  const result = await client.execute({
    sql: 'SELECT * FROM sentiment_observations WHERE tracked_item_id = ? ORDER BY meeting_date DESC, speaker_affiliation ASC',
    args: [trackedItemId],
  });
  return result.rows.map(parseSentimentObservationRow);
}

export async function deleteSentimentObservationsForTranscript(transcriptId: string): Promise<void> {
  const client = await getTursoClient();
  await client.execute({
    sql: 'DELETE FROM sentiment_observations WHERE transcript_id = ?',
    args: [transcriptId],
  });
}

// ─── Tracked Item Matches ────────────────────────────────────────────

export async function insertTrackedItemMatch(match: {
  tracked_item_id: string;
  transcript_id: string;
  matched_topic_key: string | null;
  match_method: 'llm' | 'keyword' | 'manual';
  match_confidence: number;
}): Promise<void> {
  const client = await getTursoClient();
  await client.execute({
    sql: `INSERT INTO tracked_item_matches (tracked_item_id, transcript_id, matched_topic_key, match_method, match_confidence, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(tracked_item_id, transcript_id) DO UPDATE SET
            matched_topic_key = excluded.matched_topic_key,
            match_method = excluded.match_method,
            match_confidence = excluded.match_confidence`,
    args: [
      match.tracked_item_id,
      match.transcript_id,
      match.matched_topic_key,
      match.match_method,
      match.match_confidence,
      new Date().toISOString(),
    ],
  });
}

export async function getMatchesForTranscript(transcriptId: string): Promise<TrackedItemMatch[]> {
  const client = await getTursoClient();
  const result = await client.execute({
    sql: 'SELECT * FROM tracked_item_matches WHERE transcript_id = ? ORDER BY match_confidence DESC',
    args: [transcriptId],
  });
  return result.rows.map(row => ({
    id: Number(row.id),
    tracked_item_id: row.tracked_item_id as string,
    transcript_id: row.transcript_id as string,
    matched_topic_key: (row.matched_topic_key as string) ?? null,
    match_method: row.match_method as 'llm' | 'keyword' | 'manual',
    match_confidence: Number(row.match_confidence),
    created_at: row.created_at as string,
  }));
}

export async function deleteMatchesForTranscript(transcriptId: string): Promise<void> {
  const client = await getTursoClient();
  await client.execute({
    sql: 'DELETE FROM tracked_item_matches WHERE transcript_id = ?',
    args: [transcriptId],
  });
}

// ─── Aggregation Queries ─────────────────────────────────────────────

export async function getSentimentTimeline(
  trackedItemId: string,
  filters?: { affiliation?: string; group?: string; dateFrom?: string; dateTo?: string },
): Promise<SentimentTimelinePoint[]> {
  const client = await getTursoClient();
  const conditions = ['so.tracked_item_id = ?'];
  const args: (string | number)[] = [trackedItemId];

  if (filters?.affiliation) { conditions.push('so.speaker_affiliation = ?'); args.push(filters.affiliation); }
  if (filters?.group) { conditions.push('so.speaker_group = ?'); args.push(filters.group); }
  if (filters?.dateFrom) { conditions.push('so.meeting_date >= ?'); args.push(filters.dateFrom); }
  if (filters?.dateTo) { conditions.push('so.meeting_date <= ?'); args.push(filters.dateTo); }

  const result = await client.execute({
    sql: `
      SELECT
        so.meeting_date,
        so.entry_id,
        v.clean_title as video_title,
        AVG(so.sentiment_overall) as avg_overall,
        AVG(so.sentiment_urgency) as avg_urgency,
        AVG(so.sentiment_frustration) as avg_frustration,
        AVG(so.sentiment_enthusiasm) as avg_enthusiasm,
        AVG(so.sentiment_flexibility) as avg_flexibility,
        COUNT(*) as observation_count,
        SUM(CASE WHEN so.stance = 'support' THEN 1 ELSE 0 END) as support_count,
        SUM(CASE WHEN so.stance = 'oppose' THEN 1 ELSE 0 END) as oppose_count,
        SUM(CASE WHEN so.stance = 'conditional' THEN 1 ELSE 0 END) as conditional_count,
        SUM(CASE WHEN so.stance = 'neutral' THEN 1 ELSE 0 END) as neutral_count
      FROM sentiment_observations so
      LEFT JOIN videos v ON v.entry_id = so.entry_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY so.meeting_date, so.entry_id
      ORDER BY so.meeting_date ASC
    `,
    args,
  });

  return result.rows.map(row => ({
    meeting_date: row.meeting_date as string,
    entry_id: row.entry_id as string,
    video_title: (row.video_title as string) ?? null,
    avg_overall: Number(row.avg_overall),
    avg_urgency: Number(row.avg_urgency),
    avg_frustration: Number(row.avg_frustration),
    avg_enthusiasm: Number(row.avg_enthusiasm),
    avg_flexibility: Number(row.avg_flexibility),
    observation_count: Number(row.observation_count),
    support_count: Number(row.support_count),
    oppose_count: Number(row.oppose_count),
    conditional_count: Number(row.conditional_count),
    neutral_count: Number(row.neutral_count),
  }));
}

export async function getCountrySentimentSummary(trackedItemId: string): Promise<CountrySentimentRow[]> {
  const client = await getTursoClient();
  const result = await client.execute({
    sql: `
      SELECT
        so.speaker_affiliation,
        AVG(so.sentiment_overall) as avg_overall,
        AVG(so.sentiment_urgency) as avg_urgency,
        AVG(so.sentiment_frustration) as avg_frustration,
        COUNT(*) as observation_count,
        COUNT(DISTINCT so.transcript_id) as meetings_appeared
      FROM sentiment_observations so
      WHERE so.tracked_item_id = ?
        AND so.speaker_affiliation IS NOT NULL
      GROUP BY so.speaker_affiliation
      ORDER BY avg_overall DESC
    `,
    args: [trackedItemId],
  });

  // Get latest stance per country
  const latestStances = await client.execute({
    sql: `
      SELECT speaker_affiliation, stance
      FROM sentiment_observations
      WHERE tracked_item_id = ?
        AND speaker_affiliation IS NOT NULL
        AND id IN (
          SELECT MAX(id) FROM sentiment_observations
          WHERE tracked_item_id = ?
            AND speaker_affiliation IS NOT NULL
          GROUP BY speaker_affiliation
        )
    `,
    args: [trackedItemId, trackedItemId],
  });
  const stanceMap = new Map(latestStances.rows.map(r => [r.speaker_affiliation as string, r.stance as string]));

  return result.rows.map(row => ({
    speaker_affiliation: row.speaker_affiliation as string,
    country_name: null, // resolved on the client with country name map
    avg_overall: Number(row.avg_overall),
    avg_urgency: Number(row.avg_urgency),
    avg_frustration: Number(row.avg_frustration),
    latest_stance: stanceMap.get(row.speaker_affiliation as string) ?? 'neutral',
    observation_count: Number(row.observation_count),
    meetings_appeared: Number(row.meetings_appeared),
  }));
}

export async function getSentimentHeatmap(trackedItemId: string): Promise<SentimentHeatmapCell[]> {
  const client = await getTursoClient();
  const result = await client.execute({
    sql: `
      SELECT
        speaker_affiliation,
        meeting_date,
        AVG(sentiment_overall) as sentiment_overall,
        GROUP_CONCAT(DISTINCT stance) as stances
      FROM sentiment_observations
      WHERE tracked_item_id = ?
        AND speaker_affiliation IS NOT NULL
      GROUP BY speaker_affiliation, meeting_date
      ORDER BY speaker_affiliation, meeting_date
    `,
    args: [trackedItemId],
  });

  return result.rows.map(row => ({
    speaker_affiliation: row.speaker_affiliation as string,
    meeting_date: row.meeting_date as string,
    sentiment_overall: Number(row.sentiment_overall),
    stance: row.stances as string,
  }));
}

// ─── Helpers ─────────────────────────────────────────────────────────

function parseTrackedItemRow(row: Record<string, unknown>): TrackedItem {
  return {
    id: row.id as string,
    type: row.type as TrackedItemType,
    title: row.title as string,
    slug: row.slug as string,
    description: row.description as string,
    reference_text: (row.reference_text as string) ?? null,
    reference_document: (row.reference_document as string) ?? null,
    matching_keywords: row.matching_keywords ? JSON.parse(row.matching_keywords as string) : [],
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function parseSentimentObservationRow(row: Record<string, unknown>): SentimentObservation {
  return {
    id: Number(row.id),
    tracked_item_id: row.tracked_item_id as string,
    transcript_id: row.transcript_id as string,
    entry_id: row.entry_id as string,
    meeting_date: row.meeting_date as string,
    speaker_name: (row.speaker_name as string) ?? null,
    speaker_affiliation: (row.speaker_affiliation as string) ?? null,
    speaker_group: (row.speaker_group as string) ?? null,
    speaker_function: (row.speaker_function as string) ?? null,
    stance: (row.stance as Stance) ?? 'neutral',
    sentiment: {
      urgency: Number(row.sentiment_urgency) || 0,
      enthusiasm: Number(row.sentiment_enthusiasm) || 0,
      frustration: Number(row.sentiment_frustration) || 0,
      concern: Number(row.sentiment_concern) || 0,
      confidence: Number(row.sentiment_confidence) || 0,
      flexibility: Number(row.sentiment_flexibility) || 0,
      formality: Number(row.sentiment_formality) || 0,
    },
    sentiment_overall: Number(row.sentiment_overall) || 0,
    summary: row.summary as string,
    key_quote: (row.key_quote as string) ?? null,
    quote_statement_index: row.quote_statement_index != null ? Number(row.quote_statement_index) : null,
    relevance_score: Number(row.relevance_score) || 0,
    analyzed_statement_count: Number(row.analyzed_statement_count) || 0,
    created_at: row.created_at as string,
  };
}
