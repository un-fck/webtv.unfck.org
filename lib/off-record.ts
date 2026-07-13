import type { SpeakerMapping, TranscriptContent } from "./db";

type Statements = NonNullable<TranscriptContent["statements"]>;

/**
 * Serving-boundary filter for off-record content.
 *
 * The pipeline keeps off-record paragraphs in the stored transcript (flagged
 * via `SpeakerMapping[i].is_off_record`, one entry per statement) instead of
 * hard-deleting them — the data stays in the DB for debugging/auditing, and
 * every user-facing surface hides it by passing statements + mapping through
 * this filter. Statements are reindexed so the returned mapping keys stay
 * aligned, and the internal flag is stripped so it never leaks into any
 * response payload.
 *
 * Every route that serves statements MUST go through this (transcript check,
 * poll, words, public JSON/text) — a new consumer that reads
 * `content.statements` directly will leak off-record content.
 */
export function filterOffRecord(
  statements: Statements | undefined,
  mapping: SpeakerMapping,
): { statements: Statements; speakerMappings: SpeakerMapping } {
  const visibleStatements: Statements = [];
  const visibleMapping: SpeakerMapping = {};

  (statements ?? []).forEach((statement, index) => {
    const info = mapping[index.toString()];
    if (info?.is_off_record) return;
    if (info) {
      const { is_off_record: _flag, ...rest } = info;
      visibleMapping[visibleStatements.length.toString()] = rest;
    }
    visibleStatements.push(statement);
  });

  return { statements: visibleStatements, speakerMappings: visibleMapping };
}
