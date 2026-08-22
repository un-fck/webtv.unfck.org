/**
 * Monotonic alignment of a floor chunk stream against an interpreted chunk
 * stream, and the lag measurement that falls out of it.
 *
 * Interpretation is order-preserving: an interpreter renders propositions in
 * the order they were uttered. So this is a DTW, not a free matching — which
 * is what keeps it honest, because a free nearest-neighbour matching would
 * happily pair a chunk with a similar-sounding passage twenty minutes away.
 *
 * Two further constraints do most of the work:
 *
 *  - **A time band.** No interpreter runs three minutes behind the floor, and
 *    none runs ahead of it at all. Forbidding matches outside a physically
 *    plausible lag window collapses an O(N·M) problem to O(N·band) and, more
 *    importantly, stops a locally-attractive but absurd warp from surviving.
 *  - **Skip costs.** Interpreters omit (compression under load) and add
 *    (explicitation). Both must be cheap enough to happen and expensive enough
 *    not to be the default, or the path degenerates into skipping everything.
 */
import type { Chunk } from "./extract";

export interface AlignOptions {
  /** Interpreters never lead the floor by more than this (ms). */
  minLagMs?: number;
  /** …nor trail it by more than this (ms). */
  maxLagMs?: number;
  /** Cost of leaving a floor chunk unmatched (an omission). */
  skipFloorCost?: number;
  /** Cost of leaving a target chunk unmatched (an addition). */
  skipTargetCost?: number;
}

export const DEFAULT_ALIGN: Required<AlignOptions> = {
  // A little negative slack: interpreters occasionally anticipate a formulaic
  // ending, and chunk-boundary quantisation alone is worth a few seconds.
  minLagMs: -15_000,
  maxLagMs: 180_000,
  skipFloorCost: 0.62,
  skipTargetCost: 0.62,
};

export interface Match {
  floorIdx: number;
  targetIdx: number;
  floorStart: number;
  targetStart: number;
  /** targetStart − floorStart, in ms. The quantity of interest. */
  lagMs: number;
  similarity: number;
  floorText: string;
  targetText: string;
  /** Floor-side language label, when the floor provider supplied one. */
  sourceLanguage?: string;
}

/** Cosine of two unit-norm embeddings (OpenAI embeddings are unit-norm). */
function cos(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Align floor chunks to target chunks. Returns only matched pairs; skipped
 * chunks on either side are dropped (they are omissions/additions, and have
 * no lag to report).
 */
export function alignChunks(
  floor: Chunk[],
  target: Chunk[],
  floorEmb: Float32Array[],
  targetEmb: Float32Array[],
  opts: AlignOptions = {},
): Match[] {
  const o = { ...DEFAULT_ALIGN, ...opts };
  const N = floor.length;
  const M = target.length;
  if (!N || !M) return [];

  // For each floor chunk, the contiguous target range whose start time falls
  // inside the plausible lag band. Target starts are monotone, so both ends
  // advance monotonically and the whole thing is one linear scan.
  const lo = new Int32Array(N);
  const hi = new Int32Array(N);
  let l = 0;
  let h = 0;
  for (let i = 0; i < N; i++) {
    const t = floor[i].start;
    while (l < M && target[l].start < t + o.minLagMs) l++;
    if (h < l) h = l;
    while (h < M && target[h].start <= t + o.maxLagMs) h++;
    lo[i] = l;
    hi[i] = h; // exclusive
  }

  const INF = 1e15;
  // Rolling DP over target index. prev[j] = best cost aligning floor[0..i-1]
  // with target[0..j-1]. Backpointers are stored densely per row: the band is
  // narrow relative to M in practice, but correctness first — store a byte per
  // (i, j) visited cell in a flat array of Uint8 moves.
  const moves = new Uint8Array(N * (M + 1)); // 0 = none, 1 = match, 2 = skipFloor, 3 = skipTarget
  let prev = new Float64Array(M + 1).fill(INF);
  let cur = new Float64Array(M + 1);
  // Before consuming any floor chunk, skipping j target chunks costs j·skip.
  prev[0] = 0;
  for (let j = 1; j <= M; j++) prev[j] = prev[j - 1] + o.skipTargetCost;

  for (let i = 0; i < N; i++) {
    cur.fill(INF);
    const rowBase = i * (M + 1);
    // Skipping every target chunk seen so far, having consumed floor[0..i].
    cur[0] = prev[0] + o.skipFloorCost;
    moves[rowBase] = 2;
    for (let j = 1; j <= M; j++) {
      let best = INF;
      let mv = 0;

      // Skip this floor chunk (omission).
      const a = prev[j] + o.skipFloorCost;
      if (a < best) {
        best = a;
        mv = 2;
      }
      // Skip this target chunk (addition).
      const b = cur[j - 1] + o.skipTargetCost;
      if (b < best) {
        best = b;
        mv = 3;
      }
      // Match floor[i] ↔ target[j-1], if inside the lag band.
      const tj = j - 1;
      if (tj >= lo[i] && tj < hi[i] && prev[j - 1] < INF) {
        const c = prev[j - 1] + (1 - cos(floorEmb[i], targetEmb[tj]));
        if (c < best) {
          best = c;
          mv = 1;
        }
      }
      cur[j] = best;
      moves[rowBase + j] = mv;
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }

  // Backtrace.
  const out: Match[] = [];
  let i = N - 1;
  let j = M;
  while (i >= 0 && j >= 0) {
    const mv = moves[i * (M + 1) + j];
    if (mv === 1) {
      const tj = j - 1;
      const sim = cos(floorEmb[i], targetEmb[tj]);
      out.push({
        floorIdx: i,
        targetIdx: tj,
        floorStart: floor[i].start,
        targetStart: target[tj].start,
        lagMs: target[tj].start - floor[i].start,
        similarity: sim,
        floorText: floor[i].text,
        targetText: target[tj].text,
        sourceLanguage: floor[i].language,
      });
      i--;
      j--;
    } else if (mv === 2) {
      i--;
    } else if (mv === 3) {
      j--;
    } else {
      break;
    }
  }
  return out.reverse();
}

/** Percentile of a numeric array (nearest-rank on a sorted copy). */
export function pct(values: number[], p: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
  return s[idx];
}

export function summarize(matches: Match[], minSimilarity = 0.5) {
  const kept = matches.filter((m) => m.similarity >= minSimilarity);
  const lags = kept.map((m) => m.lagMs / 1000);
  return {
    matched: matches.length,
    confident: kept.length,
    medianLagS: pct(lags, 50),
    p10LagS: pct(lags, 10),
    p90LagS: pct(lags, 90),
    meanSimilarity:
      kept.reduce((a, m) => a + m.similarity, 0) / (kept.length || 1),
  };
}
