import { describe, it, expect } from "vitest";
import {
  otsuThreshold,
  scoreOmission,
  findOmissions,
  OMISSION_DEFAULTS,
  type OmissionWord,
} from "./omission";

/**
 * Negative controls for the omission metric.
 *
 * A check that has never been shown to fail is absent, not passing. Every
 * control below damages a known-good input in a specific way and asserts the
 * metric reacts (or, for the false-positive controls, that it does NOT).
 *
 * These run on synthetic envelopes rather than real audio so they are offline,
 * deterministic, and fast — the ffmpeg half (`speechEnvelope`) is exercised
 * separately by real eval runs.
 */

const FRAME_MS = OMISSION_DEFAULTS.frameMs;
const SPEECH_RMS = 1500;
const SILENCE_RMS = 20;

/** Speech regions of the synthetic session, in seconds. */
const SPEECH_REGIONS: Array<[number, number]> = [
  [0, 100],
  [120, 200],
  [250, 400],
  [420, 590],
];
const AUDIO_SECONDS = 600;

function buildEnvelope(): number[] {
  const n = (AUDIO_SECONDS * 1000) / FRAME_MS;
  const frames = new Array(n).fill(SILENCE_RMS);
  for (const [a, b] of SPEECH_REGIONS) {
    for (let i = (a * 1000) / FRAME_MS; i < (b * 1000) / FRAME_MS; i++) {
      // Deterministic variation so the histogram is not two spikes; keeps the
      // Otsu split realistic without randomness.
      frames[i] = SPEECH_RMS + ((i % 7) - 3) * 100;
    }
  }
  return frames;
}

/** A "perfect" transcript: one word every 300 ms across every speech region. */
function buildWords(): OmissionWord[] {
  const words: OmissionWord[] = [];
  for (const [a, b] of SPEECH_REGIONS) {
    for (let t = a * 1000; t < b * 1000; t += 300) {
      words.push({ text: "w", start: t, end: Math.min(t + 280, b * 1000) });
    }
  }
  return words;
}

const envelope = buildEnvelope();
const perfect = buildWords();

/** Words whose start falls in [fromS, toS) are removed. */
const deleteRange = (words: OmissionWord[], fromS: number, toS: number) =>
  words.filter((w) => w.start < fromS * 1000 || w.start >= toS * 1000);

describe("omission metric — threshold calibration", () => {
  it("puts the Otsu split between silence and speech", () => {
    const t = otsuThreshold(envelope);
    expect(t).toBeGreaterThan(SILENCE_RMS);
    expect(t).toBeLessThan(SPEECH_RMS - 400);
  });

  it("depends only on the audio, never on the transcript", () => {
    // The invariant, stated exactly: for one envelope the threshold is the same
    // whatever the transcript says — including when there is no transcript at
    // all. The first version of this metric calibrated on word-covered frames
    // and so moved when the transcript was damaged, which is precisely when it
    // must hold still. Comparing against the empty transcript is what makes
    // that regression detectable; comparing two merely *different* transcripts
    // does not, because both may happen to cover the same kind of frames.
    const thresholds = [
      scoreOmission(envelope, perfect).speechThreshold,
      scoreOmission(envelope, deleteRange(perfect, 300, 380)).speechThreshold,
      scoreOmission(
        envelope,
        perfect.filter((w) => w.start < 120_000),
      ).speechThreshold,
      scoreOmission(envelope, []).speechThreshold,
    ];
    expect(new Set(thresholds).size).toBe(1);
  });
});

describe("omission metric — must NOT fire on good input (false-positive controls)", () => {
  it("reports essentially no dropped speech for a complete transcript", () => {
    const r = scoreOmission(envelope, perfect);
    expect(r.droppedSpeechSeconds).toBeLessThan(1);
  });

  it("does not flag genuine silence between speech regions", () => {
    // The 100-120s, 200-250s and 400-420s silences are real gaps in the audio
    // and are legitimately uncovered by words.
    const r = scoreOmission(envelope, perfect);
    const inSilence = r.holes.filter((h) =>
      SPEECH_REGIONS.every(
        ([a, b]) => h.startMs >= b * 1000 || h.endMs <= a * 1000,
      ),
    );
    expect(inSilence).toHaveLength(0);
  });

  it("does not invent holes when word `end` is clamped short", () => {
    // AssemblyAI clamps a large share of `end` values to start+80ms, far
    // shorter than the word takes to say. At normal word spacing that is
    // harmless, but in slow, emphatic delivery — common in this corpus — word
    // starts sit ~1.4 s apart, and taking the clamped `end` at face value turns
    // every one of those into a "hole" full of speech. Hence the
    // max(end, start + 300) floor in findOmissions.
    //
    // 1450 ms spacing is chosen deliberately: it is inside the window where
    // trusting `end` produces a false hole above the detection floor but the
    // 300 ms guard keeps it below. Widen the guard and this test stops biting.
    const slow: OmissionWord[] = [];
    for (const [a, b] of SPEECH_REGIONS) {
      for (let t = a * 1000; t < b * 1000; t += 1450) {
        slow.push({ text: "w", start: t, end: t + 80 });
      }
    }
    const r = scoreOmission(envelope, slow);
    expect(r.droppedSpeechSeconds).toBeLessThan(1);
  });

  it("does not flag a gap that is long but quiet", () => {
    // 50 s of silence with no words over it — the single most common shape in
    // UN audio (procedural pause, voting, recess).
    const holes = findOmissions(perfect, envelope, otsuThreshold(envelope));
    expect(
      holes.every(
        (h) => h.speechFraction >= OMISSION_DEFAULTS.minSpeechFraction,
      ),
    ).toBe(true);
  });
});

