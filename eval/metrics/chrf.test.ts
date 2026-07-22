import { describe, it, expect } from "vitest";
import { computeChrF } from "./chrf";

describe("computeChrF", () => {
  const fr =
    "Le Conseil de sécurité va maintenant procéder au vote sur le projet de résolution.";

  it("scores identical text at 100", () => {
    expect(computeChrF(fr, fr).score).toBeCloseTo(100, 5);
  });

  it("scores unrelated text low", () => {
    const other =
      "Les prévisions météorologiques annoncent de la pluie pour demain matin.";
    expect(computeChrF(fr, other).score).toBeLessThan(30);
  });

  // The whole reason chrF++ replaced WER as the headline metric: an
  // interpreter who compresses and rephrases has done the job correctly, and
  // must not be scored as if they had said something false.
  it("gives paraphrase substantial partial credit", () => {
    const paraphrase = "Le Conseil va à présent voter le projet de résolution.";
    const score = computeChrF(fr, paraphrase).score;
    const unrelated = computeChrF(
      fr,
      "Les prévisions météorologiques annoncent de la pluie.",
    ).score;
    expect(score).toBeGreaterThan(unrelated * 2);
  });

  it("handles scripts without word spacing", () => {
    const zh = "安全理事会现在将对面前的决议草案进行表决。";
    expect(computeChrF(zh, zh).score).toBeCloseTo(100, 5);
    expect(computeChrF(zh, "我们呼吁各方尊重国际人道主义法。").score).toBeLessThan(
      40,
    );
  });

  it("handles Arabic", () => {
    const ar = "سيشرع مجلس الأمن الآن في التصويت على مشروع القرار المعروض عليه.";
    expect(computeChrF(ar, ar).score).toBeCloseTo(100, 5);
  });

  it("returns 0 rather than NaN for empty input", () => {
    expect(computeChrF("", fr).score).toBe(0);
    expect(computeChrF(fr, "").score).toBe(0);
  });
});
