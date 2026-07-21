/**
 * Model-free, high-precision lag measurement via translation-invariant anchors.
 *
 * The chunk DTW in align.ts establishes *which* passage corresponds to which,
 * but it cannot measure lag precisely: the two chunk grids have an arbitrary
 * phase offset, so a matched pair's start-time difference carries up to half a
 * chunk of boundary noise. On the null test (English floor → English track,
 * where the true lag is zero by construction) that noise spans ±4.5 s, which
 * is as large as the effect we are trying to measure.
 *
 * Anchors fix this. Some tokens survive interpretation *unchanged*:
 *
 *   - numbers — meeting numbers, years, dates, resolution and document symbols
 *   - country names — which the UN standardises, and which we already hold in
 *     all six official languages in lib/data/country-names.json
 *
 * When the floor says "10156" at 3.4 s and the English track says "10,156" at
 * 8.1 s, the lag is 4.7 s exactly, with no embedding model, no chunk grid, and
 * no interpolation in the answer. The DTW is still used — but only to predict
 * roughly where to look, so that the tenth mention of "Pakistan" is matched to
 * the tenth and not the third.
 */
import countryNames from "../../lib/data/country-names.json";
import type { Chunk, TimedToken } from "./extract";
import type { Match } from "./align";

export interface Anchor {
  value: string;
  time: number;
  kind: "number" | "country";
  surface: string;
  /** Timing uncertainty of this anchor in ms: 0 for a measured word timestamp,
   * half the enclosing segment for an interpolated one. */
  uncertaintyMs: number;
}

/** Arabic-Indic and Eastern Arabic-Indic digits → ASCII. */
const DIGIT_MAP: Record<string, string> = {};
for (let i = 0; i < 10; i++) {
  DIGIT_MAP[String.fromCharCode(0x0660 + i)] = String(i); // ٠-٩
  DIGIT_MAP[String.fromCharCode(0x06f0 + i)] = String(i); // ۰-۹
  DIGIT_MAP[String.fromCharCode(0xff10 + i)] = String(i); // ０-９
}

function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹０-９]/g, (c) => DIGIT_MAP[c] ?? c);
}

/**
 * Numeric value of a token, or null. Thousands separators vary by language
 * (10,156 / 10.156 / 10 156 / ١٠١٥٦), so strip them all and compare the digit
 * string. Two-digit and shorter numbers are far too common to be safe anchors.
 */
function numberValue(raw: string): string | null {
  const cleaned = normalizeDigits(raw).replace(/[^\d]/g, "");
  if (cleaned.length < 3) return null;
  // Strip leading zeros so "007" and "7" don't split into two anchor values.
  const v = cleaned.replace(/^0+(?=\d)/, "");
  return v.length >= 3 ? v : null;
}

interface CountryEntry {
  iso: string;
  /** Lowercased name split into tokens, per language. */
  tokens: string[];
  charForm: string;
}

/** Localized country names, indexed by language, longest-first. */
const COUNTRY_INDEX = new Map<string, CountryEntry[]>();
{
  const table = countryNames as Record<string, Record<string, string>>;
  for (const [iso, byLang] of Object.entries(table)) {
    for (const [lang, name] of Object.entries(byLang)) {
      if (!name) continue;
      const lower = name.toLowerCase();
      const entry: CountryEntry = {
        iso,
        tokens: lower.split(/\s+/).filter(Boolean),
        charForm: lower.replace(/\s+/g, ""),
      };
      if (!COUNTRY_INDEX.has(lang)) COUNTRY_INDEX.set(lang, []);
      COUNTRY_INDEX.get(lang)!.push(entry);
    }
  }
  for (const list of COUNTRY_INDEX.values())
    list.sort((a, b) => b.charForm.length - a.charForm.length);
}

/** Very short names collide with ordinary words ("Chad", "Chine"); require
 * enough length that a false hit is implausible. */
