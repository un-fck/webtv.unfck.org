/**
 * Convert NormalizedTranscript → RawParagraph[] for the main pipeline.
 *
 * Providers with real word-level timestamps carry them through verbatim.
 * Providers without real word timing produce one paragraph per utterance with
 * no `words` — the utterance/segment is the smallest honest timed unit and is
 * never split into fabricated per-word timestamps. The ASR speaker label is
 * carried on the paragraph itself (`speaker`) so the pipeline doesn't need a
 * `words[0].speaker` to recover it.
 */
import type { NormalizedTranscript } from "./types";
import type { RawParagraph } from "../db";

export function toRawParagraphs(
  transcript: NormalizedTranscript,
): RawParagraph[] {
  return transcript.utterances.map((u) => ({
    text: u.text,
    start: u.start,
    end: u.end,
    speaker: u.speaker,
    words:
      u.words && u.words.length > 0
        ? u.words.map((w) => ({
            text: w.text,
            start: w.start,
            end: w.end,
            speaker: w.speaker ?? u.speaker,
          }))
        : undefined,
  }));
}
