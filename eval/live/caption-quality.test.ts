import { describe, it, expect } from "vitest";
import { captionQuality } from "./caption-quality";
import type { StreamingEvent } from "./streaming-types";

const ev = (text: string, emitMs: number): StreamingEvent => ({
  text,
  audioTimeMs: emitMs - 500,
  emitMs,
  isFinal: true,
});

describe("captionQuality", () => {
  // The load-bearing distinction: a token-streaming translator is not a
  // captioning system, and must not be handed a reading-rate number that
  // invites comparison with one.
  it("reports token fragments as unsegmented", () => {
    const tokens = ["Je", " déc", "lar", "e", " que", " la"].map((t, i) =>
      ev(t, i * 200),
    );
    const q = captionQuality(tokens, 60000);
    expect(q.segmented).toBe(false);
    expect(q.medianReadingRate).toBeNaN();
  });

  it("treats real caption units as segmented", () => {
    const caps = [
      ev("The Security Council will now proceed to the vote.", 1500),
      ev("I give the floor to the representative of France.", 5000),
      ev("Thank you, Mr President, for convening this meeting.", 9000),
    ];
    const q = captionQuality(caps, 60000);
    expect(q.segmented).toBe(true);
    expect(q.count).toBe(3);
    expect(q.medianReadingRate).toBeGreaterThan(0);
  });

  it("flags captions replaced too fast to read", () => {
    // ~50 characters swapped every 400ms is far beyond the ~21 char/sec ceiling.
    const rushed = Array.from({ length: 6 }, (_, i) =>
      ev("The Security Council will now proceed to the vote.", i * 400),
    );
    const q = captionQuality(rushed, 60000);
    expect(q.segmented).toBe(true);
    expect(q.medianReadingRate).toBeGreaterThan(21);
    expect(q.shareOverLimit).toBe(1);
  });

  it("does not flag a comfortable reading rate", () => {
    const relaxed = Array.from({ length: 6 }, (_, i) =>
      ev("Thank you, Mr President.", i * 4000),
    );
    const q = captionQuality(relaxed, 60000);
    expect(q.shareOverLimit).toBe(0);
  });

  it("survives empty input", () => {
    const q = captionQuality([], 60000);
    expect(q.segmented).toBe(false);
    expect(q.count).toBe(0);
  });
});
