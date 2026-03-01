import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { trackOpenAIChatCompletion, UsageStages, UsageOperations } from './usage-tracking';
import {
  getTrackedItems,
  getTrackedItemById,
  insertTrackedItemMatch,
  insertSentimentObservations,
  deleteSentimentObservationsForTranscript,
  deleteMatchesForTranscript,
} from './sentiment-db';
import type { TrackedItem, TrackedItemMatch, SentimentDimensions, Stance } from './sentiment-types';
import type { SpeakerMapping } from './speakers';
import type { TranscriptContent } from './turso';

// ─── Zod Schemas ─────────────────────────────────────────────────────

const MatchResult = z.object({
  matches: z.array(z.object({
    tracked_item_id: z.string(),
    matched_topic_key: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  })),
});

const SpeakerSentimentResult = z.object({
  speakers: z.array(z.object({
    speaker_key: z.string().describe('The statement index/paragraph key identifying this speaker'),
    speaker_name: z.string().nullable(),
    speaker_affiliation: z.string().nullable(),
    speaker_group: z.string().nullable(),
    speaker_function: z.string().nullable(),
    stance: z.enum(['support', 'oppose', 'conditional', 'neutral']),
    urgency: z.number().min(0).max(1),
    enthusiasm: z.number().min(0).max(1),
    frustration: z.number().min(0).max(1),
    concern: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    flexibility: z.number().min(0).max(1),
    formality: z.number().min(0).max(1),
    overall: z.number().min(-1).max(1),
    summary: z.string(),
    key_quote: z.string().nullable(),
    quote_statement_index: z.number().nullable(),
    relevance_score: z.number().min(0).max(1),
    analyzed_statement_count: z.number(),
  })),
});

const SuggestedItemsResult = z.object({
  suggestions: z.array(z.object({
    type: z.enum(['topic', 'resolution_article', 'proposal']),
    title: z.string(),
    description: z.string(),
    matching_keywords: z.array(z.string()),
    reference_text: z.string().nullable(),
    reference_document: z.string().nullable(),
  })),
});

// ─── Topic Matching ──────────────────────────────────────────────────

const MATCH_CONFIDENCE_THRESHOLD = 0.6;

