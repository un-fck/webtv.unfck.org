/**
 * Gemini-based transcription + speaker identification for UN proceedings.
 *
 * Replaces stages 1-3 (AssemblyAI transcription + OpenAI initial speaker mapping
 * + OpenAI resegmentation) with a single Gemini call that:
 *   - Transcribes the audio verbatim (full turn text required)
 *   - Identifies speakers by name/function/affiliation/group from audio context
 *   - Word timestamps are interpolated uniformly across each segment's [start, end]
 *
 * Note on word-level timestamps: Gemini's constrained decoding fills every required
 * field. For a 30-min session, per-word timestamps (~4500 words × ~12 tokens/word)
 * consume the entire 65K output token budget, causing MAX_TOKENS truncation and
 * invalid JSON. We therefore use segment-level text (very token-efficient) and
 * derive word timestamps by uniform interpolation.
 *
 * Timestamp accuracy: Gemini hallucinates timestamps on audio-only files for clips
 * longer than ~10 minutes — a well-documented issue across all model versions. The
 * only reliable mitigation is chunking: 10-minute clips consistently produce correct
 * timestamps (0% out-of-range) while 20+ minute clips degrade rapidly. Each chunk
 * is told its exact duration in the prompt. Results are stitched with known offsets.
 */
import fs from 'fs';
import https from 'https';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import { AzureOpenAI } from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { downloadAudioToTemp } from '../eval/utils';
import { trackOpenAIChatCompletion, UsageOperations, UsageStages } from './usage-tracking';
import type { RawParagraph } from './turso';
import type { SpeakerInfo, SpeakerMapping } from './speakers';

const execFileAsync = promisify(execFile);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
export const GEMINI_MODEL = 'gemini-3-flash-preview';
const BASE = 'https://generativelanguage.googleapis.com';

// Audio longer than this is processed in chunks (10 minutes — empirically the
// reliable limit before Gemini timestamp hallucination becomes common).
const CHUNK_THRESHOLD_SECONDS = 10 * 60;
// Each chunk is 10 minutes
const CHUNK_DURATION_SECONDS = 10 * 60;

// ---- Schema types ----

interface GeminiSegment {
  speaker_name: string | null;
  speaker_function: string | null;
  speaker_affiliation: string | null;
  speaker_group: string | null;
  is_off_record: boolean;
  start_time: string; // HH:MM:SS
  end_time: string;   // HH:MM:SS
  text: string;       // Full verbatim text of this turn
}

interface GeminiTranscriptOutput {
  segments: GeminiSegment[];
}


export interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount: number;
  totalTokenCount: number;
}

export interface GeminiTranscriptionOptions {
  /** Enable Gemini's dynamic thinking (slightly higher quality, uses extra tokens). Default: false. */
  withThinking?: boolean;
  /** BCP-47 language code, e.g. 'en', 'fr'. Default: 'en'. */
  language?: string;
  /** Transcript ID for logging. */
  transcriptId?: string;
}

export interface GeminiTranscriptionResult {
  paragraphs: RawParagraph[];
  speakerMapping: SpeakerMapping;
  usageMetadata: GeminiUsageMetadata;
  audioSeconds: number;
  chunked: boolean;
  chunkCount: number;
}

// ---- Timestamp utilities ----

/** Parse HH:MM:SS (or HH:MM:SS.mmm) to milliseconds */
function parseHHMMSS(ts: string): number {
  if (!ts) return 0;
  const parts = ts.split(':');
  if (parts.length === 3) {
    return (Number(parts[0]) * 3600 + Number(parts[1]) * 60 + parseFloat(parts[2])) * 1000;
  }
  if (parts.length === 2) {
    return (Number(parts[0]) * 60 + Number(parts[1])) * 1000;
  }
  return 0;
}

/**
 * Interpolate word timestamps uniformly across [startMs, endMs].
 * Used as a fallback when Gemini didn't provide per-word timestamps.
 * Confidence 0.6 = interpolated estimate.
 */
function interpolateWords(
  wordTexts: string[],
  startMs: number,
  endMs: number,
  confidence = 0.6,
): RawParagraph['words'] {
  if (wordTexts.length === 0) return [];
  const durationMs = Math.max(0, endMs - startMs);
  const msPerWord = wordTexts.length > 1 ? durationMs / wordTexts.length : durationMs;
  return wordTexts.map((text, i) => ({
    text,
    start: Math.round(startMs + i * msPerWord),
    end: Math.round(startMs + (i + 1) * msPerWord),
    confidence,
  }));
}

