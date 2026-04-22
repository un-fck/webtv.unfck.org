/**
 * Production Gemini provider — wraps lib/gemini-transcription.ts.
 *
 * Gemini transcribes verbatim with numeric diarization labels (speaker_id).
 * Speaker identification is handled downstream by the standard OpenAI pipeline.
 */
import type {
  TranscriptionProvider,
  NormalizedTranscript,
} from "./types";
import {
  transcribeAudioWithGemini,
  type GeminiTranscriptionResult,
} from "../gemini-transcription";

export const geminiProduction: TranscriptionProvider = {
  name: "gemini",
  capabilities: {
    speakerIdentification: false,
    paragraphSegmentation: false,
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

    return {
      provider: "gemini",
      language: opts?.language ?? "en",
      fullText: result.paragraphs.map((p) => p.text).join(" "),
      utterances: result.paragraphs.map((para) => ({
        speaker: para.words[0]?.speaker ?? "0",
        start: para.start,
        end: para.end,
        text: para.text,
        words: para.words,
      })),
      durationMs: result.audioSeconds * 1000,
      raw: result,
    };
  },
};
