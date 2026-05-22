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

describe("buildStatementsWithSentences (real transcript-derived paragraphs)", () => {
  const statements = buildStatementsWithSentences(paragraphs);

  it("emits one statement per input paragraph, preserving the span", () => {
    expect(statements.length).toBe(paragraphs.length);
    statements.forEach((s, i) => {
      expect(s.start).toBe(paragraphs[i].start);
      expect(s.end).toBe(paragraphs[i].end);
    });
  });

  it("splits into paragraphs→sentences whose words cover the sentence text", () => {
    for (const s of statements) {
      expect(s.paragraphs.length).toBeGreaterThan(0);
      for (const p of s.paragraphs) {
        expect(p.sentences.length).toBeGreaterThan(0);
        for (const sent of p.sentences) {
          expect(sent.words.length).toBeGreaterThan(0);
          // matched words normalize to a prefix of the sentence text
          const joined = normalizeText(sent.words.map((w) => w.text).join(" "));
          expect(normalizeText(sent.text).startsWith(joined)).toBe(true);
          // sentence timing derives from its first/last word
          expect(sent.start).toBe(sent.words[0].start);
          expect(sent.end).toBe(sent.words[sent.words.length - 1].end);
        }
      }
    }
  });

  it("never consumes more words than the paragraph provides", () => {
    statements.forEach((s, i) => {
      const used = s.paragraphs
        .flatMap((p) => p.sentences)
        .flatMap((sent) => sent.words).length;
      expect(used).toBeLessThanOrEqual(paragraphs[i].words.length);
    });
  });
});

describe("matchWordsToText", () => {
  const words = [
    { text: "Hello", start: 0, end: 100, confidence: 1 },
    { text: "world,", start: 100, end: 200, confidence: 1 },
    { text: "again", start: 200, end: 300, confidence: 1 },
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
