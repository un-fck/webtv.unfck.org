#!/usr/bin/env tsx
import '../lib/load-env';
import { getTursoClient } from '../lib/turso';
import { resolveEntryId as resolveEntryIdHelper } from '../lib/kaltura-helpers';
import * as fs from 'fs';
import * as path from 'path';

const usage = `Usage:
  npm run tag-transcripts -- <video-id>    # Process specific video
  npm run tag-transcripts -- all           # Process all transcripts`;

const rawArg = process.argv[2];

if (!rawArg) {
  console.error(usage);
  process.exit(1);
}

interface Word {
  text: string;
  speaker?: string | null;
  start: number;
  end: number;
}

interface Sentence {
  text: string;
  start: number;
  end: number;
  topic_keys?: string[];
  proposal_id?: string;
  words?: Word[];
}

interface Paragraph {
  sentences: Sentence[];
  start: number;
  end: number;
  words: Word[];
}

interface Statement {
  paragraphs: Paragraph[];
  start: number;
  end: number;
  words: Word[];
}

interface TranscriptData {
  segments?: any[];
  statements?: Statement[];
  [key: string]: any;
}

interface TaggedSentence {
  proposal_id: string;
  sentence: string;
  start: number;
  end: number;
  video_id: string;
  confidence: number;
}

type TranscriptRow = {
  transcript_id: string;
  entry_id: string;
  content: string;
};

// Keywords and phrases extracted from each proposal for matching
const proposalKeywords: Record<string, string[]> = {
  '77a': ['mandate length', 'shorter mandates', 'reduce length', 'concise mandates', 'streamline text'],
  '77b': ['secretary-general flexibility', 'comparative advantage', 'task assignment', 'resource allocation flexibility'],
  '77c': ['resource backing', 'adequate resources', 'funding mandates', 'resource allocation', 'unfunded mandates'],
  '78a': ['streamline reports', 'reduce reporting', 'meeting efficiency', 'report prioritization'],
  '78b': ['funding compact', 'member state commitments', 'funding dialogue'],
  '78c': ['resource flexibility', 'redeployment', 'protect delivery', 'funding cuts'],
  '78d': ['structural changes', 'programme realignment', 'un80 recommendations'],
  '79a': ['review mechanisms', 'mandate review', 'systematic review', 'review processes'],
  '79b': ['expiry clauses', 'sunset clauses', 'mandate expiration', 'time-limited'],
  '79c': ['collective reviews', 'comprehensive review', 'quadrennial review', 'review practices'],
  '79d': ['streamline discussions', 'programme of work', 'agenda consolidation', 'coordination across bodies']
};

// Score a sentence against a proposal's keywords
function scoreSentence(sentence: string, keywords: string[]): number {
  const lowerSentence = sentence.toLowerCase();
  let score = 0;
  
  for (const keyword of keywords) {
    if (lowerSentence.includes(keyword.toLowerCase())) {
      // More specific (longer) keywords get higher weight
      score += keyword.split(' ').length;
    }
  }
  
  return score;
}

// Find the best matching proposal for a sentence (if any)
function tagSentence(sentence: string): { proposalId: string; confidence: number } | null {
  let bestMatch: { proposalId: string; confidence: number } | null = null;
  let bestScore = 0;
  
  for (const [proposalId, keywords] of Object.entries(proposalKeywords)) {
    const score = scoreSentence(sentence, keywords);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        proposalId,
        confidence: Math.min(score / 3, 1.0) // Normalize confidence
      };
    }
  }
  
  // Only return matches with reasonable confidence (at least one keyword match)
  return bestScore > 0 ? bestMatch : null;
}

const SINGLE_QUERY = `
  SELECT transcript_id, entry_id, content
  FROM transcripts
  WHERE entry_id = ?
    AND status = 'completed'
    AND start_time IS NULL
    AND end_time IS NULL
  ORDER BY updated_at DESC
  LIMIT 1
`;

const ALL_QUERY = `
  SELECT transcript_id, entry_id, content
  FROM transcripts
  WHERE status = 'completed'
    AND start_time IS NULL
    AND end_time IS NULL
  ORDER BY updated_at DESC
`;

const clientPromise = getTursoClient();

async function resolveEntryId(input: string) {
  const decoded = decodeURIComponent(input.trim());
  if (!decoded) throw new Error('Empty id');

  const entryId = await resolveEntryIdHelper(decoded);
  if (!entryId) throw new Error(`Unable to resolve entry ID for: ${input}`);
  
  return entryId;
}

