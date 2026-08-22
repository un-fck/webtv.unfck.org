/**
 * Omission metric — how much *speech* a provider left out.
 *
 * WHY THIS EXISTS (2026-07-30). A member state reported that A/80/PV.106 was
 * missing words from a statement as delivered. It was: AssemblyAI silently
 * dropped ~3 s mid-sentence, ~30 s later in the same statement, and a 56-word
 * passage from Mexico's statement — reproducibly, in 10 of 10 runs. Nothing in
 * the pipeline or the eval system noticed, for two structural reasons:
 *
 *   1. The pipeline's only coverage guard (`lib/transcription.ts`) compares the
 *      LAST paragraph's end against audio duration. It detects truncation at the
 *      end and is blind to interior holes.
 *   2. WER cannot separate "omitted 56 words of speech" from "misrecognised 56
 *      words", and against a PV reference — which is itself edited — a
 *      contiguous deletion is partly absorbed. The en bake-off's own §2 found
 *      the then-shipped scorer reported a 30% contiguous deletion as 80.2% WER,
 *      i.e. the damage class was not merely under-measured but mis-measured.
 *
 * So omission is scored directly, and from the AUDIO rather than from a text
 * reference: every stretch of speech energy must be covered by transcript words.
 * A stretch of loud audio with no words over it is speech the provider dropped.
 * This needs no ground truth, so it runs on any session, in any language.
 *
 * THREE DESIGN CHOICES THAT ARE NOT ARBITRARY
 *
 * - Coverage is derived from word START spacing, not from [start, end] spans.
 *   A large share of AssemblyAI's word `end` values are clamped to start+80 ms,
 *   far shorter than the word takes to say; trusting them invents holes
 *   everywhere. Two consecutive words less than `gapMs` apart are taken to imply
 *   continuous speech between them.
 *
 * - The speech threshold comes from the AUDIO ONLY (Otsu on the log-RMS
 *   histogram), never from the transcript. A threshold calibrated on
 *   word-covered frames moves when the transcript is damaged — precisely when it
 *   must hold still. This was tried first and had to be thrown away.
 *
 * - A gap alone is never enough. UN recordings are full of legitimate multi-
 *   second silence (gavels, procedural pauses, voting, recesses); one intra-
 *   utterance gap in this corpus was 11 minutes of genuine recess. Energy inside
 *   the gap is what distinguishes a dropped span from a quiet room.
 *
 * The metric is deliberately split: `speechEnvelope()` shells out to ffmpeg,
 * while `findOmissions()` is pure. The negative controls in omission.test.ts
 * exercise the pure half with synthetic envelopes, so they run offline in CI.
 */
import { spawn } from "child_process";

/** Minimal shape needed from a provider word (matches NormalizedTranscript). */
export interface OmissionWord {
  text?: string;
  start: number;
  end: number;
}

export interface OmissionHole {
  startMs: number;
  endMs: number;
  /** Seconds inside the hole whose frames are above the speech threshold. */
  speechSeconds: number;
  /** Fraction of the hole's frames above the threshold (0..1). */
  speechFraction: number;
}

export interface OmissionResult {
  audioSeconds: number;
  speechThreshold: number;
  wordCount: number;
  holes: OmissionHole[];
  /** Total seconds of speech energy not covered by any word. */
  droppedSpeechSeconds: number;
  /** droppedSpeechSeconds / audioSeconds. */
  droppedSpeechRatio: number;
  worstHoleSeconds: number;
}

export interface OmissionOptions {
  /** RMS window. 50 ms is short enough to resolve a single dropped word. */
  frameMs?: number;
  /** Start-to-start spacing above which the interval is treated as a gap. */
  gapMs?: number;
  /**
   * Trimmed from each side of a gap before scoring, so a word's own trailing
   * syllable (timestamps are approximate) is not counted as dropped speech.
   */
  edgeMs?: number;
  /** A hole must carry at least this much speech to count. */
  minSpeechSeconds?: number;
  /** ...and be at least this proportion speech, to exclude applause tails. */
  minSpeechFraction?: number;
}

export const OMISSION_DEFAULTS: Required<OmissionOptions> = {
  frameMs: 50,
  gapMs: 1000,
  edgeMs: 250,
  minSpeechSeconds: 0.8,
  minSpeechFraction: 0.45,
};

/** Sample rate used for the envelope. Only gross energy matters. */
export const ENVELOPE_SAMPLE_RATE = 4000;

/**
 * Otsu's method on the log-RMS histogram: split frames into quiet and loud by
 * maximising between-class variance. Returns the RMS value at the split.
 * Depends only on the audio, which is the whole point — see the header.
 */
export function otsuThreshold(frames: number[]): number {
  if (frames.length === 0) return 0;
  const vals = frames.map((f) => Math.log10(f + 1));
  // Loop rather than Math.min(...vals): a 3-hour meeting is ~200k frames and the
  // spread form overflows the call stack (found on real audio, not in the unit
  // controls — hence the large-input control in omission.test.ts).
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of vals) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi <= lo) return 0;
  const nb = 256;
  const hist = new Array(nb).fill(0);
  for (const v of vals)
    hist[Math.min(nb - 1, Math.floor(((v - lo) / (hi - lo)) * nb))]++;
  const total = vals.length;
  const sumAll = hist.reduce((acc, h, i) => acc + i * h, 0);
  let w0 = 0;
  let s0 = 0;
  let best = -1;
  let bestBin = 0;
  for (let b = 0; b < nb; b++) {
    w0 += hist[b];
    if (w0 === 0) continue;
    const w1 = total - w0;
    if (w1 === 0) break;
    s0 += b * hist[b];
    const m0 = s0 / w0;
    const m1 = (sumAll - s0) / w1;
    const variance = w0 * w1 * (m0 - m1) ** 2;
    if (variance > best) {
      best = variance;
      bestBin = b;
    }
  }
  return 10 ** (lo + ((bestBin + 0.5) / nb) * (hi - lo)) - 1;
}