export async function matchTrackedItems(
  transcriptId: string,
  entryId: string,
  topics: Record<string, { key: string; label: string; description: string }>,
  content: TranscriptContent,
  client: OpenAI,
): Promise<Array<TrackedItemMatch & { tracked_item: TrackedItem }>> {
  const trackedItems = await getTrackedItems();
  if (trackedItems.length === 0) return [];

  const topicList = Object.values(topics);
  if (topicList.length === 0) return [];

  // Build context about the meeting from propositions if available
  const propositionContext = content.propositions?.length
    ? `\n\nKey propositions discussed:\n${content.propositions.map(p => `- ${p.title}: ${p.statement}`).join('\n')}`
    : '';

  const completion = await trackOpenAIChatCompletion({
    client,
    transcriptId,
    stage: UsageStages.matchingTrackedItems,
    operation: UsageOperations.openaiMatchTrackedItems,
    model: 'gpt-5',
    requestMeta: { tracked_item_count: trackedItems.length, topic_count: topicList.length },
    request: {
      model: 'gpt-5',
      messages: [
        {
          role: 'system',
          content: `You are an expert at matching UN meeting topics to tracked items for cross-meeting sentiment analysis.

Given a list of TRACKED ITEMS (persistent topics/articles a user wants to follow across meetings) and a list of PER-MEETING TOPICS (extracted from a single meeting's transcript), determine which tracked items are discussed in this meeting.

For each match:
- Identify the closest per-meeting topic key (or null if the tracked item is discussed but doesn't map to any extracted topic)
- Provide a confidence score (0.0-1.0) based on how clearly the meeting discusses this tracked item
- Consider both direct matches AND conceptual overlaps (e.g., "climate finance" matches "Green Climate Fund contributions")
- For resolution articles: match if speakers discuss the substance of the article, even if they don't cite the specific document
- Be conservative: only match with confidence >= 0.5 if the meeting genuinely discusses the tracked item's subject matter

Return an empty matches array if no tracked items are discussed in this meeting.`,
        },
        {
          role: 'user',
          content: `TRACKED ITEMS (user wants to follow these across meetings):
${trackedItems.map((ti, i) => `${i + 1}. [${ti.id}] "${ti.title}" (${ti.type})
   Description: ${ti.description}${ti.reference_text ? `\n   Reference text: ${ti.reference_text}` : ''}${ti.matching_keywords.length > 0 ? `\n   Keywords: ${ti.matching_keywords.join(', ')}` : ''}`).join('\n\n')}

PER-MEETING TOPICS (extracted from this meeting's transcript):
${topicList.map((t, i) => `${i + 1}. [${t.key}] "${t.label}": ${t.description}`).join('\n')}${propositionContext}`,
        },
      ],
      response_format: zodResponseFormat(MatchResult, 'match_result'),
    },
  });

  const result = completion.choices[0]?.message?.content;
  if (!result) return [];

  const parsed = JSON.parse(result) as z.infer<typeof MatchResult>;
  const matches: Array<TrackedItemMatch & { tracked_item: TrackedItem }> = [];

  for (const match of parsed.matches) {
    if (match.confidence < MATCH_CONFIDENCE_THRESHOLD) continue;

    const trackedItem = trackedItems.find(ti => ti.id === match.tracked_item_id);
    if (!trackedItem) continue;

    await insertTrackedItemMatch({
      tracked_item_id: match.tracked_item_id,
      transcript_id: transcriptId,
      matched_topic_key: match.matched_topic_key,
      match_method: 'llm',
      match_confidence: match.confidence,
    });

    matches.push({
      id: 0,
      tracked_item_id: match.tracked_item_id,
      transcript_id: transcriptId,
      matched_topic_key: match.matched_topic_key,
      match_method: 'llm',
      match_confidence: match.confidence,
      created_at: new Date().toISOString(),
      tracked_item: trackedItem,
    });
  }

  // Also try keyword matching for items that weren't matched by LLM
  const matchedIds = new Set(matches.map(m => m.tracked_item_id));
  for (const item of trackedItems) {
    if (matchedIds.has(item.id) || item.matching_keywords.length === 0) continue;

    const keywords = item.matching_keywords.map(k => k.toLowerCase());
    const topicTexts = topicList.map(t => `${t.label} ${t.description}`.toLowerCase());
    const allTopicText = topicTexts.join(' ');

    const matchCount = keywords.filter(kw => allTopicText.includes(kw)).length;
    if (matchCount === 0) continue;

    const keywordConfidence = Math.min(0.3 + (matchCount / keywords.length) * 0.5, 0.9);
    if (keywordConfidence < MATCH_CONFIDENCE_THRESHOLD) continue;

    // Find the best matching topic
    let bestTopic: string | null = null;
    let bestScore = 0;
    for (const topic of topicList) {
      const text = `${topic.label} ${topic.description}`.toLowerCase();
      const score = keywords.filter(kw => text.includes(kw)).length;
      if (score > bestScore) { bestScore = score; bestTopic = topic.key; }
    }

    await insertTrackedItemMatch({
      tracked_item_id: item.id,
      transcript_id: transcriptId,
      matched_topic_key: bestTopic,
      match_method: 'keyword',
      match_confidence: keywordConfidence,
    });

    matches.push({
      id: 0,
      tracked_item_id: item.id,
      transcript_id: transcriptId,
      matched_topic_key: bestTopic,
      match_method: 'keyword',
      match_confidence: keywordConfidence,
      created_at: new Date().toISOString(),
      tracked_item: item,
    });
  }

  console.log(`  ✓ Matched ${matches.length} tracked item(s) to this transcript`);
  return matches;
}

// ─── Sentiment Analysis ──────────────────────────────────────────────