describe("omission metric — MUST fire on damaged input (negative controls)", () => {
  it("detects a 30 s contiguous deletion inside speech", () => {
    const base = scoreOmission(envelope, perfect).droppedSpeechSeconds;
    const r = scoreOmission(envelope, deleteRange(perfect, 300, 330));
    expect(r.droppedSpeechSeconds - base).toBeGreaterThan(25);
    expect(r.worstHoleSeconds).toBeGreaterThan(25);
  });

  it("detects the ~3 s mid-sentence drop that started all this", () => {
    // The A/80/PV.106 case: "reassess our engagement, [participation, and
    // funding.]" — about 3 s. Small, but it is the whole reason the metric
    // exists, so it must not sit under the detection floor.
    const base = scoreOmission(envelope, perfect).droppedSpeechSeconds;
    const r = scoreOmission(envelope, deleteRange(perfect, 150, 153));
    expect(r.droppedSpeechSeconds - base).toBeGreaterThan(1.5);
    expect(r.holes.length).toBeGreaterThan(0);
  });

  it("detects a provider that stops early (trailing omission)", () => {
    const truncated = perfect.filter((w) => w.start < 300_000);
    const r = scoreOmission(envelope, truncated);
    // Everything after 300 s that is speech (100 s + 170 s) should surface.
    expect(r.droppedSpeechSeconds).toBeGreaterThan(200);
  });

  it("blows up when the words are misaligned against the audio", () => {
    // Guards the mapping itself: if timestamps and audio disagree (e.g. a
    // re-cut video whose offset was never applied), the score must not stay
    // quietly low.
    const base = scoreOmission(envelope, perfect).droppedSpeechSeconds;
    const shifted = perfect.map((w) => ({
      ...w,
      start: w.start + 60_000,
      end: w.end + 60_000,
    }));
    const r = scoreOmission(envelope, shifted);
    expect(r.droppedSpeechSeconds).toBeGreaterThan(base + 20);
  });

  it("scales with the size of the deletion", () => {
    const d10 = scoreOmission(
      envelope,
      deleteRange(perfect, 300, 310),
    ).droppedSpeechSeconds;
    const d30 = scoreOmission(
      envelope,
      deleteRange(perfect, 300, 330),
    ).droppedSpeechSeconds;
    const d60 = scoreOmission(
      envelope,
      deleteRange(perfect, 300, 360),
    ).droppedSpeechSeconds;
    expect(d30).toBeGreaterThan(d10);
    expect(d60).toBeGreaterThan(d30);
  });

  it("reports a ratio, not just a total, so long meetings stay comparable", () => {
    const r = scoreOmission(envelope, deleteRange(perfect, 300, 330));
    expect(r.audioSeconds).toBeCloseTo(AUDIO_SECONDS, 1);
    expect(r.droppedSpeechRatio).toBeCloseTo(
      r.droppedSpeechSeconds / AUDIO_SECONDS,
      6,
    );
  });
});

describe("omission metric — realistic input sizes", () => {
  it("handles a full-length meeting without blowing the call stack", () => {
    // A 3-hour meeting is ~216k frames at 50 ms. The first implementation used
    // Math.min(...vals) / Math.max(...vals), which throws RangeError on arrays
    // this size — it passed every synthetic control above (600 s = 12k frames)
    // and failed on the first real recording it saw. Sized above the real
    // corpus maximum so the guard keeps meaning something.
    const n = (3.5 * 3600 * 1000) / FRAME_MS; // 3h30m
    const big = new Array(n);
    for (let i = 0; i < n; i++)
      big[i] = i % 100 < 70 ? SPEECH_RMS : SILENCE_RMS;
    expect(() => otsuThreshold(big)).not.toThrow();
    const t = otsuThreshold(big);
    expect(t).toBeGreaterThan(SILENCE_RMS);
    expect(t).toBeLessThan(SPEECH_RMS);
    expect(() =>
      scoreOmission(big, [{ text: "w", start: 0, end: 300 }]),
    ).not.toThrow();
  });
});

describe("omission metric — empty and degenerate inputs", () => {
  it("returns zero for an empty envelope rather than dividing by zero", () => {
    const r = scoreOmission([], perfect);
    expect(r.droppedSpeechRatio).toBe(0);
    expect(r.audioSeconds).toBe(0);
  });

  it("reports no holes when there are no words at all", () => {
    // With nothing to anchor to there is no timeline to find gaps in; the
    // absence of a transcript is a different failure (and is caught upstream),
    // so this must not throw or report a spurious 100%.
    const r = scoreOmission(envelope, []);
    expect(r.holes).toHaveLength(0);
    expect(r.wordCount).toBe(0);
  });
});