/** Convert Gemini segments to RawParagraph[] + SpeakerMapping */
function segmentsToOutput(
  segments: GeminiSegment[],
  chunkOffsetMs = 0,
): { paragraphs: RawParagraph[]; speakerMapping: SpeakerMapping } {
  const paragraphs: RawParagraph[] = [];
  const speakerMapping: SpeakerMapping = {};

  for (const seg of segments) {
    const segStart = parseHHMMSS(seg.start_time) + chunkOffsetMs;
    const segEnd = parseHHMMSS(seg.end_time) + chunkOffsetMs;

    // Interpolate word timestamps uniformly across the segment
    const wordTexts = seg.text.split(/\s+/).filter(Boolean);
    const words = interpolateWords(wordTexts, segStart, segEnd);

    if (words.length === 0) continue;

    const text = seg.text;
    const idx = paragraphs.length;
    paragraphs.push({ text, start: segStart, end: segEnd, words });

    const speaker: SpeakerInfo = {
      name: seg.speaker_name ?? null,
      function: seg.speaker_function ?? null,
      affiliation: seg.speaker_affiliation ?? null,
      group: seg.speaker_group ?? null,
    };
    if (seg.is_off_record) speaker.is_off_record = true;
    speakerMapping[idx.toString()] = speaker;
  }

  return { paragraphs, speakerMapping };
}

// ---- JSON extraction ----

/** Extract the first top-level {...} JSON object from a free-text response. */
function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('No JSON object found in response');
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error('Unterminated JSON object in response');
}

function fmtHHMMSS(totalSec: number): string {
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const ss = String(Math.floor(totalSec % 60)).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function buildPrompt(langName: string, chunkDurationSec?: number): string {
  const durationLine = chunkDurationSec != null
    ? `This audio segment is ${fmtHHMMSS(chunkDurationSec)} long. All timestamps must be between 00:00:00 and ${fmtHHMMSS(chunkDurationSec)}.`
    : null;

  return [
    `Transcribe and analyze this United Nations meeting audio recording in ${langName}.`,
    ...(durationLine ? [durationLine, ''] : ['']),
    'OUTPUT FORMAT:',
    'Respond with a single JSON object (no markdown, no explanation) with this structure:',
    '{',
    '  "segments": [',
    '    {',
    '      "speaker_name": "Stéphane Dujarric",  // full name with correct accents, or null',
    '      "speaker_function": "Spokesperson",    // official title, or null',
    '      "speaker_affiliation": "UN Secretariat", // ISO 3166-1 alpha-3 or UN body, or null',
    '      "speaker_group": null,                 // group spoken on behalf of, or null',
    '      "is_off_record": false,',
    '      "start_time": "00:00:00",',
    '      "end_time": "00:01:23",',
    '      "text": "Verbatim transcript of this speaker turn."',
    '    }',
    '  ]',
    '}',
    '',
    'TRANSCRIPTION REQUIREMENTS:',
    '1. Transcribe every word verbatim — do not correct grammar, summarize, or paraphrase.',
    '2. Include filler words, false starts, and repetitions.',
    '3. Identify each speaker turn and split at every speaker change.',
    '4. Use HH:MM:SS format for all timestamps (e.g. "01:23:45").',
    '',
    'SPEAKER IDENTIFICATION:',
    '- Identify speakers from self-introductions, voice changes, and contextual cues in the audio.',
    '- speaker_name: Full name as stated, preserving correct spelling and accents (e.g. "Stéphane Dujarric", "Máximo Prévot"). Null if not determinable.',
    '- speaker_function: Official title. Use "Representative", "Chair", "Co-Chair", "Moderator", "SG", "USG [portfolio]", etc.',
    '- speaker_affiliation: ISO 3166-1 alpha-3 for countries (e.g. "USA", "FRA", "CHN", "PRY", "KEN").',
    '  For UN bodies use abbreviations: "IAHWG", "OHCHR", "ACABQ", "UN Secretariat", "GA", "5th Committee".',
    '- speaker_group: ONLY fill if speaker explicitly says "on behalf of", "speaking for", or "representing" a group.',
    '  Groups: G77 + China, NAM, EU, WEOG, GRULAC, Africa Group, Asia-Pacific Group, EEG, AOSIS, Arab Group, OIC, BRICS, LDCs, SIDS.',
    '- Known UN80/IAHWG co-chairs: Carolyn Schwalger and Brian Wallace (affiliation: "IAHWG", function: "Co-Chair").',
    '- Fix transcription errors: "UN80 Initiative" (not "UNAT", "UNA", "UNAT Initiative").',
    '- "IAHWG" = Informal Ad hoc Working Group on the UN80 initiative / mandate implementation review.',
    '',
    'OFF-RECORD DETECTION:',
    '- Mark is_off_record=true ONLY for content clearly outside the formal meeting',
    '  (audio tests, "Can you hear me?", pre-meeting chatter, post-meeting informal remarks).',
    '- Only applies to the very first or last speaker turns. Always false for everything in the middle.',
    '- When uncertain, use false.',
  ].join('\n');
}

// ---- Gemini Files API helpers ----

function httpsPostJson(url: string, body: object): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 600_000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk as Buffer));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Gemini request timeout')); });
    req.write(data);
    req.end();
  });
}

