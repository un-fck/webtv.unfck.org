/**
 * Gemini provider — single implementation for production and eval.
 *
 * Wraps lib/gemini-transcription.ts, which transcribes verbatim with NUMERIC
 * speaker IDs + real per-segment timestamps and chunks long audio. Gemini does
 * NOT name speakers — speaker identification is handled downstream by the OpenAI
 * pipeline (lib/pipeline/index.ts), the same as every other provider.
 *
 * Parameterized by model so the same code serves gemini-3-flash (production +
 * multilingual floor) and gemini-3.5-flash.
 */
import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import {
  transcribeAudioWithGemini,
  type GeminiTranscriptionResult,
} from "../gemini-transcription";

function makeGeminiProvider(
  name: string,
  label: string,
  model: string,
): TranscriptionProvider {
  return {
    name,
    label,
    model,
    capabilities: {
      speakerIdentification: false,
      paragraphSegmentation: false,
      wordTimestamps: false, // real per-segment timing, no per-word timestamps
    },

    async transcribe(audioUrl, opts): Promise<NormalizedTranscript> {
      const result: GeminiTranscriptionResult = await transcribeAudioWithGemini(
        audioUrl,
        { language: opts?.language, model },
      );

      const usageMeta = result.usageMetadata;
      return {
        provider: name,
        language: opts?.language ?? "en",
        fullText: result.paragraphs.map((p) => p.text).join(" "),
        utterances: result.paragraphs.map((para) => ({
          speaker: para.speaker ?? para.words?.[0]?.speaker ?? "0",
          start: para.start,
          end: para.end,
          text: para.text,
          words: para.words,
        })),
        durationMs: result.audioSeconds * 1000,
        usage: {
          inputTokens: usageMeta.promptTokenCount,
          outputTokens: usageMeta.candidatesTokenCount,
          reasoningTokens: usageMeta.thoughtsTokenCount || undefined,
          audioSeconds: result.audioSeconds || undefined,
        },
        raw: result,
      };
    },
  };
}

// Production + multilingual-floor default.
export const gemini3Flash = makeGeminiProvider(
  "gemini-3-flash",
  "Google Gemini 3 Flash",
  "gemini-3-flash-preview",
);

export const gemini35Flash = makeGeminiProvider(
  "gemini-3.5-flash",
  "Google Gemini 3.5 Flash",
  "gemini-3.5-flash",
);
