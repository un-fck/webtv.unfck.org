/**
 * Walk a sentence's text and its word list together to produce the spans for
 * rendering. Each provider word becomes a clickable/karaoke-tracked part
 * (carrying its `wordIdx` in the original words array, so the playback hook
 * can underline it); everything between or around words — spaces, attached
 * punctuation, ideographic stops — becomes a plain part.
 *
 * Sourcing the rendered text from `text` (not from joining words[].text)
 * means nothing visible is ever dropped: a broken or partially-matched
 * words[] just yields fewer interactive spans, which is the right visible
 * signal when a provider misbehaves.
 *
 * Matching is normalized so word tokens align with the sentence text even
 * when providers differ in casing or attach punctuation (AssemblyAI lower-
 * cases sentence-internal words; fun-asr emits per-character tokens that
 * sit flush against ideographic punctuation; etc.).
 */
export interface WeaveWord {
  text: string;
  start: number;
  end: number;
}

export type SentencePart<W extends WeaveWord> = {
  text: string;
  word?: W;
  wordIdx?: number;
};

const STRIP_RE = /[^\p{L}\p{N}]/gu;

function normalize(s: string): string {
  return s.replace(STRIP_RE, "").toLowerCase();
}

/**
 * Find the next occurrence of `needle` in `haystack` starting at `from`, by
 * comparing normalized forms (case-insensitive, ignoring non-letter/non-digit
 * chars). Returns `[matchStart, matchEnd)` indices into the original haystack,
 * or `null` if not found.
 */
function findNormalized(
  haystack: string,
  needle: string,
  from: number,
): [number, number] | null {
  const targetNorm = normalize(needle);
  if (!targetNorm) return null;

  // Walk every starting position from `from`; at each one, advance through
  // haystack chars accumulating normalized text until it equals targetNorm
  // (success) or diverges (fail, try next start).
  for (let start = from; start < haystack.length; start++) {
    let acc = "";
    let end = start;
    while (end < haystack.length && acc.length < targetNorm.length) {
      const ch = haystack[end];
      const chNorm = normalize(ch);
      if (chNorm) {
        if (targetNorm[acc.length] !== chNorm) {
          acc = "";
          break;
        }
        acc += chNorm;
      }
      end++;
    }
    if (acc === targetNorm) {
      // Trim leading + trailing non-letter/non-digit chars from the matched
      // run so attached punctuation lands in the inter-word slot rather than
      // on the word span itself.
      let s = start;
      while (s < end && normalize(haystack[s]) === "") s++;
      while (end > s && normalize(haystack[end - 1]) === "") end--;
      return [s, end];
    }
  }
  return null;
}

export function weaveSentenceParts<W extends WeaveWord>(
  text: string,
  words?: W[],
): SentencePart<W>[] {
  if (!words || words.length === 0) return [{ text }];
  const parts: SentencePart<W>[] = [];
  let cursor = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w.text) continue;
    const hit = findNormalized(text, w.text, cursor);
    if (!hit) continue;
    const [start, end] = hit;
    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    parts.push({ text: text.slice(start, end), word: w, wordIdx: i });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