async function uploadFileToGemini(filePath: string): Promise<{ name: string; uri: string }> {
  const fileSize = fs.statSync(filePath).size;
  const fileData = fs.readFileSync(filePath);

  const startRes = await fetch(`${BASE}/upload/v1beta/files?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(fileSize),
      'X-Goog-Upload-Header-Content-Type': 'audio/mp4',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { displayName: `un-transcript-${Date.now()}` } }),
  });
  if (!startRes.ok) throw new Error(`Gemini upload start failed ${startRes.status}: ${await startRes.text()}`);
  const uploadUrl = startRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) throw new Error('No Gemini upload URL returned');

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(fileSize),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: fileData,
  });
  if (!uploadRes.ok) throw new Error(`Gemini file upload failed ${uploadRes.status}: ${await uploadRes.text()}`);
  const result = (await uploadRes.json()) as { file: { name: string; uri: string } };
  return result.file;
}

async function waitForGeminiFile(name: string): Promise<void> {
  for (let i = 0; ; i++) {
    const res = await fetch(`${BASE}/v1beta/${name}?key=${GEMINI_API_KEY}`);
    const file = (await res.json()) as { state: string };
    if (file.state === 'ACTIVE') return;
    if (file.state === 'FAILED') throw new Error('Gemini file processing failed');
    if (i % 6 === 5) console.log(`  [Gemini] File still processing... (${(i + 1) * 5}s)`);
    await new Promise(r => setTimeout(r, 5000));
  }
}

async function deleteGeminiFile(name: string): Promise<void> {
  await fetch(`${BASE}/v1beta/${name}?key=${GEMINI_API_KEY}`, { method: 'DELETE' }).catch(() => {});
}

// ---- Audio utilities ----

/** Returns 0 if ffprobe is unavailable. */
async function getAudioDurationSeconds(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    return parseFloat(stdout.trim()) || 0;
  } catch {
    console.warn('  [Gemini] ffprobe unavailable — cannot determine audio duration, assuming single call');
    return 0;
  }
}

/** Extract a time slice of audio using ffmpeg. Returns path to chunk file. */
async function extractAudioChunk(
  filePath: string,
  startSeconds: number,
  durationSeconds: number,
): Promise<string> {
  const chunkPath = path.join(os.tmpdir(), `gemini-chunk-${Date.now()}-${startSeconds}.mp4`);
  await execFileAsync('ffmpeg', [
    '-i', filePath,
    '-ss', String(startSeconds),
    '-t', String(durationSeconds),
    '-c', 'copy',
    '-y',
    chunkPath,
  ]);
  return chunkPath;
}

// ---- Core Gemini API call ----

interface GeminiCallResult {
  segments: GeminiSegment[];
  usageMetadata: GeminiUsageMetadata;
  truncated: boolean;
}

async function callGeminiOnFile(
  filePath: string,
  options: GeminiTranscriptionOptions,
  chunkDurationSec?: number,
): Promise<GeminiCallResult> {
  const langMap: Record<string, string> = {
    en: 'English', fr: 'French', es: 'Spanish',
    ar: 'Arabic', zh: 'Chinese', ru: 'Russian',
  };
  const langName = langMap[options.language ?? 'en'] ?? 'English';

  console.log('  [Gemini] Uploading audio...');
  const file = await uploadFileToGemini(filePath);
  console.log(`  [Gemini] Uploaded: ${file.name}`);
  await waitForGeminiFile(file.name);

  const thinking = options.withThinking ?? false;
  console.log(`  [Gemini] Calling ${GEMINI_MODEL}${thinking ? ' (thinking ON)' : ' (thinking OFF)'}...`);

  // Note: we intentionally do NOT use responseMimeType:'application/json' + responseSchema here.
  // Gemini's constrained JSON decoding corrupts non-ASCII characters (e.g. é → \u0003) due to
  // a tokenizer bug. Free-text output preserves proper Unicode; we extract the JSON block manually.
  const generationConfig: Record<string, unknown> = {
    temperature: 0,
    maxOutputTokens: 65536,
  };
  if (!thinking) {
    generationConfig['thinkingConfig'] = { thinkingBudget: 0 };
  }

  const requestBody = {
    contents: [{
      parts: [
        { fileData: { mimeType: 'audio/mp4', fileUri: file.uri } },
        { text: buildPrompt(langName, chunkDurationSec) },
      ],
    }],
    generationConfig,
  };

  const apiUrl = `${BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const result = await httpsPostJson(apiUrl, requestBody);
  await deleteGeminiFile(file.name);

  if (result.status !== 200) {
    throw new Error(`Gemini API error ${result.status}: ${result.body.slice(0, 500)}`);
  }

  const raw = JSON.parse(result.body) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
      totalTokenCount?: number;
    };
  };

  const finishReason = raw.candidates?.[0]?.finishReason;
  const truncated = finishReason !== 'STOP';
  if (truncated) {
    console.warn(`  [Gemini] Response truncated (finishReason: ${finishReason})`);
  }

  const responseText = (raw.candidates?.[0]?.content?.parts ?? [])
    .map(p => p.text ?? '')
    .join('')
    .trim();
  if (!responseText) {
    throw new Error(`Gemini returned empty response (finishReason: ${finishReason})`);
  }

  let parsed: GeminiTranscriptOutput;
  try {
    parsed = JSON.parse(extractJsonObject(responseText)) as GeminiTranscriptOutput;
  } catch (e) {
    throw new Error(`Failed to parse Gemini JSON: ${e instanceof Error ? e.message : e}`);
  }

  const usageMetadata: GeminiUsageMetadata = {
    promptTokenCount: raw.usageMetadata?.promptTokenCount ?? 0,
    candidatesTokenCount: raw.usageMetadata?.candidatesTokenCount ?? 0,
    thoughtsTokenCount: raw.usageMetadata?.thoughtsTokenCount ?? 0,
    totalTokenCount: raw.usageMetadata?.totalTokenCount ?? 0,
  };

  const segCount = parsed.segments?.length ?? 0;
  const { candidatesTokenCount, thoughtsTokenCount, promptTokenCount } = usageMetadata;
  console.log(
    `  [Gemini] ${segCount} segments | tokens: ${promptTokenCount} in, ${candidatesTokenCount} out` +
    (thoughtsTokenCount ? `, ${thoughtsTokenCount} thinking` : ''),
  );

  return { segments: parsed.segments ?? [], usageMetadata, truncated };
}