function parseTranscript(row: TranscriptRow): TranscriptData {
  const content = typeof row.content === 'string'
    ? JSON.parse(row.content)
    : row.content;
  return content;
}

async function loadTargets(arg: string) {
  if (arg.toLowerCase() === 'all') {
    const client = await clientPromise;
    const rows = await client.execute({ 
      sql: 'SELECT DISTINCT entry_id FROM transcripts WHERE status = \'completed\' AND start_time IS NULL AND end_time IS NULL' 
    });
    return rows.rows.map(row => row.entry_id as string);
  }
  const resolved = await resolveEntryId(arg);
  console.log(`Resolved '${arg}' to entry_id: '${resolved}'`);
  return [resolved];
}

async function loadTranscripts(entryId: string) {
  const client = await clientPromise;
  const query = entryId === '*ALL*' ? ALL_QUERY : SINGLE_QUERY;
  const args = entryId === '*ALL*' ? [] : [entryId];
  console.log(`Querying database for entry_id: '${entryId}'`);
  const result = await client.execute({ sql: query, args });
  console.log(`Found ${result.rows.length} transcript(s)`);
  return result.rows.map(row => ({
    transcript_id: row.transcript_id as string,
    entry_id: row.entry_id as string,
    content: row.content as string,
  }));
}

// Process a transcript and tag sentences
function processTranscript(data: TranscriptData, entryId: string): { data: TranscriptData; tagged: TaggedSentence[] } {
  const taggedSentences: TaggedSentence[] = [];
  
  if (!data.statements) {
    console.log(`  No statements found`);
    return { data, tagged: taggedSentences };
  }
  
  // Process each statement
  for (const statement of data.statements) {
    for (const paragraph of statement.paragraphs) {
      for (const sentence of paragraph.sentences) {
        const match = tagSentence(sentence.text);
        
        if (match) {
          // Add proposal_id to the sentence object
          sentence.proposal_id = match.proposalId;
          
          // Also collect for summary output
          taggedSentences.push({
            proposal_id: match.proposalId,
            sentence: sentence.text,
            start: sentence.start,
            end: sentence.end,
            video_id: entryId,
            confidence: match.confidence
          });
        }
      }
    }
  }
  
  return { data, tagged: taggedSentences };
}

async function updateTranscript(transcriptId: string, content: TranscriptData) {
  const client = await clientPromise;
  await client.execute({
    sql: 'UPDATE transcripts SET content = ? WHERE transcript_id = ?',
    args: [JSON.stringify(content), transcriptId]
  });
}

async function run() {
  const targets = rawArg.toLowerCase() === 'all'
    ? ['*ALL*']
    : await loadTargets(rawArg);

  console.log(`Loading transcripts from database...`);
  const allTranscripts = (await Promise.all(targets.map(loadTranscripts))).flat();
  
  const toProcess = allTranscripts
    .map(row => ({ row, data: parseTranscript(row) }))
    .filter(({ row, data }) => {
      if (!data.statements?.length) {
        console.warn(`Skipping ${row.transcript_id}: no statements`);
        return false;
      }
      return true;
    });

  const total = toProcess.length;
  console.log(`Processing ${total} transcript(s)...\n`);

  let completed = 0;
  const allTaggedSentences: TaggedSentence[] = [];
  
  for (const { row, data } of toProcess) {
    console.log(`Processing ${row.entry_id} (${row.transcript_id})...`);
    const { data: updatedData, tagged } = processTranscript(data, row.entry_id);
    
    // Update database with tagged content
    await updateTranscript(row.transcript_id, updatedData);
    
    allTaggedSentences.push(...tagged);
    completed++;
    console.log(`[${completed}/${total}] ✓ Tagged ${tagged.length} sentences`);
  }

  // Write summary file to public data directory
  const dataDir = path.join(__dirname, '../public/data/transcripts');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const summaryPath = path.join(dataDir, '_tagged_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(allTaggedSentences, null, 2), 'utf-8');

  console.log(`\nDone! Tagged ${allTaggedSentences.length} total sentences across ${total} transcript(s).`);
  console.log(`Summary written to ${summaryPath}`);
  process.exit(0);
}

run().catch(error => {
  console.error('Tag transcripts failed:', error);
  process.exit(1);
});

