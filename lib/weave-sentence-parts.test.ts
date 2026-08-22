import { describe, it, expect } from "vitest";
import { weaveSentenceParts, type WeaveWord } from "@/lib/weave-sentence-parts";

/**
 * Tests cover every per-language provider currently wired in STT_ROUTING
 * (config.ts). The shape of `words` differs meaningfully across them and
 * was the source of a regression where English/AssemblyAI showed no
 * karaoke cue — `weaveSentenceParts` was written against fun-asr's
 * character tokens and silently failed on AssemblyAI's lowercased
 * sentence-internal words.
 */

const w = (text: string, start = 0, end = 0): WeaveWord => ({
  text,
  start,
  end,
});

const wordIdxs = (parts: ReturnType<typeof weaveSentenceParts>) =>
  parts.filter((p) => p.word).map((p) => p.wordIdx);

const rebuilt = (parts: ReturnType<typeof weaveSentenceParts>) =>
  parts.map((p) => p.text).join("");

describe("weaveSentenceParts — empty / no-words case", () => {
  it("returns a single plain part when words is undefined (provider emitted no word timings)", () => {
    const parts = weaveSentenceParts("Bonjour le monde.");
    expect(parts).toEqual([{ text: "Bonjour le monde." }]);
  });

  it("returns a single plain part when words is empty", () => {
    const parts = weaveSentenceParts("Bonjour.", []);
    expect(parts).toEqual([{ text: "Bonjour." }]);
  });
});

