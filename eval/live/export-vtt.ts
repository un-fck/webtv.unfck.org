#!/usr/bin/env tsx
/**
 * Export a benchmarked run as WebVTT, and dump a qualitative side-by-side.
 *
 * Two reasons this exists rather than being left as numbers in a table.
 *
 * First, WebVTT is what a captioning system is actually *for*. A scoring
 * harness that only ever emits chrF++ never demonstrates that the thing under
 * test could be attached to a player, and the survey found that caption-format
 * output (WebVTT/SRT/CEA-608) is precisely what separates a captioning product
 * from a raw ASR endpoint.
 *
 * Second, aggregate scores hide the failure *mode*. Two systems can both sit at
 * chrF++ 35 while one is mildly wrong throughout and the other emits fluent
 * nonsense. The side-by-side makes that visible in about ten seconds of
 * reading, which is how the Deepgram language-detection failure was actually
 * caught.
 *
 *   tsx eval/live/export-vtt.ts [--symbol=S/PV.10161] [--language=fr]
 */
import fs from "fs";
import path from "path";

const OUT = path.join(__dirname, "out");
const VTT_DIR = path.join(OUT, "vtt");

interface RunFile {
  provider: string;
  targetLanguage: string;
  events: Array<{
    text: string;
    audioTimeMs: number;
    emitMs: number;
    isFinal: boolean;
  }>;
}

function stamp(ms: number): string {
  const t = Math.max(0, ms);
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  const cs = Math.floor(t % 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)}.${p(cs, 3)}`;
}

/**
 * Cues are timed to the AUDIO position the caption describes, not to when it
 * was emitted — a player has to place them against the video timeline. The
 * emission delay is what the latency tables measure; conflating the two here
 * would produce a file whose captions drift progressively late.
 */
function toVTT(run: RunFile): string {
  const units = run.events.filter((e) => e.isFinal && e.text.trim());
  const lines = ["WEBVTT", "", `NOTE provider: ${run.provider}`, ""];
  for (let i = 0; i < units.length; i++) {
    const start = units[i].audioTimeMs;
    // A cue lasts until the next one, bounded so a trailing caption does not
    // hang on screen indefinitely.
    const next = units[i + 1]?.audioTimeMs ?? start + 3000;
    const end = Math.min(Math.max(next, start + 800), start + 8000);
    lines.push(String(i + 1));
    lines.push(`${stamp(start)} --> ${stamp(end)}`);
    lines.push(units[i].text.trim());
    lines.push("");
  }
  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const symbol = args.find((a) => a.startsWith("--symbol="))?.split("=")[1];
  const language = args.find((a) => a.startsWith("--language="))?.split("=")[1];

  fs.mkdirSync(VTT_DIR, { recursive: true });
  const files = fs
    .readdirSync(OUT)
    .filter((f) => f.startsWith("stream_") && f.endsWith(".json"));

  let written = 0;
  for (const f of files) {
    if (symbol && !f.includes(symbol.replace(/\//g, "_"))) continue;
    if (language && !f.endsWith(`_${language}.json`)) continue;
    try {
      const run = JSON.parse(
        fs.readFileSync(path.join(OUT, f), "utf8"),
      ) as RunFile;
      if (!run.events?.length) continue;
      const out = path.join(VTT_DIR, f.replace(/\.json$/, ".vtt"));
      fs.writeFileSync(out, toVTT(run));
      written++;
    } catch {
      continue;
    }
  }
  console.log(`wrote ${written} WebVTT file(s) to ${VTT_DIR}`);

  // ── Qualitative side-by-side ─────────────────────────────────────────────
  const textsPath = path.join(OUT, "system-texts.json");
  if (!fs.existsSync(textsPath)) return;
  const texts = JSON.parse(fs.readFileSync(textsPath, "utf8")) as Record<
    string,
    string
  >;
  const sym = symbol ?? "S/PV.10161";
  const lang = language ?? "fr";
  const lines: string[] = [
    `Qualitative sample — ${sym} → ${lang}`,
    "First ~320 characters of each system's output. Aggregate scores hide the",
    "failure MODE; this shows it.",
    "",
  ];
  for (const [k, v] of Object.entries(texts)) {
    const [sys, s, l] = k.split("|");
    if (s !== sym || l !== lang) continue;
    lines.push(`── ${sys} ${"─".repeat(Math.max(0, 60 - sys.length))}`);
    lines.push(v.slice(0, 320).replace(/\s+/g, " ").trim() || "(empty)");
    lines.push("");
  }
  const outPath = path.join(OUT, `sample_${sym.replace(/\//g, "_")}_${lang}.txt`);
  fs.writeFileSync(outPath, lines.join("\n"));
  console.log(`wrote ${outPath}`);
  console.log("\n" + lines.join("\n"));
}

main();
