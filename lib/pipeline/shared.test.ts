import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildStatementsWithSentences,
  matchWordsToText,
  normalizeText,
  speakersEqual,
} from "@/lib/pipeline";
import { toRawParagraphs } from "@/lib/providers/convert";
import type { NormalizedTranscript } from "@/lib/providers/types";
import type { SpeakerInfo } from "@/lib/db";

// Characterization tests for the pure (non-LLM) helpers, pinning behaviour
// before the lib/pipeline/ split. Real input: a captured transcript →
// toRawParagraphs → ParagraphInput[] (structurally identical shape).
const transcript: NormalizedTranscript = JSON.parse(
  readFileSync(
    join(__dirname, "..", "__fixtures__", "transcript.sample.json"),
    "utf8",
  ),
);
const paragraphs = toRawParagraphs(transcript);

describe("buildStatementsWithSentences — no word timing (Gemini transcript)", () => {
  // The fixture is a Gemini transcript with no per-word timestamps, so each
  // provider segment is the smallest honest timed unit: no sbd splitting, no
  // fabricated timing, no words on the resulting sentences.
  const statements = buildStatementsWithSentences(paragraphs);

  it("emits one statement per input paragraph, preserving the span", () => {
    expect(statements.length).toBe(paragraphs.length);
    statements.forEach((s, i) => {
      expect(s.start).toBe(paragraphs[i].start);
      expect(s.end).toBe(paragraphs[i].end);
    });
  });

  it("emits one sentence per segment carrying the real paragraph span", () => {
    statements.forEach((s, i) => {
      expect(s.paragraphs.length).toBe(1);
      const p = s.paragraphs[0];
      expect(p.sentences.length).toBe(1);
      const sent = p.sentences[0];
      expect(sent.text).toBe(paragraphs[i].text.trim());
      expect(sent.start).toBe(paragraphs[i].start);
      expect(sent.end).toBe(paragraphs[i].end);
    });
  });

  it("fabricates no per-word timestamps on sentences", () => {
    for (const s of statements) {
      for (const p of s.paragraphs) {
        for (const sent of p.sentences) {
          expect(sent.words).toBeUndefined();
        }
      }
    }
  });
});

describe("buildStatementsWithSentences — merged segments (no word timing)", () => {
  // Same-speaker provider segments are grouped upstream into a single paragraph
  // carrying a `segments` list; each becomes a sentence with its real span.
  it("emits one sentence per merged segment with its own real span", () => {
    const [s] = buildStatementsWithSentences([
      {
        text: "First clause.\n\nSecond clause.",
        start: 1000,
        end: 5000,
        speaker: "1",
        segments: [
          { text: "First clause.", start: 1000, end: 2500 },
          { text: "Second clause.", start: 2500, end: 5000 },
        ],
      },
    ]);
    expect(s.paragraphs).toHaveLength(1);
    const sents = s.paragraphs[0].sentences;
    expect(sents).toHaveLength(2);
    expect(sents[0]).toMatchObject({
      text: "First clause.",
      start: 1000,
      end: 2500,
    });
    expect(sents[1]).toMatchObject({
      text: "Second clause.",
      start: 2500,
      end: 5000,
    });
    expect(sents[0].words).toBeUndefined();
  });
});

describe("buildStatementsWithSentences — real word timing", () => {
  // Providers with real word timing keep the sbd-split + word-match path.
  it("derives sentence timing from matched words", () => {
    const [s] = buildStatementsWithSentences([
      {
        text: "Hello world. Bye now.",
        start: 0,
        end: 400,
        words: [
          { text: "Hello", start: 0, end: 100 },
          { text: "world.", start: 100, end: 200 },
          { text: "Bye", start: 200, end: 300 },
          { text: "now.", start: 300, end: 400 },
        ],
      },
    ]);
    const sents = s.paragraphs.flatMap((p) => p.sentences);
    expect(sents.length).toBeGreaterThanOrEqual(2);
    for (const sent of sents) {
      expect(sent.words!.length).toBeGreaterThan(0);
      expect(sent.start).toBe(sent.words![0].start);
      expect(sent.end).toBe(sent.words![sent.words!.length - 1].end);
    }
  });
});

describe("matchWordsToText", () => {
  const words = [
    { text: "Hello", start: 0, end: 100 },
    { text: "world,", start: 100, end: 200 },
    { text: "again", start: 200, end: 300 },
  ];

  it("greedily matches words until the normalized target is covered", () => {
    expect(matchWordsToText(words, 0, "Hello world")).toHaveLength(2);
    expect(matchWordsToText(words, 0, "Hello world again")).toHaveLength(3);
  });

  it("respects the offset and stops when text diverges", () => {
    expect(matchWordsToText(words, 2, "again")).toHaveLength(1);
    expect(matchWordsToText(words, 0, "Goodbye")).toHaveLength(0);
  });
});

describe("normalizeText / speakersEqual", () => {
  it("normalizeText strips non-alphanumerics and lowercases", () => {
    expect(normalizeText("Côte d'Ivoire!")).toBe("ctedivoire");
    expect(normalizeText("S/PV.10124")).toBe("spv10124");
  });

  it("speakersEqual compares all four identity fields", () => {
    const base: SpeakerInfo = {
      name: "Ms. DiCarlo",
      function: "Under-Secretary-General",
      affiliation: "UN",
      group: null,
    };
    expect(speakersEqual(base, { ...base })).toBe(true);
    expect(speakersEqual(base, { ...base, affiliation: "USA" })).toBe(false);
    expect(speakersEqual(base, { ...base, group: "G77" })).toBe(false);
  });
});
