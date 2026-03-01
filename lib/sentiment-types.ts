export type TrackedItemType = 'topic' | 'resolution_article' | 'proposal';

export interface TrackedItem {
  id: string;
  type: TrackedItemType;
  title: string;
  slug: string;
  description: string;
  reference_text: string | null;
  reference_document: string | null;
  matching_keywords: string[];
  created_at: string;
  updated_at: string;
}

export interface SentimentDimensions {
  urgency: number;       // 0-1
  enthusiasm: number;    // 0-1
  frustration: number;   // 0-1
  concern: number;       // 0-1
  confidence: number;    // 0-1
  flexibility: number;   // 0-1
  formality: number;     // 0-1
}

export type Stance = 'support' | 'oppose' | 'conditional' | 'neutral';

export interface SentimentObservation {
  id: number;
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
  sentiment_overall: number;  // -1.0 to 1.0
  summary: string;
  key_quote: string | null;
  quote_statement_index: number | null;
  relevance_score: number;
  analyzed_statement_count: number;
  created_at: string;
}

export interface TrackedItemMatch {
  id: number;
  tracked_item_id: string;
  transcript_id: string;
  matched_topic_key: string | null;
  match_method: 'llm' | 'keyword' | 'manual';
  match_confidence: number;
  created_at: string;
}

// Aggregation types for dashboard
export interface SentimentTimelinePoint {
  meeting_date: string;
  entry_id: string;
  video_title: string | null;
  avg_overall: number;
  avg_urgency: number;
  avg_frustration: number;
  avg_enthusiasm: number;
  avg_flexibility: number;
  observation_count: number;
  support_count: number;
  oppose_count: number;
  conditional_count: number;
  neutral_count: number;
}

export interface CountrySentimentRow {
  speaker_affiliation: string;
  country_name: string | null;
  avg_overall: number;
  avg_urgency: number;
  avg_frustration: number;
  latest_stance: string;
  observation_count: number;
  meetings_appeared: number;
}

export interface SentimentHeatmapCell {
  speaker_affiliation: string;
  meeting_date: string;
  sentiment_overall: number;
  stance: string;
}

export interface TrackedItemSummary extends TrackedItem {
  meeting_count: number;
  observation_count: number;
  latest_meeting_date: string | null;
  avg_overall: number | null;
}