/**
 * Per-frame RMS envelope of an audio file, via ffmpeg. Streamed, so a 4-hour
 * meeting never materialises as a multi-hundred-MB buffer.
 */
export function speechEnvelope(
  audioPath: string,
  frameMs = OMISSION_DEFAULTS.frameMs,
): Promise<number[]> {
  const samplesPerFrame = (ENVELOPE_SAMPLE_RATE * frameMs) / 1000;
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-v",
      "error",
      "-i",
      audioPath,
      "-ac",
      "1",
      "-ar",
      String(ENVELOPE_SAMPLE_RATE),
      "-f",
      "s16le",
      "-",
    ]);
    const frames: number[] = [];
    let sumSq = 0;
    let count = 0;
    let carry: Buffer = Buffer.alloc(0);
    let stderr = "";

    ff.stdout.on("data", (chunk: Buffer) => {
      const buf = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      const usable = buf.length - (buf.length % 2);
      for (let i = 0; i < usable; i += 2) {
        const s = buf.readInt16LE(i);
        sumSq += s * s;
        if (++count === samplesPerFrame) {
          frames.push(Math.sqrt(sumSq / count));
          sumSq = 0;
          count = 0;
        }
      }
      carry = usable < buf.length ? buf.subarray(usable) : Buffer.alloc(0);
    });
    ff.stderr.on("data", (d) => {
      stderr += String(d);
    });
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `ffmpeg exited ${code} on ${audioPath}: ${stderr.slice(0, 400)}`,
          ),
        );
        return;
      }
      // A trailing partial frame is discarded rather than scored on fewer
      // samples, which would bias its RMS.
      resolve(frames);
    });
  });
}

/**
 * Holes in the word timeline that carry speech energy.
 *
 * `frames` must be the envelope of the SAME audio the words are timed against;
 * a wrong offset shows up immediately as a large jump in droppedSpeechSeconds
 * (exercised as a control in omission.test.ts).
 */
export function findOmissions(
  words: OmissionWord[],
  frames: number[],
  threshold: number,
  options: OmissionOptions = {},
): OmissionHole[] {
  const o = { ...OMISSION_DEFAULTS, ...options };
  const sorted = [...words].sort((a, b) => a.start - b.start);
  const audioMs = frames.length * o.frameMs;

  // Candidate gaps: start-to-start spacing beyond gapMs. `end` is only trusted
  // as a lower bound via max(end, start + 300) — see header.
  const spans: Array<[number, number]> = [];
  let prevEnd = 0;
  for (const w of sorted) {
    if (prevEnd > 0 && w.start - prevEnd >= o.gapMs)
      spans.push([prevEnd, w.start]);
    prevEnd = Math.max(prevEnd, w.end, w.start + 300);
  }
  // Trailing audio after the last word counts too: a provider that stops early
  // is omitting just as surely as one that skips the middle.
  if (sorted.length > 0 && audioMs - prevEnd >= o.gapMs)
    spans.push([prevEnd, audioMs]);

  const holes: OmissionHole[] = [];
  for (const [lo, hi] of spans) {
    const a = lo + o.edgeMs;
    const b = hi - o.edgeMs;
    if (b - a < 500) continue;
    const fa = Math.max(0, Math.floor(a / o.frameMs));
    const fb = Math.min(frames.length, Math.floor(b / o.frameMs));
    if (fb <= fa) continue;
    let loud = 0;
    for (let i = fa; i < fb; i++) if (frames[i] >= threshold) loud++;
    const speechSeconds = (loud * o.frameMs) / 1000;
    const speechFraction = loud / (fb - fa);
    if (
      speechSeconds >= o.minSpeechSeconds &&
      speechFraction >= o.minSpeechFraction
    ) {
      holes.push({ startMs: lo, endMs: hi, speechSeconds, speechFraction });
    }
  }
  return holes;
}

/** Score omission for one provider output against its audio. */
export async function computeOmission(
  audioPath: string,
  words: OmissionWord[],
  options: OmissionOptions = {},
): Promise<OmissionResult> {
  const o = { ...OMISSION_DEFAULTS, ...options };
  const frames = await speechEnvelope(audioPath, o.frameMs);
  return scoreOmission(frames, words, o);
}

/** The pure half of computeOmission, for tests and for reusing one envelope
 *  across several providers on the same session. */
export function scoreOmission(
  frames: number[],
  words: OmissionWord[],
  options: OmissionOptions = {},
): OmissionResult {
  const o = { ...OMISSION_DEFAULTS, ...options };
  const threshold = otsuThreshold(frames);
  const holes = findOmissions(words, frames, threshold, o);
  const audioSeconds = (frames.length * o.frameMs) / 1000;
  const droppedSpeechSeconds = holes.reduce(
    (acc, h) => acc + h.speechSeconds,
    0,
  );
  return {
    audioSeconds,
    speechThreshold: threshold,
    wordCount: words.length,
    holes,
    droppedSpeechSeconds,
    droppedSpeechRatio:
      audioSeconds > 0 ? droppedSpeechSeconds / audioSeconds : 0,
    worstHoleSeconds: holes.reduce((m, h) => Math.max(m, h.speechSeconds), 0),
  };
}

/** Collect words from a NormalizedTranscript's utterances (or top-level words). */
export function wordsFromUtterances(
  utterances?: Array<{ words?: OmissionWord[] }>,
): OmissionWord[] {
  if (!utterances) return [];
  const out: OmissionWord[] = [];
  for (const u of utterances) for (const w of u.words ?? []) out.push(w);
  return out;
}
