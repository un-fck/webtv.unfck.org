import type { TranscriptContent } from "@/lib/db";

type Statements = TranscriptContent["statements"];
type Statement = Statements[number];
type Paragraph = Statement["paragraphs"][number];
type Sentence = Paragraph["sentences"][number];

/**
 * Build a statements array suitable for first paint by dropping every
 * `words[]` array. Word-level timestamps account for ~63% of a typical
 * transcript payload — the panel uses them only for in-sentence karaoke
 * highlight + click-to-seek, which the playback hook fetches separately via
 * /api/transcripts/[id]/words once the transcript has rendered.
 *
 * Word arrays live at three levels (statement, paragraph, sentence); strip
 * all three so the omission is uniform.
 */
export function stripWordsFromStatements(statements: Statements): Statements {
  return statements.map(stripStatement);
}

function stripStatement(stmt: Statement): Statement {
  return {
    start: stmt.start,
    end: stmt.end,
    paragraphs: stmt.paragraphs.map(stripParagraph),
  };
}

function stripParagraph(para: Paragraph): Paragraph {
  return {
    start: para.start,
    end: para.end,
    sentences: para.sentences.map(stripSentence),
  };
}

function stripSentence(sent: Sentence): Sentence {
  return {
    text: sent.text,
    start: sent.start,
    end: sent.end,
    ...(sent.topic_keys ? { topic_keys: sent.topic_keys } : {}),
  };
}

// -- words-only payload --------------------------------------------------

/**
 * Mirror of the statements structure carrying only the `words[]` arrays —
 * what /api/transcripts/[id]/words returns. The client merges these back
 * into the statements state by index once the transcript is on screen.
 */
export interface WordsOnlyStatement {
  words?: Statement["words"];
  paragraphs: WordsOnlyParagraph[];
}
export interface WordsOnlyParagraph {
  words?: Paragraph["words"];
  sentences: WordsOnlySentence[];
}
export interface WordsOnlySentence {
  words?: Sentence["words"];
}

export function wordsOnlyFromStatements(
  statements: Statements,
): WordsOnlyStatement[] {
  return statements.map((stmt) => ({
    ...(stmt.words ? { words: stmt.words } : {}),
    paragraphs: stmt.paragraphs.map((para) => ({
      ...(para.words ? { words: para.words } : {}),
      sentences: para.sentences.map((sent) => ({
        ...(sent.words ? { words: sent.words } : {}),
      })),
    })),
  }));
}