const SENTIMENT_DIMENSIONS_GUIDE = `SENTIMENT DIMENSIONS (each 0.0 to 1.0):
- urgency: How urgently the speaker treats this issue (0 = routine/no time pressure, 1 = "we must act immediately")
- enthusiasm: Positive energy and endorsement (0 = indifferent/lukewarm, 1 = "we wholeheartedly welcome this")
- frustration: Dissatisfaction, impatience, disappointment (0 = none, 1 = "once again, we find ourselves without progress")
- concern: Worry, anxiety, warning (0 = unconcerned, 1 = "we are deeply troubled by the implications")
- confidence: Assertiveness and conviction in their position (0 = tentative/uncertain, 1 = "we are absolutely certain")
- flexibility: Willingness to compromise or consider alternatives (0 = rigid/non-negotiable, 1 = "we are prepared to consider alternative formulations")
- formality: Level of diplomatic hedging (0 = direct/blunt language, 1 = highly hedged diplomatic language like "we would respectfully suggest...")

OVERALL SENTIMENT (-1.0 to +1.0):
Composite favorability toward the tracked item. -1 = hostile/strongly opposed, 0 = neutral, +1 = strongly favorable/supportive.

STANCE:
- support: Speaker is generally in favor
- oppose: Speaker is generally against
- conditional: Speaker supports under certain conditions or with amendments
- neutral: Speaker discusses without taking a clear position`;

