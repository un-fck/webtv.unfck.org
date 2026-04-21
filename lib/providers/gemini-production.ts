/**
 * Production Gemini provider — wraps lib/gemini-transcription.ts.
 *
 * Unlike the eval Gemini provider (which returns a simplified NormalizedTranscript),
 * this provider preserves the rich output: named speakers with roles/affiliations,
 * structured paragraphs, and sentence-level interpolated word timestamps.
 *
 * The NormalizedTranscript returned satisfies the common interface, but callers
 * can use getRichResult() to access the full RawParagraph[] + SpeakerMapping.
 */
import type {
  TranscriptionProvider,
  NormalizedTranscript,
  TranscriptUtterance,
} from "./types";
import {
  transcribeAudioWithGemini,
  type GeminiTranscriptionResult,
} from "../gemini-transcription";
import type { RawParagraph } from "../turso";
import type { SpeakerMapping } from "../speakers";

let lastRichResult: {
  paragraphs: RawParagraph[];
  speakerMapping: SpeakerMapping;
} | null = null;

/**
 * Get the full RawParagraph[] + SpeakerMapping from the most recent transcription.
 * Must be called immediately after transcribe() — not safe across concurrent calls.
 */
export function getRichResult(): {
  paragraphs: RawParagraph[];
  speakerMapping: SpeakerMapping;
} | null {
  return lastRichResult;
}

export const geminiProduction: TranscriptionProvider = {
  name: "gemini",
  capabilities: {
    speakerIdentification: true,
    paragraphSegmentation: true,
    wordTimestamps: false, // sentence-level interpolation, not real word timestamps
  },

  async transcribe(
    audioUrl: string,
    opts?: { audioFilePath?: string; language?: string },
  ): Promise<NormalizedTranscript> {
    const result: GeminiTranscriptionResult =
      await transcribeAudioWithGemini(audioUrl, {
        language: opts?.language,
      });

    // Store rich result for callers that need it
    lastRichResult = {
      paragraphs: result.paragraphs,
      speakerMapping: result.speakerMapping,
    };

    // Convert to NormalizedTranscript for the common interface
    const utterances: TranscriptUtterance[] = result.paragraphs.map(
      (para, i) => {
        const speaker = result.speakerMapping[i.toString()];
        const speakerLabel = speaker?.name ?? speaker?.affiliation ?? `Speaker ${i}`;
        return {
          speaker: speakerLabel,
          start: para.start,
          end: para.end,
          text: para.text,
          words: para.words.map((w) => ({
            text: w.text,
            start: w.start,
            end: w.end,
            confidence: w.confidence,
            speaker: speakerLabel,
          })),
        };
      },
    );

    return {
      provider: "gemini",
      language: opts?.language ?? "en",
      fullText: utterances.map((u) => u.text).join(" "),
      utterances,
      durationMs: result.audioSeconds * 1000,
      raw: result,
    };
  },
};
