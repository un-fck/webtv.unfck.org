import { AzureOpenAI } from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { setSpeakerMapping, SpeakerInfo } from './speakers';
import { getTranscriptById, updateTranscriptContent, updateTranscriptStatus } from './turso';
import './load-env';
// @ts-expect-error - no types available for sbd
import sbd from 'sbd';

const ParagraphSpeakerMapping = z.object({
  paragraphs: z.array(z.object({
    index: z.number(),
    name: z.string().nullable(),
    function: z.string().nullable(),
    affiliation: z.string().nullable(),
    group: z.string().nullable(),
    has_multiple_speakers: z.boolean(),
    is_off_record: z.boolean(),
  })),
});

const ResegmentationResult = z.object({
  should_split: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
  reason: z.string(),
  segments: z.array(z.object({
    text: z.string(),
    name: z.string().nullable(),
    function: z.string().nullable(),
    affiliation: z.string().nullable(),
    group: z.string().nullable(),
  })),
});

const TopicDefinitions = z.object({
  topics: z.array(z.object({
    key: z.string(),
    label: z.string(),
    description: z.string(),
  })),
});

const ParagraphTopicTags = z.object({
  paragraph_index: z.number(),
  topic_keys: z.array(z.string()),
});

const API_VERSION = '2025-01-01-preview';

const IDENTIFICATION_RULES = `IDENTIFICATION RULES:
- Use AssemblyAI labels as HINTS for speaker changes (label change often = new speaker), but verify with text
- AssemblyAI may incorrectly group different speakers under same label, or split one speaker across labels
- Extract both personal names AND official functions when available
- For country representatives, provide ISO 3166-1 alpha-3 country codes (e.g., PRY, USA, CHN)
- For UN bodies/agencies, use standard abbreviations (e.g., ACABQ, UNICEF, UNDP, OHCHR, 5th Committee)
- CRITICAL: Only fill "group" when speaker EXPLICITLY says they are speaking ON BEHALF OF that group
  - YES: "on behalf of the G77 + China", "speaking for the EU", "representing the Africa Group"
  - NO: "aligns with", "supports the statement by", "agrees with", "echoes", "associates with"
- If identity cannot be determined, return all null values
- Only use information literally in the text (no world knowledge)
- Fix transcription errors: "UN80 Initiative" (not "UNAT", "UNA", "UNAT Initiative", etc.)
- The co-chairs of the UN80 / MIR IAHWG are called "Carolyn Schwalger" and "Brian Wallace", their affiliation is "IAHWG", and their function is "Co-Chair"
- In IAHWG meetings: if someone is chairing but name isn't stated, use function="Co-Chair" and affiliation="IAHWG" (name can be null)`;

const COMMON_ABBREVIATIONS = `COMMON ABBREVIATIONS
- Informal Ad hoc Working Group (on UN80 initiative / mandate implementation review / ...) -> IAHWG (just "IAHWG", NOT "IAHWG on ...")
- common member state groups (use only the short form in your response, not the part in brackets):
  - G77 + China (Group of 77 + China)
  - NAM (Non-Aligned Movement)
  - WEOG (Western European and Others Group)
  - GRULAC (Latin American and Caribbean Group)
  - Africa Group
  - Asia-Pacific Group
  - EEG (Eastern European Group)
  - LDCs (Least Developed Countries)
  - SIDS (Small Island Developing States)
  - LLDCs (Landlocked Developing Countries)
  - AOSIS (Alliance of Small Island States)
  - Arab Group
  - OIC (Organisation of Islamic Cooperation)
  - ACP (African, Caribbean and Pacific States)
  - EU (European Union)
  - JUSCANZ
  - CANZ
  - Nordic Group
  - LMG (Like-Minded Group)
  - LGBTI Core Group
  - Friends of R2P
  - Friends of the SDGs
  - Friends of Mediation
  - Friends of UNAOC (UN Alliance of Civilizations)
  - G24 (Intergovernmental Group of 24)
  - BRICS
  - G20
  - OECD-DAC
  - Umbrella Group
  - BASIC (Brazil, South Africa, India, China)
  - LMDC (Like-Minded Developing Countries)
  - EIG (Environmental Integrity Group)`;

const SCHEMA_DEFINITIONS = `SCHEMA DEFINITIONS:

name: Person name as best as can be identified from the text. Do NOT use world knowledge. Only use what is literally stated. Fix transcription errors. May be given name, surname, or full name. Add "Mr."/"Ms." only if surname-only AND gender explicitly known. E.g., "Yacine Hamzaoui", "Mr. Hamasu", "Dave". Use null if unknown.

function: Function/title. Be concise, use canonical abbreviations. E.g. "SG", "PGA", "Chair", "Representative", "Vice-Chair", "Officer", "Spokesperson", "USG Policy". Use null if unknown.

affiliation: For country representatives, use ISO 3166-1 alpha-3 country codes of their country, e.g. "PRY", "KEN". For organizations use the canonical abbreviation of the organization, e.g. "OECD", "OHCHR", "UN Secretariat", "GA", "5th Committee", "UN80 Initiative". Use null if unknown/not applicable.

group: If the speaker EXPLICITLY states they are speaking ON BEHALF OF a group (not merely supporting, aligning with, or agreeing with). Use canonical abbreviation, e.g. "G77 + China", "EU", "AU". Use null if not speaking on behalf of a group.`;

