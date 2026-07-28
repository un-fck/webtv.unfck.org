/**
 * Export the three-way comparison packets: PV ground truth, AssemblyAI (A1) and
 * azure-llm-speech (A2), for one session, as plain text a reading agent can work
 * through end to end.
 *
 * The three-way diff is done by READING, not by a diff tool, because the thing
 * we most need to catch is invisible to any string comparison: §15.5a found
 * azure-llm rendering "UN80" as "the UNAT initiative" ~50 times. A diff reports
 * that as a token substitution; only a reader knows UNAT is a real UN body (the
 * Appeals Tribunal) and that putting it in front of a reader is a different and
 * worse class of error than a garbled word.
 *
 * Each packet carries the exact word counts so the reading agent's coverage can
 * be checked against a denominator that comes from this file, not from its own
 * report.
 */
import fs from "fs";
import path from "path";
import { ALL } from "./sessions";

const OUT = "/Volumes/SSDAStorage/un-en-bakeoff";
const REFS = path.join(OUT, "references", "AFTER-fix");
const RAW = path.join(OUT, "raw");
const PACKETS = path.join(OUT, "threeway");

fs.mkdirSync(PACKETS, { recursive: true });

function words(s: string) {
  return s.split(/\s+/).filter(Boolean).length;
}

function textFromRaw(armFile: string, vendor: "assemblyai" | "azure"): string | null {
  if (!fs.existsSync(armFile)) return null;
  const j = JSON.parse(fs.readFileSync(armFile, "utf-8"));
  if (vendor === "assemblyai") {
    // Prefer utterance-level so speaker turns are visible to the reader.
    if (Array.isArray(j.utterances) && j.utterances.length)
      return j.utterances.map((u: any) => `[spk ${u.speaker}] ${u.text}`).join("\n");
    return j.text || "";
  }
  if (Array.isArray(j.phrases) && j.phrases.length) {
    const out: string[] = [];
    let last = "";
    for (const p of j.phrases) {
      const s = String(p.speaker ?? "1");
      if (s !== last) {
        out.push(`[spk ${s}] ${p.text}`);
        last = s;
      } else {
        out[out.length - 1] += " " + p.text;
      }
    }
    return out.join("\n");
  }
  return (j.combinedPhrases || []).map((c: any) => c.text).join("\n");
}

const only = process.argv.find((a) => a.startsWith("--sessions="))?.split("=")[1];
const wanted = only ? only.split(",") : null;

const index: any[] = [];
for (const s of ALL) {
  if (wanted && !wanted.includes(s.dir)) continue;
  const refPath = path.join(REFS, `${s.dir}.ref.txt`);
  if (!fs.existsSync(refPath)) continue;
  const ref = fs.readFileSync(refPath, "utf-8").replace(/\n{3,}/g, "\n\n").trim();
  const aai = textFromRaw(path.join(RAW, `A1__${s.dir}__p1.json`), "assemblyai");
  const azu = textFromRaw(path.join(RAW, `A2__${s.dir}__p1.json`), "azure");
  if (!aai || !azu) {
    console.log(`${s.dir}: missing arm output (aai=${!!aai} azure=${!!azu}) — skipped`);
    continue;
  }

  const packet =
    `THREE-WAY COMPARISON PACKET — ${s.symbol} (English track)\n` +
    `audio duration: ${(s.audioSeconds / 60).toFixed(1)} minutes\n` +
    `word counts — GROUND TRUTH (PV): ${words(ref)} | ASSEMBLYAI: ${words(aai)} | AZURE-LLM: ${words(azu)}\n` +
    `${"=".repeat(100)}\n\n` +
    `########## A. GROUND TRUTH — official UN verbatim record (PV), non-spoken content removed ##########\n\n${ref}\n\n` +
    `########## B. ASSEMBLYAI Universal-3.5 Pro ##########\n\n${aai}\n\n` +
    `########## C. AZURE-LLM-SPEECH (enhanced mode, unnamed default model) ##########\n\n${azu}\n`;

  const p = path.join(PACKETS, `${s.dir}.packet.txt`);
  fs.writeFileSync(p, packet);
  index.push({
    dir: s.dir,
    symbol: s.symbol,
    audioMin: +(s.audioSeconds / 60).toFixed(1),
    refWords: words(ref),
    aaiWords: words(aai),
    azuWords: words(azu),
    packet: p,
  });
  console.log(
    `${s.dir.padEnd(14)} ref=${String(words(ref)).padStart(6)} aai=${String(words(aai)).padStart(6)} azure=${String(words(azu)).padStart(6)}  -> ${path.basename(p)}`,
  );
}

fs.writeFileSync(path.join(PACKETS, "index.json"), JSON.stringify(index, null, 2));
console.log(`\n${index.length} packets written to ${PACKETS}`);