export async function analyzeSentiment(
  transcriptId: string,
  entryId: string,
  meetingDate: string,
  match: TrackedItemMatch & { tracked_item: TrackedItem },
  content: TranscriptContent,
  speakerMapping: SpeakerMapping,
  client: OpenAI,
): Promise<void> {
  const trackedItem = match.tracked_item;
  const statements = content.statements;

  // Collect relevant text grouped by speaker (statement index)
  const speakerTexts: Map<string, { texts: string[]; statementIndices: number[]; speaker: typeof speakerMapping[string] }> = new Map();

  for (let stmtIdx = 0; stmtIdx < statements.length; stmtIdx++) {
    const stmt = statements[stmtIdx];
    const speaker = speakerMapping[stmtIdx.toString()];
    if (!speaker) continue;

    // Check if any sentence in this statement is tagged with the matched topic
    let hasRelevantContent = false;
    const relevantSentences: string[] = [];

    for (const para of stmt.paragraphs) {
      for (const sent of para.sentences) {
        if (match.matched_topic_key && sent.topic_keys?.includes(match.matched_topic_key)) {
          hasRelevantContent = true;
          relevantSentences.push(sent.text);
        }
      }
    }

    // If no topic-tagged sentences, check if the whole statement has relevant content
    // (for keyword-matched items or when topic tagging is sparse)
    if (!hasRelevantContent && match.match_method === 'keyword') {
      const fullText = stmt.paragraphs.map(p => p.sentences.map(s => s.text).join(' ')).join(' ');
      const keywords = trackedItem.matching_keywords.map(k => k.toLowerCase());
      if (keywords.some(kw => fullText.toLowerCase().includes(kw))) {
        hasRelevantContent = true;
        relevantSentences.push(fullText);
      }
    }

    if (!hasRelevantContent) continue;

    const speakerKey = `${speaker.name || 'unknown'}_${speaker.affiliation || 'unknown'}`;
    const existing = speakerTexts.get(speakerKey);
    if (existing) {
      existing.texts.push(...relevantSentences);
      existing.statementIndices.push(stmtIdx);
    } else {
      speakerTexts.set(speakerKey, {
        texts: relevantSentences,
        statementIndices: [stmtIdx],
        speaker,
      });
    }
  }

  if (speakerTexts.size === 0) {
    console.log(`  ℹ No relevant speaker content found for "${trackedItem.title}"`);
    return;
  }

  // Build the prompt with all speaker contributions
  const speakerSections = Array.from(speakerTexts.entries()).map(([key, data], idx) => {
    const sp = data.speaker;
    return `SPEAKER ${idx + 1} [${key}]:
Name: ${sp.name || 'Unknown'}
Affiliation: ${sp.affiliation || 'Unknown'}
Group: ${sp.group || 'N/A'}
Function: ${sp.function || 'N/A'}
Statements (indices: ${data.statementIndices.join(', ')}):
${data.texts.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`;
  });

  const completion = await trackOpenAIChatCompletion({
    client,
    transcriptId,
    stage: UsageStages.analyzingSentiment,
    operation: UsageOperations.openaiAnalyzeSentiment,
    model: 'gpt-5',
    requestMeta: { tracked_item_id: trackedItem.id, speaker_count: speakerTexts.size },
    request: {
      model: 'gpt-5',
      messages: [
        {
          role: 'system',
          content: `You are an expert at analyzing diplomatic sentiment in UN proceedings. Analyze each speaker's sentiment toward a specific tracked item.

TRACKED ITEM: "${trackedItem.title}"
Type: ${trackedItem.type}
Description: ${trackedItem.description}${trackedItem.reference_text ? `\nReference text: ${trackedItem.reference_text}` : ''}

For EACH speaker, provide nuanced sentiment analysis. Consider the diplomatic context:
- UN delegates often use hedging language that masks their actual position
- "We take note of" often means lukewarm/neutral reception
- "We welcome" or "we support" indicates genuine endorsement
- "We have concerns" or "we are not in a position to" signals opposition
- Group statements on behalf of blocs carry more weight

${SENTIMENT_DIMENSIONS_GUIDE}

For speaker_key, use the exact key from the input (e.g., "John Smith_USA").
For key_quote, select the most representative single sentence or phrase.
For quote_statement_index, provide the 0-based statement index where the quote appears.`,
        },
        {
          role: 'user',
          content: `Analyze each speaker's sentiment toward "${trackedItem.title}":

${speakerSections.join('\n\n')}`,
        },
      ],
      response_format: zodResponseFormat(SpeakerSentimentResult, 'speaker_sentiment'),
    },
  });

  const result = completion.choices[0]?.message?.content;
  if (!result) return;

  const parsed = JSON.parse(result) as z.infer<typeof SpeakerSentimentResult>;

  const observations = parsed.speakers.map(sp => {
    // Resolve speaker info from the mapping if possible
    const speakerData = speakerTexts.get(sp.speaker_key);
    const resolvedSpeaker = speakerData?.speaker;

    return {
      tracked_item_id: trackedItem.id,
      transcript_id: transcriptId,
      entry_id: entryId,
      meeting_date: meetingDate,
      speaker_name: sp.speaker_name ?? resolvedSpeaker?.name ?? null,
      speaker_affiliation: sp.speaker_affiliation ?? resolvedSpeaker?.affiliation ?? null,
      speaker_group: sp.speaker_group ?? resolvedSpeaker?.group ?? null,
      speaker_function: sp.speaker_function ?? resolvedSpeaker?.function ?? null,
      stance: sp.stance as Stance,
      sentiment: {
        urgency: sp.urgency,
        enthusiasm: sp.enthusiasm,
        frustration: sp.frustration,
        concern: sp.concern,
        confidence: sp.confidence,
        flexibility: sp.flexibility,
        formality: sp.formality,
      } satisfies SentimentDimensions,
      sentiment_overall: sp.overall,
      summary: sp.summary,
      key_quote: sp.key_quote,
      quote_statement_index: sp.quote_statement_index,
      relevance_score: sp.relevance_score,
      analyzed_statement_count: sp.analyzed_statement_count,
    };
  });

  await insertSentimentObservations(observations);
  console.log(`  ✓ Recorded ${observations.length} sentiment observation(s) for "${trackedItem.title}"`);
}

// ─── Full Pipeline Step ──────────────────────────────────────────────