const MIN_COUNTRY_CHARS = 4;

/**
 * Extract anchors from a token stream.
 *
 * `langs` is the set of languages to look for country names in. For an
 * interpreted track that is just the track language; for the floor track it is
 * all six, because the floor switches language every few minutes.
 */
/** Half the enclosing segment for interpolated tokens; ~0 for measured ones. */
function uncertaintyOf(t: TimedToken): number {
  return t.interpolated ? (t.segMs ?? 0) / 2 : 0;
}

export function extractAnchors(
  tokens: TimedToken[],
  langs: string[],
): Anchor[] {
  const out: Anchor[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const v = numberValue(tokens[i].text);
    if (v)
      out.push({
        value: `n:${v}`,
        time: tokens[i].start,
        kind: "number",
        surface: tokens[i].text,
        uncertaintyMs: uncertaintyOf(tokens[i]),
      });
  }

  // Country names, matched as token n-grams. Chinese tokens are single
  // characters, so allow long grams; Latin names are at most ~6 tokens
  // ("United Kingdom of Great Britain and Northern Ireland" is longer, but the
  // short form is what gets spoken).
  const MAX_GRAM = 8;
  const lowered = tokens.map((t) => t.text.toLowerCase());
  const candidates = langs.flatMap((l) => COUNTRY_INDEX.get(l) ?? []);

  for (let i = 0; i < tokens.length; i++) {
    for (let n = Math.min(MAX_GRAM, tokens.length - i); n >= 1; n--) {
      const spaced = lowered.slice(i, i + n).join(" ");
      const joined = lowered.slice(i, i + n).join("");
      if (joined.length < MIN_COUNTRY_CHARS) continue;
      const hit = candidates.find(
        (c) => c.charForm === joined || c.tokens.join(" ") === spaced,
      );
      if (hit) {
        out.push({
          value: `c:${hit.iso}`,
          time: tokens[i].start,
          kind: "country",
          surface: spaced,
          uncertaintyMs: uncertaintyOf(tokens[i]),
        });
        i += n - 1; // don't emit overlapping country hits
        break;
      }
    }
  }

  return out.sort((a, b) => a.time - b.time);
}

/**
 * Piecewise-linear map from floor time to target time, built from the DTW
 * matches. Only used to predict where an anchor's counterpart should be, so
 * coarse is fine — it just has to be right to within the search window.
 */
function buildCoarseMap(matches: Match[], minSim: number) {
  const pts = matches
    .filter((m) => m.similarity >= minSim)
    .map((m) => [m.floorStart, m.targetStart] as const)
    .sort((a, b) => a[0] - b[0]);

  return (t: number): number | null => {
    if (pts.length < 2) return null;
    if (t <= pts[0][0]) return pts[0][1] + (t - pts[0][0]);
    if (t >= pts[pts.length - 1][0])
      return pts[pts.length - 1][1] + (t - pts[pts.length - 1][0]);
    let lo = 0;
    let hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid][0] <= t) lo = mid;
      else hi = mid;
    }
    const [f0, g0] = pts[lo];
    const [f1, g1] = pts[hi];
    const w = f1 === f0 ? 0 : (t - f0) / (f1 - f0);
    return g0 + w * (g1 - g0);
  };
}

export interface AnchorLag {
  value: string;
  kind: Anchor["kind"];
  surface: string;
  floorTime: number;
  targetTime: number;
  lagMs: number;
  sourceLanguage?: string;
  /** Combined timing uncertainty of the two paired anchors, in ms. */
  uncertaintyMs: number;
}

/**
 * Pair floor anchors with target anchors of identical value, monotonically,
 * inside a window around the DTW-predicted position.
 */