// ---- Speaker normalization via Azure OpenAI ----

const OPENAI_API_VERSION = '2025-01-01-preview';

function createOpenAIClient() {
  return new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: OPENAI_API_VERSION,
  });
}

const SpeakerNormalizationSchema = z.object({
  /** Each entry maps an input speaker key to its canonical speaker key. */
  mapping: z.array(z.object({
    from: z.string(),
    to: z.string(),
  })),
  /** The canonical speakers. */
  canonical: z.array(z.object({
    key: z.string(),
    name: z.string().nullable(),
    function: z.string().nullable(),
    affiliation: z.string().nullable(),
    group: z.string().nullable(),
  })),
});

async function normalizeSpeakers(
  speakerMapping: SpeakerMapping,
  transcriptId?: string,
): Promise<SpeakerMapping> {
  // Collect unique speakers
  const uniqueSpeakers = new Map<string, { indices: string[]; info: SpeakerInfo }>();
  for (const [idx, info] of Object.entries(speakerMapping)) {
    const key = JSON.stringify(info);
    const existing = uniqueSpeakers.get(key);
    if (existing) {
      existing.indices.push(idx);
    } else {
      uniqueSpeakers.set(key, { indices: [idx], info });
    }
  }

  // Nothing to deduplicate with 0–1 unique speakers
  if (uniqueSpeakers.size <= 1) return speakerMapping;

  const speakerList = Array.from(uniqueSpeakers.entries()).map(([_key, { indices, info }]) => ({
    key: indices[0], // representative index
    count: indices.length,
    ...info,
  }));

  console.log(`  [Normalize] ${speakerList.length} unique speaker variants, sending to OpenAI...`);

  const client = createOpenAIClient();
  const request = {
    model: 'gpt-5-mini',
    messages: [
      {
        role: 'system' as const,
        content: [
          'You are a data deduplication tool for United Nations meeting speaker records.',
          'You receive a list of speaker entries extracted from different chunks of the same audio recording.',
          'Some entries may refer to the same person with slight variations (accents, spelling, title differences).',
          '',
          'Your task:',
          '1. Identify which entries refer to the same person.',
          '2. For each cluster, pick or synthesize the most complete/correct canonical version.',
          '3. Return a mapping from each input key to its canonical key, plus the canonical speaker records.',
          '',
          'Rules:',
          '- Preserve correct Unicode accents (é, ñ, etc.)',
          '- Use ISO 3166-1 alpha-3 for country affiliations',
          '- Only merge entries that clearly refer to the same person',
          '- When in doubt, keep them separate',
        ].join('\n'),
      },
      {
        role: 'user' as const,
        content: JSON.stringify(speakerList, null, 2),
      },
    ],
    response_format: zodResponseFormat(SpeakerNormalizationSchema, 'speaker_normalization'),
    reasoning_effort: 'minimal' as const,
  };

  const completion = await trackOpenAIChatCompletion({
    client,
    transcriptId,
    stage: UsageStages.identifyingSpeakers,
    operation: UsageOperations.openaiNormalizeSpeakers,
    model: 'gpt-5-mini',
    request,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    console.warn('  [Normalize] Empty response, skipping normalization');
    return speakerMapping;
  }

  try {
    const parsed = SpeakerNormalizationSchema.parse(JSON.parse(content));

    // Index the arrays for fast lookup
    const mappingLookup = new Map(parsed.mapping.map((m) => [m.from, m.to]));
    const canonicalLookup = new Map(parsed.canonical.map((c) => [c.key, c]));

    // Build normalized mapping: for each original index, look up its canonical speaker
    const normalized: SpeakerMapping = {};
    for (const [idx, info] of Object.entries(speakerMapping)) {
      const key = JSON.stringify(info);
      const entry = Array.from(uniqueSpeakers.entries()).find(([k]) => k === key);
      const representativeIdx = entry?.[1].indices[0] ?? idx;
      const canonicalIdx = mappingLookup.get(representativeIdx) ?? representativeIdx;
      const canonicalSpeaker = canonicalLookup.get(canonicalIdx);
      normalized[idx] = canonicalSpeaker ?? info;
    }

    const originalCount = uniqueSpeakers.size;
    const canonicalCount = parsed.canonical.length;
    if (originalCount !== canonicalCount) {
      console.log(`  [Normalize] Merged ${originalCount} → ${canonicalCount} unique speakers`);
    }

    return normalized;
  } catch (e) {
    console.warn('  [Normalize] Failed to parse response, skipping:', e instanceof Error ? e.message : e);
    return speakerMapping;
  }
}

// ---- Chunk stitching ----

interface ChunkOutput {
  paragraphs: RawParagraph[];
  speakerMapping: SpeakerMapping;
  usageMetadata: GeminiUsageMetadata;
}

/** Stitch ordered chunk outputs into a single result, merging same-speaker boundaries. */
function stitchChunks(chunks: ChunkOutput[]): {
  paragraphs: RawParagraph[];
  speakerMapping: SpeakerMapping;
  combinedUsage: GeminiUsageMetadata;
} {
  const allParagraphs: RawParagraph[] = [];
  const allSpeakerMapping: SpeakerMapping = {};
  const combinedUsage: GeminiUsageMetadata = {
    promptTokenCount: 0, candidatesTokenCount: 0,
    thoughtsTokenCount: 0, totalTokenCount: 0,
  };

  for (const chunk of chunks) {
    combinedUsage.promptTokenCount += chunk.usageMetadata.promptTokenCount;
    combinedUsage.candidatesTokenCount += chunk.usageMetadata.candidatesTokenCount;
    combinedUsage.thoughtsTokenCount += chunk.usageMetadata.thoughtsTokenCount;
    combinedUsage.totalTokenCount += chunk.usageMetadata.totalTokenCount;

    const { paragraphs: chunkParas, speakerMapping: chunkMap } = chunk;

    // Merge boundary: if last paragraph of accumulated result and first of this chunk
    // share the same speaker, concatenate them
    let startIdx = 0;
    if (allParagraphs.length > 0 && chunkParas.length > 0) {
      const lastIdx = (allParagraphs.length - 1).toString();
      const lastSpeaker = allSpeakerMapping[lastIdx];
      const firstSpeaker = chunkMap['0'];
      if (lastSpeaker && firstSpeaker && JSON.stringify(lastSpeaker) === JSON.stringify(firstSpeaker)) {
        const last = allParagraphs[allParagraphs.length - 1];
        const first = chunkParas[0];
        last.text = last.text + ' ' + first.text;
        last.end = first.end;
        last.words = [...last.words, ...first.words];
        startIdx = 1;
      }
    }

    const indexOffset = allParagraphs.length;
    for (const [localIdx, speaker] of Object.entries(chunkMap)) {
      const idx = parseInt(localIdx);
      if (idx < startIdx) continue;
      allSpeakerMapping[(indexOffset + idx - startIdx).toString()] = speaker;
    }
    allParagraphs.push(...chunkParas.slice(startIdx));
  }

  return { paragraphs: allParagraphs, speakerMapping: allSpeakerMapping, combinedUsage };
}

// ---- Main export ----

export async function transcribeAudioWithGemini(
  audioUrl: string,
  options: GeminiTranscriptionOptions = {},
): Promise<GeminiTranscriptionResult> {
  const tmpPath = await downloadAudioToTemp(audioUrl, 'Gemini');
  try {
    const audioSeconds = await getAudioDurationSeconds(tmpPath);
    if (audioSeconds > 0) {
      console.log(`  [Gemini] Duration: ${Math.round(audioSeconds)}s (${(audioSeconds / 3600).toFixed(2)}h)`);
    }

    const needsChunking = audioSeconds > CHUNK_THRESHOLD_SECONDS;

    if (!needsChunking) {
      // --- Single call ---
      const result = await callGeminiOnFile(tmpPath, options);
      if (!result.truncated) {
        const { paragraphs, speakerMapping } = segmentsToOutput(result.segments);
        return { paragraphs, speakerMapping, usageMetadata: result.usageMetadata, audioSeconds, chunked: false, chunkCount: 1 };
      }
      // Truncated — fall through to chunked mode
      console.log('  [Gemini] Truncated output, retrying in chunked mode...');
    }

    // --- Chunked mode (parallel) ---
    const totalSeconds = audioSeconds > 0 ? audioSeconds : CHUNK_THRESHOLD_SECONDS + 1;
    const numChunks = Math.ceil(totalSeconds / CHUNK_DURATION_SECONDS);
    console.log(`  [Gemini] Processing ${numChunks} chunk(s) in parallel (${CHUNK_DURATION_SECONDS / 60}min each)...`);

    // 1. Extract all chunks first (sequential ffmpeg, fast)
    const chunkInfos: Array<{ path: string; offsetMs: number; durationSec: number; index: number }> = [];
    for (let i = 0; i < numChunks; i++) {
      const startSeconds = i * CHUNK_DURATION_SECONDS;
      const chunkDurationSec = Math.min(CHUNK_DURATION_SECONDS, totalSeconds - startSeconds);
      console.log(`  [Gemini] Extracting chunk ${i + 1}/${numChunks} (${fmtHHMMSS(startSeconds)}–${fmtHHMMSS(startSeconds + chunkDurationSec)})...`);
      const chunkPath = await extractAudioChunk(tmpPath, startSeconds, CHUNK_DURATION_SECONDS);
      chunkInfos.push({ path: chunkPath, offsetMs: startSeconds * 1000, durationSec: chunkDurationSec, index: i });
    }

    // 2. Transcribe all chunks in parallel
    const chunkResults = await Promise.all(
      chunkInfos.map(async (chunk) => {
        try {
          console.log(`  [Gemini] Starting chunk ${chunk.index + 1}/${numChunks}...`);
          const result = await callGeminiOnFile(chunk.path, options, chunk.durationSec);
          const { paragraphs, speakerMapping } = segmentsToOutput(result.segments, chunk.offsetMs);
          return { paragraphs, speakerMapping, usageMetadata: result.usageMetadata };
        } finally {
          try { fs.unlinkSync(chunk.path); } catch { /* ignore */ }
        }
      }),
    );

    // 3. Stitch in order
    const { paragraphs, speakerMapping, combinedUsage } = stitchChunks(chunkResults);

    // 4. Normalize speakers across chunks via OpenAI
    const normalizedMapping = await normalizeSpeakers(speakerMapping, options.transcriptId);

    return {
      paragraphs,
      speakerMapping: normalizedMapping,
      usageMetadata: combinedUsage,
      audioSeconds,
      chunked: true,
      chunkCount: numChunks,
    };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}