export async function runSentimentAnalysis(
  transcriptId: string,
  entryId: string,
  meetingDate: string,
  content: TranscriptContent,
  speakerMapping: SpeakerMapping,
  client: OpenAI,
): Promise<void> {
  const trackedItems = await getTrackedItems();
  if (trackedItems.length === 0) {
    console.log(`  ℹ No tracked items configured, skipping sentiment analysis`);
    return;
  }

  const topics = content.topics ?? {};
  if (Object.keys(topics).length === 0) {
    console.log(`  ℹ No topics extracted, skipping sentiment analysis`);
    return;
  }

  // Clean any existing data for this transcript (re-analysis)
  await deleteMatchesForTranscript(transcriptId);
  await deleteSentimentObservationsForTranscript(transcriptId);

  console.log(`  → Matching ${trackedItems.length} tracked item(s) against meeting topics...`);
  const matches = await matchTrackedItems(transcriptId, entryId, topics, content, client);

  if (matches.length === 0) {
    console.log(`  ℹ No tracked items matched this meeting`);
    return;
  }

  console.log(`  → Analyzing sentiment for ${matches.length} matched item(s)...`);
  for (const match of matches) {
    try {
      await analyzeSentiment(transcriptId, entryId, meetingDate, match, content, speakerMapping, client);
    } catch (error) {
      console.warn(`  ⚠ Failed sentiment analysis for "${match.tracked_item.title}":`, error instanceof Error ? error.message : error);
    }
  }
}

// ─── Suggest Tracked Items ───────────────────────────────────────────

export async function suggestTrackedItems(
  transcriptId: string,
  content: TranscriptContent,
  client: OpenAI,
): Promise<z.infer<typeof SuggestedItemsResult>['suggestions']> {
  const topics = content.topics ?? {};
  const topicList = Object.values(topics);
  const propositions = content.propositions ?? [];

  if (topicList.length === 0 && propositions.length === 0) return [];

  const completion = await trackOpenAIChatCompletion({
    client,
    transcriptId,
    stage: UsageStages.matchingTrackedItems,
    operation: UsageOperations.openaiSuggestTrackedItems,
    model: 'gpt-5',
    requestMeta: { topic_count: topicList.length, proposition_count: propositions.length },
    request: {
      model: 'gpt-5',
      messages: [
        {
          role: 'system',
          content: `You are an expert at identifying trackable topics from UN meeting transcripts. Given the topics and propositions from a meeting, suggest items worth tracking across future meetings.

Suggest 3-8 tracked items of these types:
- "topic": A broad subject worth following (e.g., "Climate Finance", "UN Security Council Reform")
- "resolution_article": A specific resolution article or paragraph being debated
- "proposal": A specific proposal or initiative under negotiation

For each suggestion:
- title: Short, clear label (2-5 words)
- description: 1-3 sentences explaining what this is and why it's worth tracking
- matching_keywords: 5-10 keywords that would help identify discussions of this item in other meetings
- reference_text: For resolution_articles/proposals, the relevant text; null for topics
- reference_document: Document reference if applicable (e.g., "A/RES/78/123"); null otherwise

Focus on items that are:
1. Likely to be discussed in multiple meetings (not one-off topics)
2. Specific enough to produce meaningful sentiment analysis
3. Important in the current UN agenda`,
        },
        {
          role: 'user',
          content: `Based on this meeting's content, suggest tracked items:

TOPICS:
${topicList.map((t, i) => `${i + 1}. "${t.label}": ${t.description}`).join('\n')}

${propositions.length > 0 ? `PROPOSITIONS:
${propositions.map((p, i) => `${i + 1}. "${p.title}": ${p.statement}
   Positions: ${p.positions.map(pos => `${pos.stakeholders.join(', ')} (${pos.stance})`).join('; ')}`).join('\n')}` : ''}`,
        },
      ],
      response_format: zodResponseFormat(SuggestedItemsResult, 'suggested_items'),
    },
  });

  const result = completion.choices[0]?.message?.content;
  if (!result) return [];

  const parsed = JSON.parse(result) as z.infer<typeof SuggestedItemsResult>;
  return parsed.suggestions;
}