export interface ParagraphWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string;
}

export interface ParagraphInput {
  text: string;
  start: number;
  end: number;
  words: ParagraphWord[];
}

export type SpeakerMapping = Record<string, SpeakerInfo>;

function createOpenAIClient() {
  return new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: API_VERSION,
  });
}

function normalizeText(text: string): string {
  return text.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function speakersEqual(a: SpeakerInfo, b: SpeakerInfo): boolean {
  return a.name === b.name &&
         a.function === b.function &&
         a.affiliation === b.affiliation &&
         a.group === b.group;
}

interface StatementWithSentences {
  paragraphs: Array<{
    sentences: Array<{
      text: string;
      start: number;
      end: number;
      topic_keys?: string[];
      words: ParagraphWord[];
    }>;
    start: number;
    end: number;
    words: ParagraphWord[];
  }>;
  start: number;
  end: number;
  words: ParagraphWord[];
}

function matchWordsToText(words: ParagraphWord[], offset: number, targetText: string): ParagraphWord[] {
  const normalized = normalizeText(targetText);
  const matched: ParagraphWord[] = [];
  let matchedNorm = '';
  
  for (let i = offset; i < words.length; i++) {
    const testWords = [...matched, words[i]];
    const testNorm = normalizeText(testWords.map(w => w.text).join(' '));
    
    if (normalized.startsWith(testNorm)) {
      matched.push(words[i]);
      matchedNorm = testNorm;
      if (matchedNorm === normalized) break;
    } else {
      break;
    }
  }
  
  return matched;
}

function buildStatementsWithSentences(paragraphInputs: ParagraphInput[]): StatementWithSentences[] {
  return paragraphInputs.map(paraInput => {
    // Split by \n\n to create separate paragraphs
    const parts = paraInput.text.split('\n\n');
    
    const paragraphs: Array<{
      sentences: Array<{ text: string; start: number; end: number; words: ParagraphWord[] }>;
      start: number;
      end: number;
      words: ParagraphWord[];
    }> = [];
    
    let wordOffset = 0;
    
    parts.forEach((part) => {
      const partSentences: string[] = sbd.sentences(part.trim(), { preserve_whitespace: false });
      const sentences: Array<{ text: string; start: number; end: number; words: ParagraphWord[] }> = [];
      
      partSentences.forEach((sentText: string) => {
        // Match sentence to words
        const sentWords = matchWordsToText(paraInput.words, wordOffset, sentText);
        if (sentWords.length > 0) {
          sentences.push({
            text: sentText,
            start: sentWords[0].start,
            end: sentWords[sentWords.length - 1].end,
            words: sentWords,
          });
          wordOffset += sentWords.length;
        }
      });
      
      if (sentences.length > 0) {
        paragraphs.push({
          sentences,
          start: sentences[0].start,
          end: sentences[sentences.length - 1].end,
          words: sentences.flatMap(s => s.words),
        });
      }
    });
    
    return {
      paragraphs,
      start: paraInput.start,
      end: paraInput.end,
      words: paraInput.words,
    };
  });
}

async function defineTopics(
  paragraphs: ParagraphInput[],
  speakerMapping: SpeakerMapping,
  client: AzureOpenAI,
): Promise<Record<string, { key: string; label: string; description: string }>> {
  console.log(`  → Defining topics...`);

  // Build context with paragraphs and speakers, excluding moderators/chairs
  const substantiveStatements = paragraphs
    .map((p, idx) => {
      const speaker = speakerMapping[idx.toString()];
      const isChair = speaker?.function?.toLowerCase().includes('chair') || 
                      speaker?.function?.toLowerCase().includes('president') ||
                      speaker?.function?.toLowerCase().includes('moderator');
      return { paragraph: p, index: idx, speaker, isChair };
    })
    .filter(({ isChair }) => !isChair);

  if (substantiveStatements.length < 2) {
    console.log(`  ℹ Too few non-chair statements (${substantiveStatements.length}), skipping topic analysis`);
    return {};
  }

  const contextParts = substantiveStatements.map(({ paragraph, index, speaker }) => {
    const speakerLabel = speaker?.name || speaker?.affiliation || 'Unknown';
    return `[${index}] ${speakerLabel}: ${paragraph.text}`;
  });

  const completion = await client.chat.completions.create({
    model: 'gpt-5',
    messages: [
      {
        role: 'system',
        content: `You are analyzing a UN proceedings transcript to identify main discussion topics.

TASK:
- Identify 5-10 distinct topics discussed in the transcript
- Each topic must appear in at least 2 different statements by different speakers
- Focus on substantive policy topics, not procedural matters
- For each topic provide:
  - key: kebab-case slug (2-4 words, e.g., "climate-finance")
  - label: Human-readable title with proper case, spaces, and special characters (e.g., "Climate Finance")
  - description: Clear 1-2 sentence explanation

EXAMPLES:
- key: "climate-finance", label: "Climate Finance", description: "Financing mechanisms for climate action and adaptation"
- key: "peacekeeping-mandate", label: "Peacekeeping Mandate", description: "Scope and renewal of peacekeeping operations"
- key: "humanitarian-access", label: "Humanitarian Access", description: "Ensuring humanitarian aid reaches affected populations"
- key: "sdg-implementation", label: "SDG Implementation", description: "Progress on Sustainable Development Goals"

OUTPUT:
- Return 5-10 topics as an array
- Each topic must have key, label, and description fields`,
      },
      {
        role: 'user',
        content: `Analyze these statements from a UN proceeding and identify the main topics:

${contextParts.join('\n\n')}`,
      },
    ],
    response_format: zodResponseFormat(TopicDefinitions, 'topics'),
  });

  const result = completion.choices[0]?.message?.content;
  if (!result) throw new Error('Failed to define topics');

  const parsed = JSON.parse(result) as z.infer<typeof TopicDefinitions>;
  
  // Convert array to record for easier lookup
  const topicsRecord: Record<string, { key: string; label: string; description: string }> = {};
  parsed.topics.forEach(topic => {
    topicsRecord[topic.key] = topic;
  });
  
  const topicKeys = Object.keys(topicsRecord);
  console.log(`  ✓ Identified ${topicKeys.length} topics: [${topicKeys.join(', ')}]`);
  
  return topicsRecord;
}

async function _tagParagraphsWithTopics(
  paragraphs: ParagraphInput[],
  topics: Record<string, { key: string; description: string; color: string }>,
  speakerMapping: SpeakerMapping,
  client: AzureOpenAI,
): Promise<Record<string, string[]>> {
  console.log(`  → Tagging paragraphs with topics...`);

  const topicKeys = Object.keys(topics);
  if (topicKeys.length === 0) {
    console.log(`  ℹ No topics defined, skipping tagging`);
    return {};
  }

  const topicDescriptions = topicKeys.map(key => 
    `- ${key}: ${topics[key].description}`
  ).join('\n');

  const taggingTasks = paragraphs.map(async (para, idx) => {
    const speaker = speakerMapping[idx.toString()];
    
    // Skip chair/moderator statements
    const isChair = speaker?.function?.toLowerCase().includes('chair') || 
                    speaker?.function?.toLowerCase().includes('president') ||
                    speaker?.function?.toLowerCase().includes('moderator');
    
    if (isChair) {
      return { paragraph_index: idx, topic_keys: [] };
    }

    // Build context
    const contextParts: string[] = [];
    
    // Previous paragraph
    if (idx > 0) {
      const prevSpeaker = speakerMapping[(idx - 1).toString()];
      const prevLabel = prevSpeaker?.name || prevSpeaker?.affiliation || 'Unknown';
      contextParts.push(`PREVIOUS: ${prevLabel}: ${paragraphs[idx - 1].text.substring(0, 200)}...`);
    }
    
    // Current paragraph
    const currentLabel = speaker?.name || speaker?.affiliation || 'Unknown';
    contextParts.push(`CURRENT: ${currentLabel}: ${para.text}`);
    
    // Next paragraph
    if (idx < paragraphs.length - 1) {
      const nextSpeaker = speakerMapping[(idx + 1).toString()];
      const nextLabel = nextSpeaker?.name || nextSpeaker?.affiliation || 'Unknown';
      contextParts.push(`NEXT: ${nextLabel}: ${paragraphs[idx + 1].text.substring(0, 200)}...`);
    }

    try {
      const completion = await client.chat.completions.create({
        model: 'gpt-5',
        messages: [
          {
            role: 'system',
            content: `You are tagging UN proceeding statements with relevant topics.

AVAILABLE TOPICS:
${topicDescriptions}

TASK:
- Analyze the CURRENT statement
- Select 0-3 topics that are directly discussed
- Only tag substantive policy discussions
- Return empty array if no topics apply or if statement is purely procedural

RULES:
- A topic applies if the statement makes substantive points about it
- Brief mentions don't count - the statement must engage with the topic
- When uncertain, don't tag`,
          },
          {
            role: 'user',
            content: `Which topics (if any) are discussed in this statement?

${contextParts.join('\n\n')}`,
          },
        ],
        response_format: zodResponseFormat(ParagraphTopicTags, 'tags'),
      });

      const result = completion.choices[0]?.message?.content;
      if (!result) {
        return { paragraph_index: idx, topic_keys: [] };
      }

      const parsed = JSON.parse(result) as z.infer<typeof ParagraphTopicTags>;
      return { paragraph_index: idx, topic_keys: parsed.topic_keys };
    } catch (error) {
      console.warn(`  ⚠ Failed to tag paragraph ${idx}:`, error instanceof Error ? error.message : error);
      return { paragraph_index: idx, topic_keys: [] };
    }
  });

  const results = await Promise.all(taggingTasks);
  
  const paragraphTopics: Record<string, string[]> = {};
  results.forEach(({ paragraph_index, topic_keys }) => {
    paragraphTopics[paragraph_index.toString()] = topic_keys;
  });

  const taggedCount = results.filter(r => r.topic_keys.length > 0).length;
  console.log(`  ✓ Tagged ${taggedCount}/${paragraphs.length} paragraphs with topics`);

  return paragraphTopics;
}

async function tagSentencesWithTopics(
  statements: StatementWithSentences[],
  topics: Record<string, { key: string; label: string; description: string }>,
  speakerMapping: SpeakerMapping,
  client: AzureOpenAI
): Promise<StatementWithSentences[]> {
  console.log(`  → Tagging sentences with topics...`);

  const topicKeys = Object.keys(topics);
  if (topicKeys.length === 0) {
    console.log(`  ℹ No topics defined, skipping tagging`);
    return statements;
  }

  const topicDescriptions = topicKeys.map(key => 
    `- ${key}: ${topics[key].description}`
  ).join('\n');

  // Build flat list of all sentences with metadata
  interface SentenceWithMeta {
    statementIdx: number;
    paragraphIdx: number;
    sentenceIdx: number;
    text: string;
    speaker: SpeakerInfo;
  }

  const allSentences: SentenceWithMeta[] = [];
  
  statements.forEach((stmt, stmtIdx) => {
    const speaker = speakerMapping[stmtIdx.toString()];
    stmt.paragraphs.forEach((para, paraIdx) => {
      para.sentences.forEach((sent, sentIdx) => {
        allSentences.push({
          statementIdx: stmtIdx,
          paragraphIdx: paraIdx,
          sentenceIdx: sentIdx,
          text: sent.text,
          speaker,
        });
      });
    });
  });

  // Filter out moderator/chair sentences
  const taggableSentences: Array<{ index: number; sentence: SentenceWithMeta }> = [];
  allSentences.forEach((sent, idx) => {
    const isModerator = sent.speaker.function?.toLowerCase().includes('chair') ||
                       sent.speaker.function?.toLowerCase().includes('president') ||
                       sent.speaker.function?.toLowerCase().includes('moderator');
    if (!isModerator) {
      taggableSentences.push({ index: idx, sentence: sent });
    }
  });

  // Parallel tagging with context
  const SentenceTopicResponse = z.object({
    topic_keys: z.array(z.string()),
  });

  const tasks = taggableSentences.map(async ({ index: globalIdx, sentence: sent }) => {
    // Context: 2 sentences before and after from all sentences
    const contextBefore = allSentences.slice(Math.max(0, globalIdx - 2), globalIdx);
    const contextAfter = allSentences.slice(globalIdx + 1, Math.min(allSentences.length, globalIdx + 3));
    
    const numberedSentences = [
      ...contextBefore.map((s, i) => `[${i - contextBefore.length}] ${s.text}`),
      `[CURRENT] ${sent.text}`,
      ...contextAfter.map((s, i) => `[+${i + 1}] ${s.text}`),
    ].join('\n');
    
    try {
      const completion = await client.chat.completions.create({
        model: 'gpt-5',
        messages: [{
          role: 'system',
          content: `You are categorizing UN proceeding sentences by topic.

AVAILABLE TOPICS:
${topicDescriptions}

TASK:
- Analyze the [CURRENT] sentence
- Select 0-3 topics that are directly discussed
- Only tag substantive policy discussions
- Return empty array if no topics apply or if purely procedural

RULES:
- A topic applies if the sentence makes substantive points about it
- Brief mentions don't count
- When uncertain, don't tag
- Return only topic keys, not labels or descriptions`,
        }, {
          role: 'user',
          content: `Which topics (if any) are discussed in the [CURRENT] sentence?

${numberedSentences}`,
        }],
        response_format: zodResponseFormat(SentenceTopicResponse, 'sentence_topics'),
      });
      
      const result = completion.choices[0]?.message?.content;
      if (!result) return { ...sent, topic_keys: [] };
      
      const parsed = JSON.parse(result) as z.infer<typeof SentenceTopicResponse>;
      return { ...sent, topic_keys: parsed.topic_keys };
    } catch (error) {
      console.warn(`  ⚠ Failed to tag sentence:`, error);
      return { ...sent, topic_keys: [] };
    }
  });
  
  const taggedSentences = await Promise.all(tasks);
  
  // Apply topic tags back to statements
  const updatedStatements: StatementWithSentences[] = statements.map(stmt => ({
    ...stmt,
    paragraphs: stmt.paragraphs.map(para => ({
      ...para,
      sentences: para.sentences.map(s => ({ ...s })),
    })),
  }));
  
  taggedSentences.forEach(tagged => {
    const stmt = updatedStatements[tagged.statementIdx];
    const para = stmt.paragraphs[tagged.paragraphIdx];
    para.sentences[tagged.sentenceIdx].topic_keys = tagged.topic_keys;
  });
  
  const taggedCount = taggedSentences.filter(s => s.topic_keys && s.topic_keys.length > 0).length;
  console.log(`  ✓ Tagged ${taggedCount}/${taggableSentences.length} sentences with topics`);
  
  return updatedStatements;
}

async function resegmentParagraph(
  client: AzureOpenAI,
  paragraph: ParagraphInput,
  contextParas: Array<{ para: ParagraphInput, speaker: SpeakerInfo, position: 'before' | 'current' | 'after' }>,
  paragraphIndex?: number,
): Promise<{ segments: ParagraphInput[], speakers: SpeakerInfo[] }> {
  const formatPara = (p: ParagraphInput, s: SpeakerInfo, label: string) => {
    const text = p.words.map(w => w.text).join(' ');
    const speakerStr = s?.name || 'Unknown';
    const preview = text.length > 150 ? text.substring(0, 150) + '...' : text;
    return `${label}:\nSpeaker: ${speakerStr}\nText: ${preview}`;
  };

  const beforeParas = contextParas.filter(c => c.position === 'before');
  const currentPara = contextParas.find(c => c.position === 'current')!;
  const afterParas = contextParas.filter(c => c.position === 'after');
  const currentSpeaker = currentPara.speaker;

  const contextParts = [
    ...beforeParas.reverse().map((c, i) => formatPara(c.para, c.speaker, `BEFORE-${beforeParas.length - i}`)),
    `CURRENT (TO SPLIT):\nSpeaker: ${currentSpeaker.name || 'Unknown'}\nText: ${paragraph.text}`,
    ...afterParas.map((c, i) => formatPara(c.para, c.speaker, `AFTER+${i + 1}`)),
  ];

  const context = contextParts.join('\n\n');

  const completion = await client.chat.completions.create({
    model: 'gpt-5',
    messages: [
      {
        role: 'system',
        content: `You are an expert at correcting speaker segmentation errors in UN proceedings transcripts.

BACKGROUND:
This transcript was created by automatic speech recognition (AssemblyAI), which divided the audio into paragraphs. However, the automatic paragraph boundaries are sometimes incorrect - a paragraph may contain the end of one speaker's remarks followed by the beginning of another speaker's remarks, all incorrectly grouped together.

In an initial identification pass, we detected that the CURRENT paragraph likely contains speech from multiple different speakers mixed together (e.g., the last few sentences of one speaker followed by the first sentences of the next speaker).

YOUR TASK:
Determine WHO IS SPEAKING each part of the CURRENT paragraph. If different people speak different parts, split at the speaker change boundaries.

You are provided context:
- BEFORE-N paragraphs: Who was speaking before, providing conversation flow
- CURRENT paragraph: The paragraph to evaluate (may contain multiple speakers)
- AFTER+N paragraphs: Who speaks next, helping identify transitions

FUNDAMENTAL QUESTION:
Is the entire CURRENT paragraph spoken by one person, or does it contain words from multiple different speakers?

Think semantically, not by keyword patterns:
- WHO is saying the opening words?
- WHO is saying the closing words?
- Does the speaker change in the middle?
- Use BEFORE/AFTER context to understand who should be speaking when

DECISION PROCESS:

1. Analyze the content semantically:
   - If one person speaks throughout → should_split = false
   - If multiple people speak different parts → should_split = true
   - Look for actual speaker changes, not just topic shifts within one speech

2. Common scenarios where splitting IS needed:
   - Previous speaker finishes, then chair/moderator speaks
   - Chair hands off floor, and next speaker begins
   - Question from one person, answer from another
   - Brief back-and-forth exchanges

3. Common scenarios where splitting is NOT needed:
   - Opening formalities as part of one speech: "Thank you, Chair. Today I will..."
   - One person's continuous remarks, however long
   - Rhetorical devices, quotes, or references within one speech

4. If should_split = true:
   - Split at EACH speaker boundary
   - Return exact text for each segment (one segment per speaker)
   - Identify who is speaking each segment
   - Text integrity: concatenated segments MUST equal original exactly

5. Set confidence and reason:
   - confidence: "high" if clear speaker changes, "medium" if somewhat ambiguous, "low" if uncertain
   - reason: Brief explanation focused on WHO is speaking and why you're splitting/not splitting

${IDENTIFICATION_RULES}

${COMMON_ABBREVIATIONS}

${SCHEMA_DEFINITIONS}

should_split: Boolean - Does this paragraph contain words spoken by multiple different people? True if different speakers, false if one continuous speaker throughout.

confidence: Your confidence in determining who is speaking:
- "high": Very clear who speaks each part
- "medium": Reasonably clear but some ambiguity
- "low": Uncertain about speaker boundaries

reason: Brief explanation (1-2 sentences) focusing on WHO is speaking. Examples: "Delegate finishes remarks, then chair responds" or "One continuous speech by the representative, opening courtesy is part of their remarks".

text: EXACT text of each segment, copied character-by-character from the CURRENT paragraph. Every word, comma, period, space must be preserved exactly. Do NOT include speaker labels, prefixes like "(Speaker: ...)", or other metadata - ONLY the actual spoken words.
`,
      },
      {
        role: 'user',
        content: `Analyze the CURRENT paragraph in context and determine if it should be split:

${context}

The BEFORE and AFTER paragraphs provide context about the conversation flow. Use them to understand:
- Who was speaking before
- Who speaks after
- Whether the CURRENT paragraph likely contains a transition between these speakers

If you determine the CURRENT paragraph should be split, copy the exact text from the "Text:" line of the CURRENT paragraph (not from BEFORE/AFTER paragraphs) and split it at speaker boundaries, returning each segment with its speaker identification.`,
      },
    ],
    response_format: zodResponseFormat(ResegmentationResult, 'resegmentation'),
  });

  const result = completion.choices[0]?.message?.content;
  const finishReason = completion.choices[0]?.finish_reason;
  
  if (!result) {
    if (finishReason === 'content_filter') {
      const indexStr = paragraphIndex !== undefined ? ` [${paragraphIndex}]` : '';
      console.warn(`  ⚠ Content filter triggered for paragraph${indexStr}, keeping original unsplit`);
      return {
        segments: [paragraph],
        speakers: [currentSpeaker],
      };
    }
    console.error('Resegmentation API response:', JSON.stringify(completion, null, 2));
    throw new Error(`Failed to resegment paragraph: no content in response. Finish reason: ${finishReason}`);
  }

  let parsed: z.infer<typeof ResegmentationResult>;
  try {
    parsed = JSON.parse(result);
  } catch (e) {
    console.error('Failed to parse resegmentation result:', result);
    throw new Error(`Failed to parse resegmentation JSON: ${e instanceof Error ? e.message : e}`);
  }

  // Check if splitting is recommended
  if (!parsed.should_split) {
    const indexStr = paragraphIndex !== undefined ? ` [${paragraphIndex}]` : '';
    console.log(`  → Para${indexStr} kept unsplit (${parsed.confidence} confidence): ${parsed.reason}`);
    return {
      segments: [paragraph],
      speakers: [currentSpeaker],
    };
  }

  // For low confidence splits, keep original
  if (parsed.confidence === 'low') {
    const indexStr = paragraphIndex !== undefined ? ` [${paragraphIndex}]` : '';
    console.warn(`  ⚠ Low confidence split for para${indexStr}, keeping original: ${parsed.reason}`);
    return {
      segments: [paragraph],
      speakers: [currentSpeaker],
    };
  }

  const indexStr = paragraphIndex !== undefined ? ` [${paragraphIndex}]` : '';
  console.log(`  ✓ Para${indexStr} split into ${parsed.segments.length} (${parsed.confidence} confidence): ${parsed.reason}`);

  // Verify content integrity
  const originalNormalized = normalizeText(paragraph.text);
  const segmentsNormalized = normalizeText(parsed.segments.map(s => s.text).join(' '));
  
  if (originalNormalized !== segmentsNormalized) {
    console.warn(`  ⚠ Content mismatch after resegmentation!`);
    console.warn(`    Original: "${paragraph.text.substring(0, 100)}..."`);
    console.warn(`    Segments: "${parsed.segments.map(s => s.text).join(' ').substring(0, 100)}..."`);
  }

  // Match segment texts to words
  const segments: ParagraphInput[] = [];
  const speakers: SpeakerInfo[] = [];
  let wordOffset = 0;

  for (const seg of parsed.segments) {
    const segNormalized = normalizeText(seg.text);
    const words: typeof paragraph.words = [];
    let matchedNormalized = '';

    while (wordOffset < paragraph.words.length && matchedNormalized.length < segNormalized.length) {
      words.push(paragraph.words[wordOffset]);
      matchedNormalized = normalizeText(words.map(w => w.text).join(' '));
      wordOffset++;
    }

    if (words.length > 0) {
      segments.push({
        text: words.map(w => w.text).join(' '),
        start: words[0].start,
        end: words[words.length - 1].end,
        words,
      });
      speakers.push({
        name: seg.name,
        function: seg.function,
        affiliation: seg.affiliation,
        group: seg.group,
      });
    }
  }

  return { segments, speakers };
}

export async function identifySpeakers(
  paragraphs: ParagraphInput[],
  transcriptId?: string,
) {
  if (!paragraphs?.length) {
    throw new Error('No paragraphs provided');
  }

  console.log(`  → Analyzing ${paragraphs.length} paragraphs...`);

  const transcriptParts = paragraphs.map((para, index) => {
    const text = para.words.map(word => word.text).join(' ');
    const assemblySpeaker = para.words?.[0]?.speaker || 'Unknown';
    return `[${index}] (AssemblyAI: Speaker ${assemblySpeaker}) ${text}`;
  });

  const client = createOpenAIClient();

  const completion = await client.chat.completions.create({
    model: 'gpt-5',
    messages: [
      {
        role: 'system',
        content: `You are an expert at identifying speakers in UN proceedings. For each paragraph in the transcript, extract the speaker's name, function/title, affiliation, and country-group information strictly from the context.

CRITICAL: Identify WHO IS ACTUALLY SPEAKING each paragraph, NOT who is being introduced or mentioned.

TASK:
- Each paragraph is numbered [0], [1], [2], etc.
- Each paragraph has an AssemblyAI speaker label (A, B, C, etc.) - these are HINTS from automatic diarization
- WARNING: AssemblyAI labels may be incorrect or inconsistent - use them as hints, not facts
- For each paragraph, identify the ACTUAL SPEAKER (person saying those words) based on the text content
- IMPORTANT: If a paragraph contains "I invite X" or "X has the floor", the speaker is the person doing the inviting/giving the floor (usually the Chair), NOT X
- X will speak in SUBSEQUENT paragraphs
- When a speaker continues across multiple paragraphs, repeat their information
- Process EVERY paragraph from [0] to [last]. Never stop early.

MIXED SPEAKER DETECTION:
Your task is to determine: Does this paragraph contain speech from multiple different people?

Focus on WHO IS SPEAKING, not keyword patterns. Ask yourself:
- Is the entire paragraph spoken by one person?
- Or does it contain words from multiple different speakers?

Common scenarios where paragraphs mix speakers:
  - Previous speaker finishes their remarks, then chair/moderator responds
  - Chair gives floor to someone, and that person begins speaking
  - Question and answer both captured in same paragraph
  - Brief exchanges between people in informal settings
  - Speaker concludes, procedural language follows

Helpful indicators (but not hard rules):
  - Shift from one person's remarks to another person's procedural language
  - Topic/tone/perspective changes midway through paragraph
  - First-person speech mixed with third-person procedural descriptions
  - AssemblyAI speaker labels changing within the paragraph
  - Phrases like "I give/invite/call upon [Name]" followed by more text

NOT mixed speakers:
  - Opening courtesies within one person's speech ("Thank you, Chair. Today I will discuss...")
  - One person's continuous remarks, even if long or referring to others
  - Rhetorical questions, quotes, or historical references within one speech
  - Pure procedural language from one chair/moderator

When uncertain, flag it - we'll verify during resegmentation. The goal is to catch genuine multi-speaker paragraphs while avoiding obvious false positives.

OFF-RECORD CONTENT DETECTION:
Mark is_off_record = true for paragraphs that are clearly NOT part of the formal meeting/proceeding.

ONLY mark paragraphs at the VERY START or VERY END of the transcript. NEVER mark middle paragraphs.

Examples of off-record content:
  - Pre-meeting small talk, audio testing, technical checks
  - "Can you hear me?", "Testing, testing", "Is the mic on?"
  - Private conversations before the meeting starts
  - Gibberish, single words with no context (e.g., just "It", just "Okay")
  - Post-meeting informal remarks clearly after formal closing
  - Background noise transcribed as words

Only mark as off-record when it's VERY CLEAR the content is not part of the official proceeding.
If uncertain, mark as false - better to include too much than exclude formal content.

Typical patterns:
  - First 1-3 paragraphs: check if they're pre-meeting chatter before formal opening
  - Last 1-3 paragraphs: check if they're post-meeting remarks after formal closing
  - Middle paragraphs: ALWAYS mark is_off_record = false

${IDENTIFICATION_RULES}

${COMMON_ABBREVIATIONS}

${SCHEMA_DEFINITIONS}

has_multiple_speakers: Boolean - Does this paragraph contain words spoken by multiple different people? True if multiple speakers' words are mixed together, false if one person speaks the entire paragraph.

is_off_record: Boolean - Is this paragraph clearly NOT part of the formal meeting? Only true for paragraphs at the very start/end that are obviously pre-meeting chatter, audio tests, gibberish, or post-meeting remarks. When uncertain, use false.
`,
      },
      {
        role: 'user',
        content: `Analyze the following UN transcript and identify the speaker for each numbered paragraph.

Transcript:
${transcriptParts.join('\n\n')}`,
      },
    ],
    response_format: zodResponseFormat(ParagraphSpeakerMapping, 'paragraph_speaker_mapping'),
  });

  const result = completion.choices[0]?.message?.content;
  if (!result) throw new Error('Failed to parse speaker mappings');

  const parsed = JSON.parse(result) as z.infer<typeof ParagraphSpeakerMapping>;
  console.log(`  ✓ Initial identification complete`);

  // Log off-record paragraphs
  const offRecord = parsed.paragraphs
    .filter(p => p.is_off_record)
    .map(p => p.index);
  if (offRecord.length > 0) {
    console.log(`  ℹ Found ${offRecord.length} off-record paragraph(s): [${offRecord.join(', ')}]`);
  }

  // Collect paragraphs needing resegmentation
  const toResegment = parsed.paragraphs
    .filter(p => p.has_multiple_speakers)
    .map(p => p.index);

  let finalParagraphs = [...paragraphs];
  let finalMapping: SpeakerMapping = {};

  // Build initial mapping
  parsed.paragraphs.forEach(para => {
    finalMapping[para.index.toString()] = {
      name: para.name,
      function: para.function,
      affiliation: para.affiliation,
      group: para.group,
      is_off_record: para.is_off_record || undefined,
    };
  });

  // Resegment in parallel
  if (toResegment.length > 0) {
    console.log(`  → Found ${toResegment.length} paragraph(s) with mixed speakers: [${toResegment.join(', ')}]`);
    
    const CONTEXT_SIZE = 3; // Number of paragraphs before and after
    
    const resegmentTasks = toResegment.map(async (idx) => {
      const para = paragraphs[idx];
      const speaker = finalMapping[idx.toString()];
      
      // Gather context paragraphs
      const contextParas: Array<{ para: ParagraphInput, speaker: SpeakerInfo, position: 'before' | 'current' | 'after' }> = [];
      
      // Add before context
      for (let i = Math.max(0, idx - CONTEXT_SIZE); i < idx; i++) {
        contextParas.push({
          para: paragraphs[i],
          speaker: finalMapping[i.toString()],
          position: 'before',
        });
      }
      
      // Add current
      contextParas.push({
        para: para,
        speaker: speaker,
        position: 'current',
      });
      
      // Add after context
      for (let i = idx + 1; i <= Math.min(paragraphs.length - 1, idx + CONTEXT_SIZE); i++) {
        contextParas.push({
          para: paragraphs[i],
          speaker: finalMapping[i.toString()],
          position: 'after',
        });
      }

      return await resegmentParagraph(
        client,
        para,
        contextParas,
        idx,
      ).then(result => ({ index: idx, ...result }));
    });

    const resegmented = await Promise.all(resegmentTasks);
    console.log(`  ✓ Resegmentation and speaker identification complete`);
    console.log(`  → Rebuilding transcript with split paragraphs...`);

    // Rebuild paragraphs array and mapping
    const newParagraphs: ParagraphInput[] = [];
    const newMapping: SpeakerMapping = {};
    let currentNewIndex = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const reseg = resegmented.find(r => r.index === i);
      
      if (reseg) {
        // Replace with segments
        for (let j = 0; j < reseg.segments.length; j++) {
          newParagraphs.push(reseg.segments[j]);
          newMapping[currentNewIndex.toString()] = reseg.speakers[j];
          currentNewIndex++;
        }
      } else {
        // Keep original
        newParagraphs.push(paragraphs[i]);
        newMapping[currentNewIndex.toString()] = finalMapping[i.toString()];
        currentNewIndex++;
      }
    }

    finalParagraphs = newParagraphs;
    finalMapping = newMapping;
    console.log(`  ✓ Rebuilt transcript: ${paragraphs.length} → ${finalParagraphs.length} paragraphs`);
  }

  // Filter out off-record paragraphs
  const offRecordIndices = Object.keys(finalMapping)
    .filter(idx => finalMapping[idx].is_off_record)
    .map(idx => parseInt(idx));
  
  if (offRecordIndices.length > 0) {
    console.log(`  → Filtering out ${offRecordIndices.length} off-record paragraph(s): [${offRecordIndices.join(', ')}]`);
    
    // Remove from paragraphs array
    const filteredParagraphs: ParagraphInput[] = [];
    const filteredMapping: SpeakerMapping = {};
    let newIndex = 0;
    
    for (let i = 0; i < finalParagraphs.length; i++) {
      if (!finalMapping[i.toString()].is_off_record) {
        filteredParagraphs.push(finalParagraphs[i]);
        const speaker = { ...finalMapping[i.toString()] };
        delete speaker.is_off_record; // Remove flag from final output
        filteredMapping[newIndex.toString()] = speaker;
        newIndex++;
      }
    }
    
    finalParagraphs = filteredParagraphs;
    finalMapping = filteredMapping;
    console.log(`  ✓ Kept ${finalParagraphs.length} on-record paragraphs`);
  }

  // Group consecutive same-speaker paragraphs
  if (finalParagraphs.length > 0) {
    const groupedParagraphs: ParagraphInput[] = [];
    const groupedMapping: SpeakerMapping = {};
    
    let currentGroup = { ...finalParagraphs[0] };
    let currentSpeaker = finalMapping['0'];
    
    for (let i = 1; i < finalParagraphs.length; i++) {
      const para = finalParagraphs[i];
      const speaker = finalMapping[i.toString()];
      
      if (speakersEqual(currentSpeaker, speaker)) {
        // Merge with current group
        currentGroup = {
          text: currentGroup.text + '\n\n' + para.text,
          start: currentGroup.start,
          end: para.end,
          words: [...currentGroup.words, ...para.words],
        };
      } else {
        // Save current group and start new
        groupedParagraphs.push(currentGroup);
        groupedMapping[groupedParagraphs.length - 1] = currentSpeaker;
        currentGroup = { ...para };
        currentSpeaker = speaker;
      }
    }
    
    // Don't forget the last group
    groupedParagraphs.push(currentGroup);
    groupedMapping[groupedParagraphs.length - 1] = currentSpeaker;
    
    if (groupedParagraphs.length < finalParagraphs.length) {
      console.log(`  ✓ Grouped consecutive same-speaker paragraphs: ${finalParagraphs.length} → ${groupedParagraphs.length} paragraphs`);
    }
    
    finalParagraphs = groupedParagraphs;
    finalMapping = groupedMapping;
  }

  // Build statements with sentences
  const statementsWithSentences = buildStatementsWithSentences(finalParagraphs);
  
  // Save statements immediately after speaker identification (before topic analysis)
  if (transcriptId) {
    console.log(`  → Saving speaker identification results...`);
    const transcript = await getTranscriptById(transcriptId);
    if (transcript) {
      await updateTranscriptContent(transcriptId, {
        raw_paragraphs: transcript.content.raw_paragraphs,
        statements: statementsWithSentences,
        topics: {},
      });
      await setSpeakerMapping(transcriptId, finalMapping);
      console.log(`  ✓ Saved statements and speaker mappings`);
    }
  }
  
  // Define and tag topics
  let topics: Record<string, { key: string; label: string; description: string }> = {};
  let taggedStatements = statementsWithSentences;
  
  if (statementsWithSentences.length > 0 && transcriptId) {
    await updateTranscriptStatus(transcriptId, 'analyzing_topics');
    console.log(`  → Analyzing topics...`);
    
    try {
      topics = await defineTopics(finalParagraphs, finalMapping, client);
      taggedStatements = await tagSentencesWithTopics(statementsWithSentences, topics, finalMapping, client);
      
      // Save final result with topics
      const transcript = await getTranscriptById(transcriptId);
      if (transcript) {
        await updateTranscriptContent(transcriptId, {
          raw_paragraphs: transcript.content.raw_paragraphs,
          statements: taggedStatements,
          topics,
        });
        console.log(`  ✓ Saved topics`);
      }
    } catch (error) {
      console.warn(`  ⚠ Failed to analyze topics:`, error instanceof Error ? error.message : error);
      // Keep the statements without topics - don't fail completely
    }
  }

  return finalMapping;
}