export function anchorLags(
  floorAnchors: Anchor[],
  targetAnchors: Anchor[],
  matches: Match[],
  floorChunks: Chunk[],
  opts: { windowMs?: number; minSim?: number; maxOccurrences?: number } = {},
): AnchorLag[] {
  const windowMs = opts.windowMs ?? 45_000;
  const coarse = buildCoarseMap(matches, opts.minSim ?? 0.5);
  if (!coarse) return [];

  // Language of the floor at a given time, from the chunk-level labels.
  const langAt = (t: number): string | undefined => {
    let best: Chunk | undefined;
    for (const c of floorChunks) {
      if (c.start <= t && t <= c.end) return c.language;
      if (c.start <= t) best = c;
    }
    return best?.language;
  };

  // Anchor values that recur constantly ("2026", "Council") are mispairing
  // hazards: the search window can easily contain the wrong occurrence. Values
  // that appear many times on either side carry little positional information,
  // so drop them rather than let them widen the distribution's tails.
  const maxOccurrences = opts.maxOccurrences ?? 6;
  const countBy = (list: Anchor[]) => {
    const m = new Map<string, number>();
    for (const a of list) m.set(a.value, (m.get(a.value) ?? 0) + 1);
    return m;
  };
  const fCount = countBy(floorAnchors);
  const tCount = countBy(targetAnchors);
  const usable = (v: string) =>
    (fCount.get(v) ?? 0) <= maxOccurrences &&
    (tCount.get(v) ?? 0) <= maxOccurrences;

  const F = floorAnchors.filter((a) => usable(a.value));
  const T = targetAnchors.filter((a) => usable(a.value));
  if (!F.length || !T.length) return [];

  // Monotone assignment by DP rather than greedy. Greedy commits to the first
  // locally-nearest candidate and can then be forced into a bad chain by the
  // monotonicity constraint; the DP maximises total match quality over the
  // whole sequence, which is what actually keeps the tenth "Pakistan" paired
  // with the tenth.
  const n = F.length;
  const m = T.length;
  const NEG = -1e9;
  // score[i][j] = best total score using F[0..i-1] and T[0..j-1].
  let prev = new Float64Array(m + 1);
  let cur = new Float64Array(m + 1);
  const back = new Uint8Array(n * (m + 1)); // 1 = pair, 2 = drop F, 3 = drop T

  const pairScore = (i: number, j: number): number => {
    if (F[i].value !== T[j].value) return NEG;
    const predicted = coarse(F[i].time);
    if (predicted == null) return NEG;
    const err = Math.abs(T[j].time - predicted);
    if (err > windowMs) return NEG;
    // Reward a match, penalised by how far it sits from the predicted spot.
    return 1 - err / windowMs;
  };

  for (let i = 0; i < n; i++) {
    const rowBase = i * (m + 1);
    cur[0] = prev[0];
    back[rowBase] = 2;
    for (let j = 1; j <= m; j++) {
      let best = prev[j]; // drop F[i]
      let mv = 2;
      if (cur[j - 1] > best) {
        best = cur[j - 1]; // drop T[j-1]
        mv = 3;
      }
      const ps = pairScore(i, j - 1);
      if (ps > NEG / 2 && prev[j - 1] + ps > best) {
        best = prev[j - 1] + ps;
        mv = 1;
      }
      cur[j] = best;
      back[rowBase + j] = mv;
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }

  const out: AnchorLag[] = [];
  let i = n - 1;
  let j = m;
  while (i >= 0 && j >= 0) {
    const mv = back[i * (m + 1) + j];
    if (mv === 1) {
      const fa = F[i];
      const ta = T[j - 1];
      out.push({
        value: fa.value,
        kind: fa.kind,
        surface: fa.surface,
        floorTime: fa.time,
        targetTime: ta.time,
        lagMs: ta.time - fa.time,
        sourceLanguage: langAt(fa.time),
        uncertaintyMs: fa.uncertaintyMs + ta.uncertaintyMs,
      });
      i--;
      j--;
    } else if (mv === 2) i--;
    else if (mv === 3) j--;
    else break;
  }

  return out.reverse();
}
