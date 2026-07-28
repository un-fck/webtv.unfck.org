/**
 * Emit the scored reference for every session, plus a CONSERVATION LEDGER.
 *
 * The ledger's denominator is `wc -w` of the RAW `en.txt` — the source file —
 * never the normalizer's own output. That is the whole point: a coverage check
 * whose denominator comes from the same pass as the numerator cannot see a drop.
 *
 * For each session we account for every raw word as either KEPT (in the scored
 * reference) or DELETED, and every deleted span is written out verbatim so a
 * human or a subagent can judge whether it was genuinely non-spoken. A deletion
 * we cannot classify is reported as residue, not rounded away.
 *
 * Run before and after a normalizer change to see exactly what moved.
 */
import fs from "fs";
import path from "path";
import { normalizeGroundTruth } from "../../metrics/ground-truth-normalizer";
import { ALL } from "./sessions";

const GT_DIR = "/Users/david/UN/transcripts/eval/results/ground-truth";
const OUT = "/Volumes/SSDAStorage/un-en-bakeoff/references";

const label = process.argv.find((a) => a.startsWith("--label="))?.split("=")[1] || "current";

fs.mkdirSync(path.join(OUT, label), { recursive: true });

function words(s: string) {
  return s.split(/\s+/).filter(Boolean);
}

/**
 * Recover the deleted words exactly.
 *
 * The normalizer is only ever supposed to DELETE, so the normalized word
 * sequence must be a SUBSEQUENCE of the raw word sequence. A greedy two-pointer
 * walk finds the alignment and therefore the exact set of dropped raw words —
 * residue is then 0 by construction, and any failure to align is itself the
 * finding (it would mean the normalizer is rewriting text, not just removing
 * it, which nothing downstream expects).
 */
function deletedSpans(raw: string, norm: string): { spans: string[]; deletedWords: number; isSubsequence: boolean } {
  // Deleting mid-line text can leave orphan punctuation ("… it should . Corrected
  // records …"), which becomes its own whitespace-delimited token that never
  // existed in the raw. That is a tokenization artifact of deletion, not a
  // rewrite, but it desyncs a strict subsequence walk permanently. Compare on
  // content tokens only, so the check tests what it is meant to test: that no
  // spoken WORD was invented or reordered.
  const isContent = (w: string) => /[\p{L}\p{N}]/u.test(w);
  const R = words(raw).filter(isContent);
  const N = words(norm).filter(isContent);
  const spans: string[] = [];
  let run: string[] = [];
  let i = 0;
  let j = 0;
  while (i < R.length) {
    if (j < N.length && R[i] === N[j]) {
      if (run.length) {
        spans.push(run.join(" "));
        run = [];
      }
      j++;
    } else {
      run.push(R[i]);
    }
    i++;
  }
  if (run.length) spans.push(run.join(" "));
  const deletedWords = spans.reduce((n, sp) => n + words(sp).length, 0);
  // j should have consumed the whole normalized sequence
  return { spans, deletedWords, isSubsequence: j === N.length };
}

const rows: any[] = [];
for (const s of ALL) {
  const p = path.join(GT_DIR, s.dir, "en.txt");
  if (!fs.existsSync(p)) {
    console.log(`${s.dir}: NO en.txt — skipped`);
    continue;
  }
  const raw = fs.readFileSync(p, "utf-8");
  const norm = normalizeGroundTruth(raw, "en");
  const isContent = (w: string) => /[\p{L}\p{N}]/u.test(w);
  const rawW = words(raw).filter(isContent).length;
  const normW = words(norm).filter(isContent).length;
  const { spans, deletedWords: deletedW, isSubsequence } = deletedSpans(raw, norm);

  fs.writeFileSync(path.join(OUT, label, `${s.dir}.ref.txt`), norm);
  fs.writeFileSync(
    path.join(OUT, label, `${s.dir}.deleted.txt`),
    spans.map((sp, i) => `--- span ${i + 1} (${words(sp).length} words) ---\n${sp}`).join("\n\n"),
  );

  // Conservation: raw = kept + deleted + residue. Residue must be explained,
  // never rounded to zero.
  const residue = rawW - normW - deletedW;
  rows.push({
    dir: s.dir,
    symbol: s.symbol,
    rawWords: rawW,
    keptWords: normW,
    deletedWords: deletedW,
    residueWords: residue,
    deletedPct: (100 * deletedW) / rawW,
    spans: spans.length,
    isSubsequence,
    audioMin: s.audioSeconds / 60,
    keptWpm: normW / (s.audioSeconds / 60),
  });
}

fs.writeFileSync(path.join(OUT, `${label}.ledger.json`), JSON.stringify(rows, null, 2));

console.log(
  `\n${"session".padEnd(14)} ${"raw".padStart(7)} ${"kept".padStart(7)} ${"del".padStart(7)} ${"del%".padStart(6)} ${"resid".padStart(6)} ${"kept wpm".padStart(9)}`,
);
for (const r of rows) {
  const flag = !r.isSubsequence ? "  <<< NOT A SUBSEQUENCE" : r.residueWords !== 0 ? "  <<< RESIDUE" : r.keptWpm > 200 ? "  <<< impossible wpm" : "";
  console.log(
    `${r.dir.padEnd(14)} ${String(r.rawWords).padStart(7)} ${String(r.keptWords).padStart(7)} ${String(r.deletedWords).padStart(7)} ${r.deletedPct.toFixed(1).padStart(6)} ${String(r.residueWords).padStart(6)} ${r.keptWpm.toFixed(0).padStart(9)}${flag}`,
  );
}
const tot = rows.reduce(
  (a, r) => ({ raw: a.raw + r.rawWords, kept: a.kept + r.keptWords, del: a.del + r.deletedWords, res: a.res + r.residueWords }),
  { raw: 0, kept: 0, del: 0, res: 0 },
);
console.log(
  `\nTOTAL raw=${tot.raw} kept=${tot.kept} deleted=${tot.del} (${((100 * tot.del) / tot.raw).toFixed(2)}%) residue=${tot.res}`,
);