describe("weaveSentenceParts — AssemblyAI Universal-3 Pro (English)", () => {
  // AssemblyAI capitalizes the first word of each utterance and lowercases
  // subsequent words; punctuation is attached to the sentence text but NOT
  // included in word.text. Reproduced from real Universal-3 Pro output.
  it("matches lowercased sentence-internal words against capitalized sentence text", () => {
    const text =
      "I call to order the informal meeting of the Plenary on the UNAD Initiative.";
    const words = [
      w("I"),
      w("call"),
      w("to"),
      w("order"),
      w("the"),
      w("informal"),
      w("meeting"),
      w("of"),
      w("the"),
      w("Plenary"),
      w("on"),
      w("the"),
      w("UNAD"),
      w("Initiative"),
    ];
    const parts = weaveSentenceParts(text, words);

    expect(rebuilt(parts)).toBe(text);
    expect(wordIdxs(parts)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
    // Trailing period must land in a plain part, not on the last word span.
    expect(parts[parts.length - 1]).toEqual({ text: "." });
  });

  it("handles commas attached to words in the sentence text", () => {
    const text = "Hello, world.";
    const words = [w("Hello"), w("world")];
    const parts = weaveSentenceParts(text, words);

    expect(rebuilt(parts)).toBe(text);
    expect(wordIdxs(parts)).toEqual([0, 1]);
    // The ", " between Hello and world must be a non-clickable separator.
    const helloIdx = parts.findIndex((p) => p.word?.text === "Hello");
    expect(parts[helloIdx + 1]).toEqual({ text: ", " });
  });

  it("survives a missing/dropped word without losing visible text", () => {
    // Simulate a Universal-3 word that doesn't appear in the sentence text
    // (rare formatter quirk). The bad word is skipped; surrounding words
    // still get clickable spans; no characters are lost.
    const text = "I call to order.";
    const words = [w("I"), w("called"), w("to"), w("order")]; // "called" ≠ "call"
    const parts = weaveSentenceParts(text, words);

    expect(rebuilt(parts)).toBe(text);
    expect(wordIdxs(parts)).toEqual([0, 2, 3]);
  });
});

describe("weaveSentenceParts — Azure LLM Speech (en/fr/es/ar/ru)", () => {
  // Azure's enhanced mode differs from AssemblyAI in a way that matters here:
  // punctuation is included INSIDE word.text ("afternoon.", "engagement,"), and
  // words are Title/sentence-cased as the formatter sees fit. Both are absorbed
  // by the normalized matcher, but until English moved to this provider
  // (2026-07-30) no test pinned the shape — the file claimed to cover every
  // provider in STT_ROUTING while actually covering the retired
  // azure-gpt-4o-transcribe, which returned no words at all.
  // Word shapes below are reproduced from real enhanced-mode output.
  it("matches words whose text carries attached punctuation", () => {
    const text =
      "Good afternoon. The 106th Plenary Meeting is called to order.";
    const words = [
      w("Good"),
      w("afternoon."),
      w("The"),
      w("106th"),
      w("Plenary"),
      w("Meeting"),
      w("is"),
      w("called"),
      w("to"),
      w("order."),
    ];
    const parts = weaveSentenceParts(text, words);

    expect(rebuilt(parts)).toBe(text);
    expect(wordIdxs(parts)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // The period travelled in word.text but must still render outside the span,
    // so the clickable region is the word and not the punctuation.
    expect(parts[parts.length - 1]).toEqual({ text: "." });
  });

  it("keeps document symbols clickable as single tokens", () => {
    // Azure renders symbols like A/80/L.100 as one token; the matcher strips
    // the slashes and dots when comparing, so this must not split or drop.
    const text =
      "We shall now consider draft decision A/80/L.100, as presented.";
    const words = [
      w("We"),
      w("shall"),
      w("now"),
      w("consider"),
      w("draft"),
      w("decision"),
      w("A/80/L.100,"),
      w("as"),
      w("presented."),
    ];
    const parts = weaveSentenceParts(text, words);

    expect(rebuilt(parts)).toBe(text);
    expect(wordIdxs(parts)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("handles a comma-terminated word followed by a capitalized word", () => {
    // The exact shape at the centre of the A/80/PV.106 omission report: a
    // sentence that continues across a comma. Nothing may be dropped here.
    const text =
      "The United States will reassess our engagement, participation, and funding.";
    const words = [
      w("The"),
      w("United"),
      w("States"),
      w("will"),
      w("reassess"),
      w("our"),
      w("engagement,"),
      w("participation,"),
      w("and"),
      w("funding."),
    ];
    const parts = weaveSentenceParts(text, words);

    expect(rebuilt(parts)).toBe(text);
    expect(wordIdxs(parts)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("weaveSentenceParts — Gemini 3 Flash (floor track, multilingual)", () => {
  // Gemini emits clean word tokens with case preserved.
  it("matches case-preserved words against sentence text", () => {
    const text = "The Secretary-General welcomed delegates.";
    const words = [
      w("The"),
      w("Secretary-General"),
      w("welcomed"),
      w("delegates"),
    ];
    const parts = weaveSentenceParts(text, words);
    expect(rebuilt(parts)).toBe(text);
    expect(wordIdxs(parts)).toEqual([0, 1, 2, 3]);
  });
});

describe("weaveSentenceParts — Alibaba fun-asr (Chinese, character tokens)", () => {
  // fun-asr emits per-character / per-token Chinese words that sit flush
  // against ideographic punctuation in the sentence text. This is the
  // scenario the function was originally written against.
  it("matches Chinese character tokens flush against 。", () => {
    const text = "我们都在这里。";
    const words = [w("我们"), w("都"), w("在"), w("这里")];
    const parts = weaveSentenceParts(text, words);

    expect(rebuilt(parts)).toBe(text);
    expect(wordIdxs(parts)).toEqual([0, 1, 2, 3]);
    // The ideographic full stop must land in a trailing plain part.
    expect(parts[parts.length - 1]).toEqual({ text: "。" });
  });

  it("handles mixed Chinese + Latin tokens (fun-asr's joined-words quirk)", () => {
    const text = "联合国 UN 大会。";
    const words = [w("联合国"), w("UN"), w("大会")];
    const parts = weaveSentenceParts(text, words);
    expect(rebuilt(parts)).toBe(text);
    expect(wordIdxs(parts)).toEqual([0, 1, 2]);
  });
});

describe("weaveSentenceParts — properties that must hold for every provider", () => {
  const cases: Array<{
    name: string;
    text: string;
    words: WeaveWord[];
  }> = [
    {
      name: "AssemblyAI lowercased internal words",
      text: "I warmly welcome you all to this meeting.",
      words: [
        w("I"),
        w("warmly"),
        w("welcome"),
        w("you"),
        w("all"),
        w("to"),
        w("this"),
        w("meeting"),
      ],
    },
    {
      name: "Gemini case-preserved words",
      text: "Excellencies, Dr. Colleagues.",
      words: [w("Excellencies"), w("Dr"), w("Colleagues")],
    },
    {
      name: "fun-asr Chinese tokens",
      text: "感谢秘书长。",
      words: [w("感谢"), w("秘书长")],
    },
  ];

  for (const c of cases) {
    it(`(${c.name}) reconstructs the sentence text exactly`, () => {
      const parts = weaveSentenceParts(c.text, c.words);
      expect(rebuilt(parts)).toBe(c.text);
    });

    it(`(${c.name}) matches every word in order`, () => {
      const parts = weaveSentenceParts(c.text, c.words);
      const matched = parts.filter((p) => p.word).map((p) => p.wordIdx ?? -1);
      // Indices must be strictly increasing.
      for (let i = 1; i < matched.length; i++) {
        expect(matched[i]).toBeGreaterThan(matched[i - 1]);
      }
      // For these realistic cases every word should land somewhere.
      expect(matched.length).toBe(c.words.length);
    });

    it(`(${c.name}) preserves the underlying word reference on matched parts`, () => {
      const parts = weaveSentenceParts(c.text, c.words);
      for (const p of parts) {
        if (p.word) {
          expect(p.word).toBe(c.words[p.wordIdx!]);
        }
      }
    });
  }
});
