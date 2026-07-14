/**
 * Paired per-session WER analysis with bootstrap CIs.
 *
 * Every headline WER in SYNTHESIS §2/§11.2 rests on a single 9-minute meeting.
 * That is not enough to move a routing slot. This scores each arm against a
 * named incumbent on the SAME sessions and bootstraps a 95% CI over the
 * per-session paired deltas, so "better" means "better than chance", not
 * "better on one meeting".
 *
 * Absolute WER against a professionally-edited verbatim record runs 15–40% even
 * for excellent transcription (fillers removed, grammar cleaned, procedural
 * speech rendered as stage directions). Only the *paired deltas* are meaningful.
 *
 *   npx tsx eval/analysis/paired-wer.ts [--incumbent=<provider>] [--lang=en]
 */
import fs from "fs";
import path from "path";

const SUMMARY = path.join(__dirname, "..", "results", "summary.json");

interface Row {
  symbol: string;
  language: string;
  provider: string;
  wer: number;
  normalizedWer: number;
  cer: number;
  durationMs?: number;
  elapsedMs?: number;
}

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const INCUMBENT = arg("incumbent", "assemblyai-universal-3-5-pro");
const LANG = arg("lang", "en");

/** Percentile bootstrap over the paired per-session deltas. */
function bootstrapCI(
  deltas: number[],
  iters = 10000,
): { lo: number; hi: number } {
  if (deltas.length === 0) return { lo: NaN, hi: NaN };
  // Deterministic LCG — a fixed seed keeps the reported CI reproducible.
  let seed = 42;
  const rand = () =>
    (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const means: number[] = [];
  for (let i = 0; i < iters; i++) {
    let sum = 0;
    for (let j = 0; j < deltas.length; j++) {
      sum += deltas[Math.floor(rand() * deltas.length)];
    }
    means.push(sum / deltas.length);
  }
  means.sort((a, b) => a - b);
  return {
    lo: means[Math.floor(iters * 0.025)],
    hi: means[Math.floor(iters * 0.975)],
  };
}

const rows: Row[] = JSON.parse(fs.readFileSync(SUMMARY, "utf-8"));
const inLang = rows.filter((r) => r.language === LANG);

const providers = [...new Set(inLang.map((r) => r.provider))].sort();
const bySession = new Map<string, Map<string, Row>>();
for (const r of inLang) {
  if (!bySession.has(r.symbol)) bySession.set(r.symbol, new Map());
  bySession.get(r.symbol)!.set(r.provider, r);
}

// Only sessions where EVERY arm produced a result — otherwise the pairing is
// broken and the means are computed over different meetings.
let complete = [...bySession.entries()].filter(
  ([, m]) => providers.every((p) => m.has(p)) && m.has(INCUMBENT),
);
const dropped = bySession.size - complete.length;

// Sessions whose verbatim record does not correspond to the video (resumed /
// continued meetings, re-cut recordings). Every arm fails them identically, so
// they contribute ~zero paired deltas and only dilute the comparison.
//
// This is a property of the SESSION, not the language, so it must be a fixed
// list — NOT a WER threshold. A threshold calibrated on English (where good
// transcription lands at 15–40%) is meaningless for Arabic and Chinese, whose
// WER against an edited PV is intrinsically 80–100% for every provider
// (SYNTHESIS §2) because of morphology, orthography and CJK scoring. An 85%
// floor silently excluded 13/15 Arabic sessions and all 20 Chinese ones.
//
// Derived from the English sweep, where the absolute scale is interpretable:
// every arm scored >90% on these four and nowhere near that elsewhere.
const MISMATCHED_SESSIONS = new Set([
  "S/PV.9606",
  "S/PV.9614",
  "S/PV.9686",
  "S/PV.9732",
]);
const mismatched = complete.filter(([sym]) => MISMATCHED_SESSIONS.has(sym));
if (!process.argv.includes("--keep-mismatched")) {
  complete = complete.filter((c) => !mismatched.includes(c));
}

console.log(`\nPaired WER — language: ${LANG}, incumbent: ${INCUMBENT}`);
console.log(
  `Sessions: ${complete.length} scored across all ${providers.length} arms` +
    (dropped ? `  (${dropped} dropped — an arm was missing)` : ""),
);
if (mismatched.length) {
  console.log(
    `Excluded ${mismatched.length} PV↔video-mismatch session(s) (record does not match the recording): ` +
      `${mismatched.map(([s]) => s).join(", ")}`,
  );
}
if (!providers.includes(INCUMBENT)) {
  console.error(
    `\nIncumbent "${INCUMBENT}" not found. Have: ${providers.join(", ")}`,
  );
  process.exit(1);
}

const pct = (x: number) => (x * 100).toFixed(1);
const stats = providers.map((p) => {
  const mine = complete.map(([, m]) => m.get(p)!.normalizedWer);
  const theirs = complete.map(([, m]) => m.get(INCUMBENT)!.normalizedWer);
  const deltas = mine.map((v, i) => v - theirs[i]);
  const mean = mine.reduce((a, b) => a + b, 0) / mine.length;
  const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const ci = bootstrapCI(deltas);
  const wins = deltas.filter((d) => d < 0).length;
  return { p, mean, meanDelta, ci, wins, n: deltas.length };
});
stats.sort((a, b) => a.mean - b.mean);

console.log(
  `\n${"arm".padEnd(30)}${"mean WER".padStart(9)}${"Δ vs inc.".padStart(11)}${"95% CI of Δ".padStart(20)}${"wins".padStart(8)}   verdict`,
);
console.log("-".repeat(96));
for (const s of stats) {
  const isInc = s.p === INCUMBENT;
  let verdict: string;
  if (isInc) verdict = "— incumbent —";
  else if (s.ci.hi < 0) verdict = "BETTER (CI excludes 0)";
  else if (s.ci.lo > 0) verdict = "WORSE (CI excludes 0)";
  else verdict = "no significant difference";
  console.log(
    s.p.padEnd(30) +
      `${pct(s.mean)}%`.padStart(9) +
      (isInc
        ? "—".padStart(11)
        : `${s.meanDelta >= 0 ? "+" : ""}${pct(s.meanDelta)}`.padStart(11)) +
      (isInc
        ? "—".padStart(20)
        : `[${pct(s.ci.lo)}, ${pct(s.ci.hi)}]`.padStart(20)) +
      (isInc ? "—".padStart(8) : `${s.wins}/${s.n}`.padStart(8)) +
      `   ${verdict}`,
  );
}

console.log(`\nPer-session normalized WER (%):\n`);
const hdr =
  "session".padEnd(16) +
  providers.map((p) => p.slice(0, 13).padStart(15)).join("");
console.log(hdr);
console.log("-".repeat(hdr.length));
for (const [sym, m] of complete) {
  const best = Math.min(...providers.map((p) => m.get(p)!.normalizedWer));
  console.log(
    sym.padEnd(16) +
      providers
        .map((p) => {
          const v = m.get(p)!.normalizedWer;
          const s = `${pct(v)}${v === best ? "*" : " "}`;
          return s.padStart(15);
        })
        .join(""),
  );
}
console.log("\n* = best on that session");
