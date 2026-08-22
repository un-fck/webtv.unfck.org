/**
 * Caption-specific quality, which none of the translation metrics capture.
 *
 * A stream of correct words is not captioning. Broadcast and accessibility
 * practice judges live subtitles on whether a human can actually READ them:
 * how much text appears at once, how long it stays up, and above all the
 * resulting reading rate. Regulators and style guides converge on roughly
 * 15–21 characters per second as the comfortable ceiling for adults; beyond
 * that a viewer is still reading line one when line two replaces it.
 *
 * This matters for the comparison being made here, because the architectures
 * differ in kind rather than degree:
 *
 *   - A **caption pipeline** (ASR → MT) emits genuine caption units: the ASR
 *     decides where an utterance ends, and each unit is translated whole. Its
 *     segmentation can be measured.
 *   - A **token-streaming translator** emits word fragments with no unit
 *     boundaries at all. It is not a captioning system; anyone shipping it as
 *     one has to add segmentation, line-breaking and timing themselves. That
 *     is a real integration cost, and reporting only WER hides it completely.
 *
 * So `segmented: false` is not a failure to measure — it is the finding.
 */
import type { StreamingEvent } from "./streaming-types";

/** Comfortable adult reading ceiling, characters per second. */
export const READING_RATE_LIMIT = 21;
/** Below this many characters, an "event" is a token fragment, not a caption. */
const MIN_CAPTION_CHARS = 12;

export interface CaptionQuality {
  /** False when the system emits token fragments rather than caption units. */
  segmented: boolean;
  count: number;
  meanChars: number;
  captionsPerMinute: number;
  /** Median characters per second of on-screen time. */
  medianReadingRate: number;
  /** Share of captions that exceed the comfortable reading ceiling. */
  shareOverLimit: number;
}

function median(v: number[]): number {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function captionQuality(
  events: StreamingEvent[],
  audioDurationMs: number,
): CaptionQuality {
  const units = events.filter((e) => e.isFinal && e.text.trim());
  if (!units.length)
    return {
      segmented: false,
      count: 0,
      meanChars: 0,
      captionsPerMinute: 0,
      medianReadingRate: NaN,
      shareOverLimit: NaN,
    };

  const lengths = units.map((u) => u.text.trim().length);
  const meanChars = lengths.reduce((a, b) => a + b, 0) / lengths.length;

  // A system whose average "unit" is a few characters is streaming tokens, not
  // captions. Reading rate is meaningless for it, so say so rather than emit a
  // number that invites a false comparison.
  if (meanChars < MIN_CAPTION_CHARS)
    return {
      segmented: false,
      count: units.length,
      meanChars,
      captionsPerMinute: units.length / (audioDurationMs / 60000),
      medianReadingRate: NaN,
      shareOverLimit: NaN,
    };

  // On-screen time is the gap until the next caption replaces this one; the
  // last one is credited the mean of the others.
  const rates: number[] = [];
  for (let i = 0; i < units.length - 1; i++) {
    const displayMs = units[i + 1].emitMs - units[i].emitMs;
    if (displayMs <= 0) continue;
    rates.push(units[i].text.trim().length / (displayMs / 1000));
  }

  return {
    segmented: true,
    count: units.length,
    meanChars,
    captionsPerMinute: units.length / (audioDurationMs / 60000),
    medianReadingRate: median(rates),
    shareOverLimit:
      rates.length === 0
        ? NaN
        : rates.filter((r) => r > READING_RATE_LIMIT).length / rates.length,
  };
}
