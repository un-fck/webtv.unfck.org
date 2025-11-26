#!/usr/bin/env tsx
/**
 * tag-un80.ts
 * 
 * Tags transcript sentences with UN80 topics from actions-and-proposals.json
 * 
 * This script:
 * 1. Loads all UN80 topics (SG actions, MS proposals, other topics) - 50 total
 * 2. For each transcript, analyzes sentences using Claude to identify relevant topics
 * 3. Stores topic tags in un80_topic_keys (separate from existing topic_keys)
 * 4. Stores topic definitions in un80_topics (separate from existing topics)
 * 
 * Usage:
 *   npm run tag-un80 -- <asset-id>  # Tag single video
 *   npm run tag-un80 -- all          # Tag all videos with transcripts
 */
import '../lib/load-env';
import { getTursoClient, saveTranscript } from '../lib/turso';
import { resolveEntryId as resolveEntryIdHelper } from '../lib/kaltura-helpers';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AzureOpenAI } from 'openai';

const usage = `Usage:
  npm run tag-un80 -- <asset|entry-id>
  npm run tag-un80 -- all
  npm run tag-un80 -- iahwg`;

const rawArg = process.argv[2];

if (!rawArg) {
  console.error(usage);
  process.exit(1);
}

type TranscriptRow = {
  transcript_id: string;
  entry_id: string;
  content: string;
  audio_url: string;
  start_time: number | null;
  end_time: number | null;
  language_code: string | null;
};

type Sentence = {
  text: string;
  start: number;
  end: number;
  topic_keys?: string[];
  un80_topic_keys?: string[];
  words: Array<{ text: string; start: number; end: number; confidence: number }>;
};

type Statement = {
  paragraphs: Array<{
    sentences: Sentence[];
    start: number;
    end: number;
    words: Array<{ text: string; start: number; end: number; confidence: number }>;
  }>;
  start: number;
  end: number;
  words: Array<{ text: string; start: number; end: number; confidence: number }>;
};

type TranscriptContent = {
  statements: Statement[];
  topics?: Record<string, { key: string; label: string; description: string }>;
  un80_topics?: Record<string, { key: string; label: string; description: string }>;
};

type TopicItem = {
  slug: string;
  text?: string;
  label?: string;
  description: string;
};

type TopicsData = {
  sg_actions: Record<string, TopicItem[]>;
  ms_proposals: Record<string, TopicItem[]>;
  other_topics: Record<string, TopicItem[]>;
};

const SINGLE_QUERY = `
  SELECT transcript_id, entry_id, content, audio_url, start_time, end_time, language_code
  FROM transcripts
  WHERE entry_id = ?
    AND status = 'completed'
    AND start_time IS NULL
    AND end_time IS NULL
  ORDER BY updated_at DESC
  LIMIT 1
`;

const clientPromise = getTursoClient();

async function resolveEntryId(input: string) {
  const decoded = decodeURIComponent(input.trim());
  if (!decoded) throw new Error('Empty id');

  const entryId = await resolveEntryIdHelper(decoded);
  if (!entryId) throw new Error(`Unable to resolve entry ID for: ${input}`);
  
  return entryId;
}

function loadUN80Topics(): { topics: Record<string, { key: string; label: string; description: string }>; topicsList: TopicItem[] } {
  const dataPath = join(process.cwd(), 'public', 'data', 'actions-and-proposals.json');
  const data: TopicsData = JSON.parse(readFileSync(dataPath, 'utf-8'));
  
  const topics: Record<string, { key: string; label: string; description: string }> = {};
  const topicsList: TopicItem[] = [];
  
  // Load SG actions
  for (const category of Object.values(data.sg_actions)) {
    for (const item of category) {
      topics[item.slug] = {
        key: item.slug,
        label: item.text || item.label || item.slug,
        description: item.description
      };
      topicsList.push(item);
    }
  }
  
  // Load MS proposals
  for (const category of Object.values(data.ms_proposals)) {
    for (const item of category) {
      topics[item.slug] = {
        key: item.slug,
        label: item.text || item.label || item.slug,
        description: item.description
      };
      topicsList.push(item);
    }
  }
  
  // Skip "other_topics" for now - focus on numbered proposals only
  
  return { topics, topicsList };
}

