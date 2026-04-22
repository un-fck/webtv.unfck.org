/**
 * Gemini-based transcription for UN proceedings.
 *
 * Transcribes audio verbatim with diarization (numeric speaker IDs) and
 * sentence-level timestamps. Word timestamps are interpolated uniformly
 * across each segment's [start, end].
 *
 * Speaker identification is handled downstream by the OpenAI pipeline,
 * the same as all other providers.
 *
 * Timestamp accuracy: Gemini hallucinates timestamps on audio-only files for clips
 * longer than ~10 minutes — a well-documented issue across all model versions. The
 * only reliable mitigation is chunking: 10-minute clips consistently produce correct
 * timestamps (0% out-of-range) while 20+ minute clips degrade rapidly. Each chunk
 * is told its exact duration in the prompt. Results are stitched with known offsets.
 */
import fs from 'fs';
import {
  GEMINI_API_KEY, GEMINI_MODEL, GEMINI_BASE,
  CHUNK_THRESHOLD_SECONDS, CHUNK_DURATION_SECONDS,
  httpsPostJson, uploadFileToGemini, waitForGeminiFile, deleteGeminiFile,
  fmtHHMMSS, parseHHMMSSToMs as parseHHMMSS, extractJsonObject,
  downloadAudioToTemp, getAudioDurationSeconds, extractAudioChunk,
} from './gemini-utils';
import type { RawParagraph } from './turso';
import { getLanguageFullName } from './languages';

export { GEMINI_MODEL };

// ---- Schema types ----

