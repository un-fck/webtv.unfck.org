/**
 * The SAME negative controls as `negative-controls.py`, run through the SHIPPED
 * TypeScript scorer (`eval/metrics/wer.ts` -> chunkedEditDistance).
 *
 * Purpose: prove the controls have teeth. A control that has never been shown to
 * fail is absent, not passing. If the new Python scorer passes all 22 and the
 * shipped one fails several, then (a) the controls discriminate, and (b) the
 * shipped scorer is measuring something other than WER on long inputs — which is
 * the claim this whole exercise rests on.
 */
import fs from "fs";
import path from "path";
import { computeWER } from "../../metrics/wer";
import { normalizeForWER } from "../../metrics/text-normalizer";

const REFS = "/Volumes/SSDAStorage/un-en-bakeoff/references/AFTER-fix";
const CASES = [
  ["S_PV.9816", "large, 16k words — chunking ACTIVE"],
  ["S_PV.10156", "small, 928 words — chunking inactive"],
];

interface Row {
  name: string;
  got: number;
  lo: number;
  hi: number;
  ok: boolean;
  note: string;
}
const rows: Row[] = [];
function check(name: string, got: number, lo: number, hi: number, note = "") {
  rows.push({ name, got, lo, hi, ok: got >= lo && got <= hi, note });
}

// Deterministic PRNG so the uniform-deletion control is reproducible.
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

for (const [sess, desc] of CASES) {
  const refText = fs.readFileSync(path.join(REFS, `${sess}.ref.txt`), "utf-8");
  const ref = normalizeForWER(refText, "en");
  const refW = ref.split(/\s+/).filter(Boolean);
  const n = refW.length;
  const J = (a: string[]) => a.join(" ");
  const wer = (hyp: string) => computeWER(ref, hyp).wer;

  check(`${sess}/identity`, wer(ref), 0, 0, "must be exactly 0");
  check(`${sess}/empty-hyp`, wer(""), 1, 1, "all deletions");

  const rnd = mulberry32(12345);
  check(`${sess}/uniform-delete-30%`, wer(J(refW.filter(() => rnd() > 0.3))), 0.27, 0.33, "old design's control");

  const cut = Math.floor(n * 0.3);
  check(`${sess}/contiguous-delete-30%-front`, wer(J(refW.slice(cut))), 0.29, 0.31, "true WER is 0.30");
  check(`${sess}/contiguous-delete-30%-back`, wer(J(refW.slice(0, n - cut))), 0.29, 0.31, "true WER is 0.30");

  const cut10 = Math.floor(n * 0.1);
  check(`${sess}/missing-first-10%`, wer(J(refW.slice(cut10))), 0.095, 0.105, "true WER is 0.10");

  const NPRE = 200;
  const expect = NPRE / n;
  check(
    `${sess}/prepend-${NPRE}`,
    wer(J([...Array(NPRE).fill("prepended"), ...refW])),
    expect * 0.97,
    expect * 1.03,
    `must be exactly ${expect.toFixed(4)}`,
  );

  check(`${sess}/duplicated-hyp`, wer(J([...refW, ...refW])), 0.95, 1.05, "one full insertion set");
}

console.log("\n" + "=".repeat(104));
console.log("SHIPPED TypeScript scorer (eval/metrics/wer.ts, chunkedEditDistance)");
console.log("=".repeat(104));
console.log(`${"control".padEnd(46)} ${"got".padStart(9)} ${"expected range".padStart(22)}   verdict`);
console.log("=".repeat(104));
for (const r of rows) {
  console.log(
    `${r.name.padEnd(46)} ${(r.got * 100).toFixed(3).padStart(8)}% [${(r.lo * 100).toFixed(2).padStart(7)}%, ${(r.hi * 100).toFixed(2).padStart(7)}%]   ${r.ok ? "PASS" : "**FAIL**"}   ${r.note}`,
  );
}
const failed = rows.filter((r) => !r.ok);
console.log("=".repeat(104));
console.log(`\n${failed.length} of ${rows.length} controls FAILED on the shipped scorer: ${failed.map((f) => f.name).join(", ")}`);
