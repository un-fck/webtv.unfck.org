/**
 * The session manifest for the English bake-off. FIXED BEFORE ANY RUN — this
 * file is the pre-registration. Do not edit it in response to results.
 *
 * `headline` — the 17 sessions the verdict is computed on.
 * `diagnostic` — sessions excluded from the verdict, run anyway, for two reasons:
 *
 *   - 9686 / 9732 were excluded by SYNTHESIS §14.1 as "PV↔video mismatch" on the
 *     basis that every arm scored >85% WER there. But an independent source-side
 *     check disagrees for 9686: ground-truth words ÷ audio minutes = 122 wpm,
 *     a completely normal speaking rate. An exclusion is a claim like any other,
 *     so it gets checked rather than inherited. (9732 at 193 wpm is genuinely
 *     elevated and probably is a mismatch.)
 *
 *   - 9606 / 9614 are KNOWN-BAD inputs — 958 and 593 wpm, physically impossible,
 *     so the PV certainly covers more than the recording. They are run as a
 *     NEGATIVE CONTROL on the whole measurement chain: if the scorer does not
 *     report these as catastrophic, the scorer is not detecting mismatch and no
 *     other number on the page can be trusted.
 */
export interface Session {
  symbol: string;
  dir: string; // ground-truth dir name / audio file stem
  audioSeconds: number;
  gtWords: number;
  wpm: number;
}

export const HEADLINE: Session[] = [
  { symbol: "S/PV.9675", dir: "S_PV.9675", audioSeconds: 81.270204, gtWords: 94, wpm: 69 },
  { symbol: "S/PV.10100", dir: "S_PV.10100", audioSeconds: 274.366984, gtWords: 434, wpm: 95 },
  { symbol: "S/PV.10054", dir: "S_PV.10054", audioSeconds: 348.786939, gtWords: 653, wpm: 112 },
  { symbol: "S/PV.10069", dir: "S_PV.10069", audioSeconds: 473.640635, gtWords: 634, wpm: 80 },
  { symbol: "S/PV.10156", dir: "S_PV.10156", audioSeconds: 551.891882, gtWords: 951, wpm: 103 },
  { symbol: "S/PV.9826", dir: "S_PV.9826", audioSeconds: 600.932426, gtWords: 714, wpm: 71 },
  { symbol: "S/PV.9722", dir: "S_PV.9722", audioSeconds: 785.809705, gtWords: 1311, wpm: 100 },
  { symbol: "S/PV.9642", dir: "S_PV.9642", audioSeconds: 875.206871, gtWords: 1648, wpm: 113 },
  { symbol: "S/PV.9649", dir: "S_PV.9649", audioSeconds: 1173.071769, gtWords: 2111, wpm: 108 },
  { symbol: "A/78/PV.101", dir: "A_78_PV.101", audioSeconds: 3628.60619, gtWords: 7323, wpm: 121 },
  { symbol: "S/PV.9532", dir: "S_PV.9532", audioSeconds: 3731.353832, gtWords: 7612, wpm: 122 },
  { symbol: "S/PV.9718", dir: "S_PV.9718", audioSeconds: 4896.624036, gtWords: 9445, wpm: 116 },
  { symbol: "S/PV.9693", dir: "S_PV.9693", audioSeconds: 5977.954762, gtWords: 13030, wpm: 131 },
  { symbol: "S/PV.9578", dir: "S_PV.9578", audioSeconds: 6835.44381, gtWords: 14695, wpm: 129 },
  { symbol: "S/PV.9667", dir: "S_PV.9667", audioSeconds: 7186.343764, gtWords: 13766, wpm: 115 },
  { symbol: "S/PV.9816", dir: "S_PV.9816", audioSeconds: 8001.039093, gtWords: 16639, wpm: 125 },
  { symbol: "S/PV.9596", dir: "S_PV.9596", audioSeconds: 9201.511088, gtWords: 18019, wpm: 117 },
];

export const DIAGNOSTIC: Session[] = [
  // re-examined exclusions
  { symbol: "S/PV.9686", dir: "S_PV.9686", audioSeconds: 11490.626757, gtWords: 23387, wpm: 122 },
  { symbol: "S/PV.9732", dir: "S_PV.9732", audioSeconds: 6326.950023, gtWords: 20316, wpm: 193 },
  // negative controls — physically impossible speaking rates
  { symbol: "S/PV.9606", dir: "S_PV.9606", audioSeconds: 1320.91356, gtWords: 21085, wpm: 958 },
  { symbol: "S/PV.9614", dir: "S_PV.9614", audioSeconds: 2136.56093, gtWords: 21100, wpm: 593 },
];


/**
 * The §9 anecdotal battery — no PV, so never scored by WER. These carry
 * pre-registered traps that WER cannot see: the Kanem hallucination gate
 * (§14.2), the UN80 entity trap (§15.5a), and the accented-English probes
 * (§14.4). Run separately via --set=battery.
 */
export const BATTERY: Session[] = [
  { symbol: "UN80-Apr06-keita", dir: "UN80-Apr06-keita", audioSeconds: 10273.668934, gtWords: 0, wpm: 0 },
  { symbol: "UN80-Apr29-timestamps", dir: "UN80-Apr29-timestamps", audioSeconds: 10264.055873, gtWords: 0, wpm: 0 },
  { symbol: "Nebenzia-Starobelsk", dir: "Nebenzia-Starobelsk", audioSeconds: 2399.294694, gtWords: 0, wpm: 0 },
];

export const ALL = [...HEADLINE, ...DIAGNOSTIC, ...BATTERY];

/**
 * S/PV.10153 has audio and a ground-truth directory but NO `en.txt` — it is the
 * multilingual floor session. It is not in either list. Recording the reason so
 * a later reader does not think it was silently dropped.
 */
export const OMITTED_NO_GT = ["S/PV.10153"];