interface GeminiSegment {
  speaker_id: number;  // 0-based, increments on speaker change
  start_time: string;  // HH:MM:SS
  end_time: string;    // HH:MM:SS
  text: string;        // Full verbatim text of this turn
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
  usageMetadata: GeminiUsageMetadata;
  audioSeconds: number;
  chunked: boolean;
  chunkCount: number;
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

/** Convert Gemini segments to RawParagraph[], tagging each word with its numeric speaker_id. */
function segmentsToOutput(
  segments: GeminiSegment[],
  chunkOffsetMs = 0,
): RawParagraph[] {
  const paragraphs: RawParagraph[] = [];

  for (const seg of segments) {
    const segStart = parseHHMMSS(seg.start_time) + chunkOffsetMs;
    const segEnd = parseHHMMSS(seg.end_time) + chunkOffsetMs;

    const wordTexts = seg.text.split(/\s+/).filter(Boolean);
    const words = interpolateWords(wordTexts, segStart, segEnd);

    if (words.length === 0) continue;

    const speakerLabel = (seg.speaker_id ?? 0).toString();
    paragraphs.push({
      text: seg.text,
      start: segStart,
      end: segEnd,
      words: words.map(w => ({ ...w, speaker: speakerLabel })),
    });
  }

  return paragraphs;
}

function buildPrompt(langName: string, chunkDurationSec?: number, langCode?: string): string {
  const durationLine = chunkDurationSec != null
    ? `This audio segment is ${fmtHHMMSS(chunkDurationSec)} long. All timestamps must be between 00:00:00 and ${fmtHHMMSS(chunkDurationSec)}.`
    : null;

  // Language-specific instructions to prevent translation
  let langInstruction: string | null = null;
  if (langCode === 'floor') {
    langInstruction = 'CRITICAL: This is the floor/original audio channel. Speakers may use any language. Transcribe exactly what you hear in whatever language is being spoken. Do NOT translate to any other language.';
  } else if (langCode && langCode !== 'en') {
    langInstruction = `CRITICAL: This audio is the ${langName} interpretation channel. Transcribe exactly what you hear in ${langName}. Do NOT translate to English or any other language. All transcribed text must be in ${langName}. Speaker names, titles, and country names should use their standard international forms.`;
  }

  return [
    `Transcribe and analyze this United Nations meeting audio recording in ${langName}.`,
    ...(langInstruction ? [langInstruction] : []),
    ...(durationLine ? [durationLine, ''] : ['']),
    'OUTPUT FORMAT:',
    'Respond with a single JSON object (no markdown, no explanation) with this structure:',
    '{',
    '  "segments": [',
    '    {',
    '      "speaker_id": 0,            // 0-based integer, increment each time a new speaker begins',
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
    '3. Each segment should contain a single sentence or short clause, with its own start_time and end_time.',
    '   A speaker turn may span multiple consecutive segments — keep the same speaker_id across them.',
    '   This is critical for accurate word-level timestamp synchronization.',
    '4. Use HH:MM:SS format for all timestamps (e.g. "01:23:45").',
    '5. ONLY transcribe actual speech. Do NOT create segments for silence, background noise, music,',
    '   applause, or other non-speech audio. Simply skip these parts and start the next segment',
    '   when speech resumes. Never output placeholder text like "[Background noise]" or "[Silence]".',
    '',
    'SPEAKER TRACKING:',
    '- Assign a numeric speaker_id to each segment (0, 1, 2...).',
    '- Start at 0. Increment the ID each time a different speaker begins.',
    '- Keep the same speaker_id for all segments of the same speaker turn.',
    '- Do NOT try to identify who the speaker is — only track when the speaker changes.',
  ].join('\n');
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
  const langCode = options.language ?? 'en';
  const langName = getLanguageFullName(langCode);

  console.log('  [Gemini] Uploading audio...');
  const file = await uploadFileToGemini(filePath, 'un-transcript');
  console.log(`  [Gemini] Uploaded: ${file.name}`);
  await waitForGeminiFile(file.name, true);

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
        { text: buildPrompt(langName, chunkDurationSec, langCode) },
      ],
    }],
    generationConfig,
  };

  const apiUrl = `${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
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


// ---- Chunk stitching ----

interface ChunkOutput {
  paragraphs: RawParagraph[];
  usageMetadata: GeminiUsageMetadata;
}

/** Stitch ordered chunk outputs into a single result. */
function stitchChunks(chunks: ChunkOutput[]): {
  paragraphs: RawParagraph[];
  combinedUsage: GeminiUsageMetadata;
} {
  const allParagraphs: RawParagraph[] = [];
  const combinedUsage: GeminiUsageMetadata = {
    promptTokenCount: 0, candidatesTokenCount: 0,
    thoughtsTokenCount: 0, totalTokenCount: 0,
  };

  for (const chunk of chunks) {
    combinedUsage.promptTokenCount += chunk.usageMetadata.promptTokenCount;
    combinedUsage.candidatesTokenCount += chunk.usageMetadata.candidatesTokenCount;
    combinedUsage.thoughtsTokenCount += chunk.usageMetadata.thoughtsTokenCount;
    combinedUsage.totalTokenCount += chunk.usageMetadata.totalTokenCount;
    allParagraphs.push(...chunk.paragraphs);
  }

  return { paragraphs: allParagraphs, combinedUsage };
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
        const paragraphs = segmentsToOutput(result.segments);
        return { paragraphs, usageMetadata: result.usageMetadata, audioSeconds, chunked: false, chunkCount: 1 };
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

    // 2. Transcribe all chunks in parallel (with retry on transient failures)
    const chunkResults = await Promise.all(
      chunkInfos.map(async (chunk) => {
        const maxRetries = 2;
        try {
          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
              console.log(`  [Gemini] Starting chunk ${chunk.index + 1}/${numChunks}${attempt > 0 ? ` (retry ${attempt})` : ''}...`);
              const result = await callGeminiOnFile(chunk.path, options, chunk.durationSec);
              const paragraphs = segmentsToOutput(result.segments, chunk.offsetMs);
              return { paragraphs, usageMetadata: result.usageMetadata };
            } catch (error) {
              if (attempt < maxRetries) {
                console.warn(`  [Gemini] Chunk ${chunk.index + 1}/${numChunks} failed (attempt ${attempt + 1}), retrying: ${error instanceof Error ? error.message : error}`);
                continue;
              }
              throw error;
            }
          }
          throw new Error('Unreachable');
        } finally {
          try { fs.unlinkSync(chunk.path); } catch { /* ignore */ }
        }
      }),
    );

    // 3. Stitch in order
    const { paragraphs, combinedUsage } = stitchChunks(chunkResults);

    return {
      paragraphs,
      usageMetadata: combinedUsage,
      audioSeconds,
      chunked: true,
      chunkCount: numChunks,
    };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}
