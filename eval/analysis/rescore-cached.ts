/**
 * Rebuild `eval/results/summary.json` from cached raw transcripts + cached
 * ground truth. Pure recomputation — **no network, no audio download**.
 *
 * Needed when a sweep is interrupted: `run.ts` only merges rows into
 * summary.json as sessions complete, so a killed run leaves raw transcripts on
 * disk with no metrics. `--cached-only` in run.ts is not a substitute — it still
 * walks every session and downloads audio for the ones it hasn't done yet.
 *
 *   npx tsx eval/analysis/rescore-cached.ts
 */
import fs from "fs";
import path from "path";
import { computeMetrics } from "../metrics";

const RESULTS = path.join(__dirname, "..", "results");
const RAW = path.join(RESULTS, "raw");
const GT = path.join(RESULTS, "ground-truth");
const SUMMARY = path.join(RESULTS, "summary.json");

interface Row {
  symbol: string;
  language: string;
  provider: string;
  wer: number;
  normalizedWer: number;
  cer: number;
  normalizedCer: number;
  substitutions: number;
  insertions: number;
  deletions: number;
  refLength: number;
  hypLength: number;
  durationMs: number;
  timestamp: string;
}

const rows: Row[] = [];
let noGt = 0;

for (const dir of fs.readdirSync(RAW)) {
  const symbolDir = path.join(RAW, dir);
  if (!fs.statSync(symbolDir).isDirectory()) continue;
  // Directory name is the symbol with "/" replaced by "_".
  for (const file of fs.readdirSync(symbolDir)) {
    const m = file.match(/^(.+)_([a-z]{2}|floor)\.json$/);
    if (!m) continue;
    const [, provider, language] = m;

    const gtPath = path.join(GT, dir, `${language}.txt`);
    if (!fs.existsSync(gtPath)) {
      noGt++;
      continue;
    }
    const gt = fs.readFileSync(gtPath, "utf-8");

    let transcript: { fullText?: string; durationMs?: number };
    try {
      transcript = JSON.parse(
        fs.readFileSync(path.join(symbolDir, file), "utf-8"),
      );
    } catch {
      console.warn(`  unreadable: ${dir}/${file}`);
      continue;
    }
    const hyp = transcript.fullText ?? "";
    if (!hyp) {
      console.warn(`  empty transcript: ${dir}/${file}`);
      continue;
    }

    const metrics = computeMetrics(gt, hyp, language);
    rows.push({
      // Restore the "/" the directory name flattened. Symbols are either
      // S/PV.9826-style or bare labels (manual-eval corpus) with no "_".
      symbol: dir.includes("_") ? dir.replace(/_/g, "/") : dir,
      language,
      provider,
      wer: metrics.wer.wer,
      normalizedWer: metrics.normalizedWer.wer,
      cer: metrics.wer.cer,
      normalizedCer: metrics.normalizedWer.cer,
      substitutions: metrics.normalizedWer.substitutions,
      insertions: metrics.normalizedWer.insertions,
      deletions: metrics.normalizedWer.deletions,
      refLength: metrics.normalizedWer.refLength,
      hypLength: hyp.length,
      durationMs: transcript.durationMs ?? 0,
      timestamp: new Date(0).toISOString(),
    });
  }
}

fs.writeFileSync(SUMMARY, JSON.stringify(rows, null, 2));

const byLang = new Map<string, Map<string, number>>();
for (const r of rows) {
  if (!byLang.has(r.language)) byLang.set(r.language, new Map());
  const m = byLang.get(r.language)!;
  m.set(r.provider, (m.get(r.provider) ?? 0) + 1);
}
console.log(`Rescored ${rows.length} rows into summary.json`);
if (noGt) console.log(`(${noGt} raw transcripts skipped — no ground truth)`);
for (const [lang, provs] of [...byLang].sort()) {
  console.log(`\n  ${lang}:`);
  for (const [p, n] of [...provs].sort())
    console.log(`    ${p.padEnd(30)} ${n}`);
}
