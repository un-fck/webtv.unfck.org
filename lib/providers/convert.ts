/**
 * Convert NormalizedTranscript → RawParagraph[] for the main pipeline.
 *
 * When providers have real word-level timestamps, those are used directly.
 * When they don't, word timestamps are uniformly interpolated within
 * each utterance span.
 */
import type { NormalizedTranscript } from "./types";
import type { RawParagraph } from "../turso";

/**
 * Convert utterances to RawParagraph[], preserving real word timestamps
 * when available and falling back to interpolation when not.
 */
export function toRawParagraphs(
  transcript: NormalizedTranscript,
): RawParagraph[] {
  return transcript.utterances.map((u) => {
    if (u.words && u.words.length > 0) {
      // Real word-level timestamps from provider
      return {
        text: u.text,
        start: u.start,
        end: u.end,
        words: u.words.map((w) => ({
          text: w.text,
          start: w.start,
          end: w.end,
          confidence: w.confidence,
          speaker: w.speaker ?? u.speaker,
        })),
      };
    }

    // Fall back to uniform interpolation within the utterance
    const wordTexts = u.text.split(/\s+/).filter(Boolean);
    const durationMs = Math.max(0, u.end - u.start);
    const msPerWord =
      wordTexts.length > 1 ? durationMs / wordTexts.length : durationMs;

    return {
      text: u.text,
      start: u.start,
      end: u.end,
      words: wordTexts.map((text, i) => ({
        text,
        start: Math.round(u.start + i * msPerWord),
        end: Math.round(u.start + (i + 1) * msPerWord),
        confidence: 0.6, // interpolated estimate
        speaker: u.speaker,
      })),
    };
  });
}
