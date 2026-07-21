/**
 * THE EVALUATION MATRIX — the thing that makes results comparable.
 *
 * The first version of this benchmark ran each system on whatever session was
 * cheapest or already cached, then put the numbers in one table. That table
 * was meaningless. Session difficulty dominates everything: the *same* human
 * English interpretation scores 15.9%, 35.7% and 39.9% WER on our three
 * sessions. A 24-point swing between meetings is larger than any difference
 * between systems we could hope to detect, so a system evaluated on the easy
 * meeting beats a system evaluated on the hard one no matter how bad it is.
 *
 * So: every system runs on exactly the same cells, and every comparison is
 * made WITHIN a cell. A cell is (session, target language).
 *
 * A cell only qualifies if a HUMAN interpreted track exists for it — that is
 * the baseline the whole exercise is about. Cells without one can compare
 * machines to each other but cannot answer "better or worse than a human", so
 * they are excluded rather than quietly averaged in.
 */
import { STUDY_SESSIONS } from "../interp-lag/sessions";

export interface Cell {
  kalturaId: string;
  symbol: string;
  language: string;
  durationS: number;
  label: string;
}

/** Sessions carrying an official verbatim record we can score against. */
const SCORABLE = STUDY_SESSIONS.filter((s) => s.pvSymbol);

/** All (session, language) pairs that have a human interpreted track. */
export const ALL_CELLS: Cell[] = SCORABLE.flatMap((s) =>
  s.targets.map((language) => ({
    kalturaId: s.kalturaId,
    symbol: s.pvSymbol!,
    language,
    durationS: s.durationS,
    label: s.label,
  })),
);

/**
 * TIER 1 — the core matrix every system must complete.
 *
 * S/PV.10161 is the one session with five interpreted tracks (ar, en, es, fr,
 * zh), so a single 25-minute meeting yields a five-language fully-crossed
 * comparison. That breadth per audio-hour is what makes it the tier-1 choice:
 * the expensive vendors ($2.04–2.50/hr) can complete it for a few dollars,
 * where the full matrix would cost $16–20 each.
 */
export const TIER1_SYMBOL = "S/PV.10161";
export const TIER1_CELLS = ALL_CELLS.filter((c) => c.symbol === TIER1_SYMBOL);

/** TIER 2 — breadth, for systems cheap enough to run everywhere. */
export const TIER2_CELLS = ALL_CELLS.filter((c) => c.symbol !== TIER1_SYMBOL);

export function audioHours(cells: Cell[]): number {
  return cells.reduce((a, c) => a + c.durationS, 0) / 3600;
}

/** Wall clock for streaming at 1x, if all languages of a session run
 * concurrently: the sum of distinct session durations. */
export function wallClockMinutes(cells: Cell[]): number {
  const perSession = new Map<string, number>();
  for (const c of cells) perSession.set(c.kalturaId, c.durationS);
  return [...perSession.values()].reduce((a, b) => a + b, 0) / 60;
}