async function tagSentencesWithUN80Topics(
  content: TranscriptContent,
  topicsList: TopicItem[]
): Promise<TranscriptContent> {
  const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: '2024-10-21',
    deployment: 'gpt-5',
  });
  
  // Build detailed topic list with descriptions for better matching
  const topicDescriptions = topicsList.map(t => {
    const label = t.text || t.label || '';
    return `${t.slug}: ${label}`;
  }).join('\n');
  
  // Collect all sentences with indices
  interface SentenceWithMeta {
    sentence: Sentence;
    statementIdx: number;
    paraIdx: number;
    sentIdx: number;
    text: string;
  }
  
  const allSentences: SentenceWithMeta[] = [];
  for (let stmtIdx = 0; stmtIdx < content.statements.length; stmtIdx++) {
    const statement = content.statements[stmtIdx];
    for (let paraIdx = 0; paraIdx < statement.paragraphs.length; paraIdx++) {
      const para = statement.paragraphs[paraIdx];
      for (let sentIdx = 0; sentIdx < para.sentences.length; sentIdx++) {
        const sent = para.sentences[sentIdx];
        allSentences.push({
          sentence: sent,
          statementIdx: stmtIdx,
          paraIdx,
          sentIdx,
          text: sent.text
        });
      }
    }
  }
  
  console.log(`  → Tagging ${allSentences.length} sentences with ${topicsList.length} UN80 topics (SG actions + MS proposals only)...`);
  
  // Tag each sentence in parallel
  const tasks = allSentences.map(async (item, globalIdx) => {
    // Context: 2 sentences before and after
    const contextBefore = allSentences.slice(Math.max(0, globalIdx - 2), globalIdx);
    const contextAfter = allSentences.slice(globalIdx + 1, Math.min(allSentences.length, globalIdx + 3));
    
    const contextText = [
      ...contextBefore.map((s, i) => `[${i - contextBefore.length}] ${s.text}`),
      `[CURRENT] ${item.text}`,
      ...contextAfter.map((s, i) => `[+${i + 1}] ${s.text}`),
    ].join('\n');
    
    const systemPrompt = `You are analyzing UN General Assembly meeting transcripts about the UN80 reform initiative.

Your task: Tag the [CURRENT] sentence with relevant UN80 reform proposals/actions.

TOPICS:
${topicDescriptions}

IMPORTANT:
- Focus on numbered proposals (74a-76x are Secretary-General actions, 77a-80x are Member State proposals)
- Only use descriptive topics (like "data-commons", "integrated-delivery") if the numbered proposals don't fit
- Be precise: match specific reform proposals mentioned, not just general themes
- A sentence discussing "mandate registries" → tag "74a", not generic topics
- A sentence about "shorter mandate texts" → tag "77a"
- Return ONLY the slugs (comma-separated) or "none"

Format: 74a,77b OR none`;

    const userMessage = `Context with [CURRENT] sentence to tag:

${contextText}

Which UN80 reform topics apply to the [CURRENT] sentence? Return slugs only:`;

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-5',
        messages: [{
          role: 'system',
          content: systemPrompt
        }, {
          role: 'user',
          content: userMessage
        }],
      });
      
      const text = (response.choices[0]?.message?.content || '').trim();
      
      if (text.toLowerCase() === 'none' || !text) {
        item.sentence.un80_topic_keys = [];
      } else {
        item.sentence.un80_topic_keys = text.split(',').map(t => t.trim()).filter(Boolean);
      }
    } catch (error) {
      console.error(`  ✗ Failed to tag sentence ${globalIdx}:`, error instanceof Error ? error.message : error);
      item.sentence.un80_topic_keys = [];
    }
  });
  
  await Promise.all(tasks);
  
  // Count tagged sentences
  const taggedCount = allSentences.filter(s => s.sentence.un80_topic_keys && s.sentence.un80_topic_keys.length > 0).length;
  console.log(`  ✓ Tagged ${taggedCount}/${allSentences.length} sentences with UN80 topics`);
  
  return content;
}

