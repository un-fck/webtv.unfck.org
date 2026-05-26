/**
 * Apply a realignment offset (see lib/realignment.ts + migration 008/009) to a
 * transcript's timestamps at the serving boundary, so every downstream consumer
 * — rendering, word highlighting, seek, playback tracking — works on already
 * aligned times and needs no offset awareness of its own.
 *
 * Pure + non-mutating: returns a shifted shallow-ish copy, leaving the stored
 * content untouched (the offset stays reversible). Shifting is clamped at 0 so a
 * negative offset can't produce negative timestamps.
 */
import type { TranscriptContent, RawParagraph } from "./db";

type Stmt = TranscriptContent["statements"][number];
type TimedWord = { text: string; start: number; end: number; speaker?: string };

function shiftWords<T extends TimedWord>(
  words: T[] | undefined,
  off: number,
): T[] | undefined {
  return words?.map((w) => ({
    ...w,
    start: Math.max(0, w.start + off),
    end: Math.max(0, w.end + off),
  }));
}

function shiftStatement(s: Stmt, off: number): Stmt {
  return {
    ...s,
    start: Math.max(0, s.start + off),
    end: Math.max(0, s.end + off),
    words: shiftWords(s.words, off),
    paragraphs: s.paragraphs?.map((p) => ({
      ...p,
      start: Math.max(0, p.start + off),
      end: Math.max(0, p.end + off),
      words: shiftWords(p.words, off),
      sentences: p.sentences?.map((sent) => ({
        ...sent,
        start: Math.max(0, sent.start + off),
        end: Math.max(0, sent.end + off),
        words: shiftWords(sent.words, off),
      })),
    })),
  };
}

/** Shift a statements array by `offsetMs`. No-op for a falsy/zero offset. */
export function shiftStatements(
  statements: Stmt[] | undefined,
  offsetMs: number | null | undefined,
): Stmt[] | undefined {
  if (!statements || !offsetMs) return statements;
  return statements.map((s) => shiftStatement(s, offsetMs));
}

/** Shift raw paragraphs by `offsetMs`. No-op for a falsy/zero offset. */
export function shiftRawParagraphs(
  paragraphs: RawParagraph[] | undefined,
  offsetMs: number | null | undefined,
): RawParagraph[] | undefined {
  if (!paragraphs || !offsetMs) return paragraphs;
  return paragraphs.map((p) => ({
    ...p,
    start: Math.max(0, p.start + offsetMs),
    end: Math.max(0, p.end + offsetMs),
    words: shiftWords(p.words, offsetMs),
  }));
}

/**
 * Apply `offsetMs` to every timestamped part of a transcript's content
 * (statements + raw_paragraphs). Topics and propositions carry no timestamps.
 */
export function applyTimeOffset(
  content: TranscriptContent,
  offsetMs: number | null | undefined,
): TranscriptContent {
  if (!offsetMs) return content;
  return {
    ...content,
    statements:
      shiftStatements(content.statements, offsetMs) ?? content.statements,
    raw_paragraphs: shiftRawParagraphs(content.raw_paragraphs, offsetMs),
  };
}
