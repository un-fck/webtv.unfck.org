import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { toRawParagraphs } from "@/lib/providers/convert";
import type { NormalizedTranscript } from "@/lib/providers/types";

const transcript: NormalizedTranscript = JSON.parse(
  readFileSync(
    join(__dirname, "..", "__fixtures__", "transcript.sample.json"),
    "utf8",
  ),
);

describe("toRawParagraphs — interpolation branch (real Gemini transcript)", () => {
  const paras = toRawParagraphs(transcript);

  it("emits one paragraph per utterance, preserving text and span", () => {
    expect(paras.length).toBe(transcript.utterances.length);
    paras.forEach((p, i) => {
      expect(p.text).toBe(transcript.utterances[i].text);
      expect(p.start).toBe(transcript.utterances[i].start);
      expect(p.end).toBe(transcript.utterances[i].end);
    });
  });

  it("interpolates one word per token, marked with confidence 0.6", () => {
    paras.forEach((p, i) => {
      const tokens = transcript.utterances[i].text.split(/\s+/).filter(Boolean);
      expect(p.words.length).toBe(tokens.length);
      expect(p.words.every((w) => w.confidence === 0.6)).toBe(true);
      expect(
        p.words.every((w) => w.speaker === transcript.utterances[i].speaker),
      ).toBe(true);
    });
  });

  it("produces monotonic, non-overlapping word timings within the span", () => {
    for (const p of paras) {
      expect(p.words[0].start).toBe(p.start);
      for (let i = 0; i < p.words.length; i++) {
        expect(p.words[i].end).toBeGreaterThanOrEqual(p.words[i].start);
        if (i > 0) {
          expect(p.words[i].start).toBe(p.words[i - 1].end);
        }
      }
      expect(p.words[p.words.length - 1].end).toBeLessThanOrEqual(p.end + 1);
    }
  });
});

describe("toRawParagraphs — real word-timestamp branch", () => {
  // Minimal structural case: providers that supply real word timing should
  // have it passed through verbatim (confidence preserved, not 0.6).
  it("passes provider word timestamps through unchanged", () => {
    const withWords: NormalizedTranscript = {
      provider: "assemblyai",
      language: "en",
      durationMs: 2000,
      fullText: "hello world",
      raw: null,
      utterances: [
        {
          speaker: "A",
          start: 0,
          end: 2000,
          text: "hello world",
          words: [
            { text: "hello", start: 0, end: 800, confidence: 0.99 },
            { text: "world", start: 900, end: 1800, confidence: 0.95 },
          ],
        },
      ],
    };
    const [p] = toRawParagraphs(withWords);
    expect(p.words).toHaveLength(2);
    expect(p.words[0]).toMatchObject({ text: "hello", confidence: 0.99 });
    expect(p.words[1]).toMatchObject({ start: 900, end: 1800 });
    // Speaker falls back to the utterance speaker when the word lacks one.
    expect(p.words[0].speaker).toBe("A");
  });
});
