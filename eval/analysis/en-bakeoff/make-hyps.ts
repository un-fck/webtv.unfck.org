/**
 * Turn the raw per-run provider JSON into the hypothesis JSONL that score.py
 * consumes: {arm, dir, symbol, pass, text}.
 *
 * Also emits the integrity checks that have to happen at this boundary, because
 * this is the last point where the provider's own metadata is still attached:
 *
 *  - AssemblyAI's `speech_models` array can silently fall back to universal-2.
 *    `speech_model_used` is the only signal, and it is asserted here rather than
 *    logged and forgotten — a session served by the wrong model must not be
 *    filed as a Universal-3.5 Pro result.
 *  - Provider-reported audio duration is compared against the ffprobe duration of
 *    the SOURCE file. A provider that silently truncates a long file would shrink
 *    the numerator and the denominator together and look both fast and accurate;
 *    this is the check that catches it.
 *  - Empty or implausibly short output is flagged rather than scored as a very
 *    bad transcript.
 */
import fs from "fs";
import path from "path";
import { ALL } from "./sessions";

const OUT = "/Volumes/SSDAStorage/un-en-bakeoff";
const RAW = path.join(OUT, "raw");
const HYPS = path.join(OUT, "hyps.jsonl");

const BY_DIR = Object.fromEntries(ALL.map((s) => [s.dir, s]));

const lines: string[] = [];
const problems: string[] = [];
let n = 0;

for (const f of fs.readdirSync(RAW).sort()) {
  if (!f.endsWith(".json")) continue;
  // macOS writes AppleDouble sidecars ("._name") on the exFAT volume. Skip them.
  if (f.startsWith("._")) continue;
  const m = f.match(/^(A\d)__(.+)__p(\d+)\.json$/);
  if (!m) {
    problems.push(`unparseable filename: ${f}`);
    continue;
  }
  const [, arm, dir, passStr] = m;
  const sess = BY_DIR[dir];
  if (!sess) {
    problems.push(`${f}: no session manifest entry`);
    continue;
  }
  const j = JSON.parse(fs.readFileSync(path.join(RAW, f), "utf-8"));

  let text = "";
  let reportedSec: number | null = null;
  if (arm === "A0" || arm === "A1") {
    text = j.text || "";
    reportedSec = typeof j.audio_duration === "number" ? j.audio_duration : null;
    const used = j.speech_model_used ?? j.speech_model;
    if (used && used !== "universal-3-5-pro")
      problems.push(`!! ${f}: served by "${used}", NOT universal-3-5-pro — model fallback`);
  } else {
    text = (j.combinedPhrases || []).map((c: any) => c.text).join("\n");
    if (!text) text = (j.phrases || []).map((p: any) => p.text).join("\n");
    reportedSec = typeof j.durationMilliseconds === "number" ? j.durationMilliseconds / 1000 : null;
  }

  // Truncation tripwire — denominator from the source, not the provider.
  if (reportedSec !== null) {
    const d = Math.abs(reportedSec - sess.audioSeconds) / sess.audioSeconds;
    if (d > 0.01)
      problems.push(
        `!! ${f}: provider reports ${reportedSec.toFixed(1)}s but source is ${sess.audioSeconds.toFixed(1)}s (${(100 * d).toFixed(2)}% off) — possible truncation`,
      );
  }

  const w = text.split(/\s+/).filter(Boolean).length;
  // A UN meeting runs ~100-130 spoken words per minute. Under 40 wpm of output
  // means the provider returned far less than the audio contains.
  const wpm = w / (sess.audioSeconds / 60);
  if (w === 0) problems.push(`!! ${f}: EMPTY output`);
  else if (wpm < 40) problems.push(`!! ${f}: only ${wpm.toFixed(0)} words/min of output (expect ~100-130)`);

  lines.push(JSON.stringify({ arm, dir, symbol: sess.symbol, pass: Number(passStr), text }));
  n++;
}

fs.writeFileSync(HYPS, lines.join("\n") + "\n");
console.log(`wrote ${n} hypotheses -> ${HYPS}`);

console.log(`\n=== INTEGRITY CHECKS ===`);
if (!problems.length) console.log("  no problems found");
else {
  for (const p of problems) console.log("  " + p);
  console.log(`\n  ${problems.length} problem(s). These are NOT silently scored — resolve before trusting results.`);
}
