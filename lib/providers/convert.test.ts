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

describe("toRawParagraphs — no word timing (real Gemini transcript)", () => {
  const paras = toRawParagraphs(transcript);

  it("emits one paragraph per utterance, preserving text and span", () => {
    expect(paras.length).toBe(transcript.utterances.length);
    paras.forEach((p, i) => {
      expect(p.text).toBe(transcript.utterances[i].text);
      expect(p.start).toBe(transcript.utterances[i].start);
      expect(p.end).toBe(transcript.utterances[i].end);
    });
  });

  it("fabricates no per-word timestamps — words is absent", () => {
    paras.forEach((p) => {
      expect(p.words).toBeUndefined();
    });
  });

  it("carries the ASR speaker label on the paragraph", () => {
    paras.forEach((p, i) => {
      expect(p.speaker).toBe(transcript.utterances[i].speaker);
    });
  });
});

describe("toRawParagraphs — real word-timestamp branch", () => {
  // Providers that supply real word timing have it passed through verbatim.
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
    expect(p.words![0]).toMatchObject({ text: "hello", start: 0, end: 800 });
    expect(p.words![1]).toMatchObject({ start: 900, end: 1800 });
    // Speaker falls back to the utterance speaker when the word lacks one.
    expect(p.words![0].speaker).toBe("A");
  });
});
