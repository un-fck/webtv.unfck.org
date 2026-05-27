#!/usr/bin/env tsx
// Standalone WER for S/PV.10156 (the one video with a published PV record now),
// computed from cached provider outputs + cached ground truth — avoids the eval
// runner's summary.json write (which races with any in-flight eval run).
import fs from "fs";
import path from "path";
import { computeMetrics } from "../metrics";

const SYM = "S_PV.10156";
const GT_DIR = path.join(__dirname, "..", "results", "ground-truth", SYM);
const RAW_DIR = path.join(__dirname, "..", "results", "raw", SYM);
const LANGS = ["en", "fr", "es", "ar", "zh", "ru"];
const PROVIDERS = [
  "assemblyai",
  "assemblyai-u3-pro",
  "mistral",
  "gemini",
  "gemini-3.5-flash",
  "azure-openai",
  "alibaba",
  "fun-asr",
  "qwen3.5-omni-plus",
  "elevenlabs",
];

const rows: { provider: string; lang: string; nwer: number; cer: number }[] =
  [];
for (const lang of LANGS) {
  const gtPath = path.join(GT_DIR, `${lang}.txt`);
  if (!fs.existsSync(gtPath)) continue;
  const gt = fs.readFileSync(gtPath, "utf-8");
  for (const p of PROVIDERS) {
    const f = path.join(RAW_DIR, `${p}_${lang}.json`);
    if (!fs.existsSync(f)) continue;
    const hyp = JSON.parse(fs.readFileSync(f, "utf-8")).fullText || "";
    const m = computeMetrics(gt, hyp, lang);
    rows.push({
      provider: p,
      lang,
      nwer: m.normalizedWer.wer,
      cer: m.normalizedWer.cer,
    });
  }
}

// table: provider × lang (normalized WER %)
const provs = [...new Set(rows.map((r) => r.provider))];
const langs = [...new Set(rows.map((r) => r.lang))];
console.log("Normalized WER % — S/PV.10156\n");
console.log("provider".padEnd(20) + langs.map((l) => l.padStart(8)).join(""));
for (const p of provs) {
  let line = p.padEnd(20);
  for (const l of langs) {
    const r = rows.find((x) => x.provider === p && x.lang === l);
    line += (r ? (r.nwer * 100).toFixed(1) : "—").padStart(8);
  }
  console.log(line);
}