function parseContent(row: TranscriptRow): TranscriptContent {
  const content = typeof row.content === 'string'
    ? JSON.parse(row.content)
    : row.content;
  return content as TranscriptContent;
}

async function loadTargets(arg: string) {
  if (arg.toLowerCase() === 'all') {
    const client = await clientPromise;
    const rows = await client.execute({ 
      sql: 'SELECT DISTINCT entry_id FROM transcripts WHERE status = \'completed\' AND start_time IS NULL AND end_time IS NULL' 
    });
    return rows.rows.map(row => row.entry_id as string);
  }
  if (arg.toLowerCase() === 'iahwg') {
    const client = await clientPromise;
    const rows = await client.execute({ 
      sql: `SELECT DISTINCT t.entry_id 
            FROM transcripts t
            JOIN videos v ON t.entry_id = v.entry_id
            WHERE t.status = 'completed' 
              AND t.start_time IS NULL 
              AND t.end_time IS NULL
              AND (v.clean_title LIKE '%Informal Ad hoc Working Group on UN80%'
                   OR v.clean_title LIKE '%Informal Ad hoc Working Group on Mandate Implementation%')
            ORDER BY v.date DESC`
    });
    return rows.rows.map(row => row.entry_id as string);
  }
  return [await resolveEntryId(arg)];
}

async function loadTranscripts(entryId: string) {
  const client = await clientPromise;
  const result = await client.execute({ sql: SINGLE_QUERY, args: [entryId] });
  return result.rows.map(row => ({
    transcript_id: row.transcript_id as string,
    entry_id: row.entry_id as string,
    content: row.content as string,
    audio_url: row.audio_url as string,
    start_time: row.start_time as number | null,
    end_time: row.end_time as number | null,
    language_code: row.language_code as string | null,
  }));
}

async function run() {
  console.log('Loading UN80 topics (SG actions + MS proposals only)...');
  const { topics: topicsMap, topicsList } = loadUN80Topics();
  console.log(`Loaded ${topicsList.length} topics (excluding "other topics")\n`);
  
  const targets = await loadTargets(rawArg);
  console.log(`Processing ${targets.length} transcript(s)...\n`);

  let completed = 0;
  for (const entryId of targets) {
    try {
      // Load transcript one at a time to avoid memory issues
      const transcripts = await loadTranscripts(entryId);
      
      if (transcripts.length === 0) {
        console.warn(`[${completed + 1}/${targets.length}] No transcript found for ${entryId}`);
        completed++;
        continue;
      }
      
      const row = transcripts[0];
      const content = parseContent(row);
      
      if (!content.statements?.length) {
        console.warn(`[${completed + 1}/${targets.length}] Skipping ${entryId}: no statements`);
        completed++;
        continue;
      }
      
      console.log(`[${completed + 1}/${targets.length}] Processing ${entryId}...`);
      
      const taggedContent = await tagSentencesWithUN80Topics(content, topicsList);
      
      // Add un80_topics to content
      taggedContent.un80_topics = topicsMap;
      
      // Save back to database
      await saveTranscript(
        row.entry_id,
        row.transcript_id,
        row.start_time,
        row.end_time,
        row.audio_url,
        'completed',
        row.language_code,
        taggedContent
      );
      
      console.log(`  ✓ Tagged and saved ${entryId} (${row.transcript_id})\n`);
    } catch (error) {
      console.error(`[${completed + 1}/${targets.length}] Failed to process ${entryId}:`, error);
    }
    
    completed++;
  }

  console.log(`\nDone. Processed ${completed} transcript(s).`);
  process.exit(0);
}

run().catch(error => {
  console.error('Tag UN80 failed:', error);
  process.exit(1);
});

