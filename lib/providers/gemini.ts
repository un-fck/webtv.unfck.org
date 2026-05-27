import fs from "fs";
import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { downloadAudioToTemp, parallelMap } from "./utils";
import {
  GEMINI_API_KEY,
  GEMINI_MODEL,
  GEMINI_BASE as BASE,
  CHUNK_DURATION_SECONDS,
  httpsPostJson,
  uploadFileToGemini,
  waitForGeminiFile,
  deleteGeminiFile,
  getAudioDurationSeconds,
  extractAudioChunk,
  parseHHMMSSToMs,
} from "../gemini-utils";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  ar: "Arabic",
  zh: "Chinese",
  ru: "Russian",
};

const CHUNK_CONCURRENCY = 3;

interface GeminiSegment {
  speaker: string;
  timestamp: string;
  content: string;
}

function buildRequestBody(fileUri: string, langName: string) {
  return {
    contents: [
      {
        parts: [
          { fileData: { mimeType: "audio/mp4", fileUri } },
          {
            text: [
              `Transcribe this audio recording verbatim in ${langName}.`,
              "",
              "Requirements:",
              "1. Identify distinct speakers (Speaker 1, Speaker 2, etc.).",
              "2. Provide timestamps for each segment (Format: MM:SS).",
              "3. Transcribe every word exactly as spoken — do not correct grammar, summarize, or paraphrase.",
              "4. Include filler words, false starts, and repetitions.",
              "5. This is a United Nations session — preserve all speaker statements faithfully.",
            ].join("\n"),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 65536,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          segments: {
            type: "ARRAY",
            description:
              "List of transcribed segments with speaker and timestamp.",
            items: {
              type: "OBJECT",
              properties: {
                speaker: { type: "STRING", description: "Speaker identifier" },
                timestamp: { type: "STRING", description: "MM:SS" },
                content: {
                  type: "STRING",
                  description: "Verbatim transcription of this segment",
                },
              },
              required: ["speaker", "timestamp", "content"],
            },
          },
        },
        required: ["segments"],
      },
    },
  };
}

/** Upload one (chunk) file, transcribe it, return its segments (timestamps relative to the file). */
async function transcribeOneFile(
  model: string,
  name: string,
  filePath: string,
  langName: string,
): Promise<GeminiSegment[]> {
  const file = await uploadFileToGemini(filePath, "eval");
  await waitForGeminiFile(file.name, true);
  try {
    const apiUrl = `${BASE}/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const result = await httpsPostJson(apiUrl, buildRequestBody(file.uri, langName));
    if (result.status !== 200)
      throw new Error(`Gemini API error ${result.status}: ${result.body.slice(0, 500)}`);
    const raw = JSON.parse(result.body) as any;
    const responseText = (raw.candidates?.[0]?.content?.parts || [])
      .map((p: any) => p.text || "")
      .join("")
      .trim();
    if (!responseText)
      throw new Error(
        `Gemini returned empty transcription: ${JSON.stringify(raw.candidates?.[0]?.finishReason)}`,
      );
    const parsed = JSON.parse(responseText) as { segments: GeminiSegment[] };
    return parsed.segments || [];
  } finally {
    await deleteGeminiFile(file.name);
  }
}

/**
 * Eval Gemini provider, parameterized by model so we can benchmark multiple
 * Gemini versions (gemini-3-flash-preview vs gemini-3.5-flash) through the same
 * structured-diarization prompt. Long audio is split into <=10-min chunks and
 * transcribed in parallel — a single call over a 171-min file times out and
 * blows past maxOutputTokens (truncated JSON). Distinct from the production
 * provider in gemini-production.ts.
 */
function makeGemini(model: string, name: string): TranscriptionProvider {
  return {
    name,
    capabilities: {
      speakerIdentification: false,
      paragraphSegmentation: false,
      wordTimestamps: false,
    },

    async transcribe(audioUrl, opts) {
      const lang = opts?.language || "en";
      const langName = LANGUAGE_NAMES[lang] || lang;

      const ownedPath = !opts?.audioFilePath;
      const filePath =
        opts?.audioFilePath || (await downloadAudioToTemp(audioUrl, name));

      try {
        const duration = await getAudioDurationSeconds(filePath);

        // Build (start, segments) per chunk; timestamps are offset to absolute.
        let offsetSegments: { offsetMs: number; segments: GeminiSegment[] }[];

        if (duration > CHUNK_DURATION_SECONDS) {
          const starts: number[] = [];
          for (let s = 0; s < duration; s += CHUNK_DURATION_SECONDS) starts.push(s);
          console.log(
            `  [${name}] ${(duration / 60).toFixed(0)}min audio → ${starts.length} chunks, ${CHUNK_CONCURRENCY} at a time (${model})...`,
          );
          offsetSegments = await parallelMap(starts, CHUNK_CONCURRENCY, async (start, i) => {
            const chunkPath = await extractAudioChunk(
              filePath,
              start,
              CHUNK_DURATION_SECONDS,
              `gemini-eval-${i}`,
            );
            try {
              const segments = await transcribeOneFile(model, name, chunkPath, langName);
              console.log(`  [${name}] Chunk ${i + 1}/${starts.length} (offset ${(start / 60).toFixed(0)}min): ${segments.length} segments`);
              return { offsetMs: start * 1000, segments };
            } finally {
              try { fs.unlinkSync(chunkPath); } catch {}
            }
          });
        } else {
          console.log(`  [${name}] Transcribing with ${model}...`);
          const segments = await transcribeOneFile(model, name, filePath, langName);
          offsetSegments = [{ offsetMs: 0, segments }];
        }

        // Stitch: offset each chunk's MM:SS timestamps, merge consecutive same-speaker.
        const utterances: NormalizedTranscript["utterances"] = [];
        const textParts: string[] = [];
        for (const { offsetMs, segments } of offsetSegments) {
          for (const seg of segments) {
            const startMs = parseHHMMSSToMs(seg.timestamp) + offsetMs;
            textParts.push(seg.content);
            const last = utterances[utterances.length - 1];
            const speaker = seg.speaker.replace(/^Speaker\s*/i, "");
            if (last && last.speaker === speaker) {
              last.end = startMs;
              last.text += " " + seg.content;
            } else {
              utterances.push({ speaker, start: startMs, end: startMs, text: seg.content });
            }
          }
        }
        for (let i = 0; i < utterances.length - 1; i++) {
          if (utterances[i].end <= utterances[i].start) {
            utterances[i].end = utterances[i + 1].start;
          }
        }

        const fullText = textParts.join(" ").trim();
        const durationMs =
          utterances.length > 0 ? utterances[utterances.length - 1].end : 0;

        console.log(
          `  [${name}] Transcription: ${fullText.length} chars, ${utterances.length} utterances`,
        );

        return {
          provider: name,
          language: lang,
          fullText,
          utterances,
          durationMs,
          raw: { offsetSegments },
        } satisfies NormalizedTranscript;
      } finally {
        if (ownedPath) {
          try {
            fs.unlinkSync(filePath);
          } catch {}
        }
      }
    },
  };
}

export const gemini = makeGemini(GEMINI_MODEL, "gemini");
export const gemini35Flash = makeGemini("gemini-3.5-flash", "gemini-3.5-flash");
