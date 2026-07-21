#!/usr/bin/env tsx
/**
 * Arm C: direct live speech-translation. Streams the FLOOR audio into each
 * live model at 1× real time and scores what comes out against the PV record —
 * on quality, exactly like arms A and B, and on latency, on the same axis as
 * the human interpreters from Phase 1.
 *
 *   tsx eval/live/run-streaming.ts --symbols=S/PV.10156 --languages=fr,es
 *                                  [--providers=soniox-rt-v5] [--dry-run]
 *
 * Runs take at least as long as the audio, by construction. That is the point:
 * a latency number obtained by firehosing a file into a socket measures the
 * vendor's backend throughput, not what a delegate in the room would experience.
 */
import "../../lib/load-env";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { STUDY_SESSIONS } from "../interp-lag/sessions";
import { getKalturaAudioUrl } from "../../lib/transcription";
import { fetchPVDocument } from "../ground-truth/documents-api";
import { parsePVDocument } from "../ground-truth/pdf-parser";
import { computeMetrics } from "../metrics";
import { computeLatency, type StreamingProvider } from "./streaming-types";
import { sonioxRealtime } from "./providers/soniox-rt";

const PROVIDERS: StreamingProvider[] = [sonioxRealtime];

const OUT = path.join(__dirname, "out");
const AUDIO_CACHE = path.join(__dirname, "cache", "audio");
const PV_CACHE = path.join(__dirname, "cache", "pv");

const CHARACTER_SCORED = new Set(["zh"]);

/** Download the floor flavor and transcode to 16 kHz mono s16le PCM. */
async function preparePcm(kalturaId: string): Promise<{
  pcmPath: string;
  durationMs: number;
}> {
  fs.mkdirSync(AUDIO_CACHE, { recursive: true });
  const pcmPath = path.join(AUDIO_CACHE, `${kalturaId}_floor.pcm`);
  if (!fs.existsSync(pcmPath)) {
    const { audioUrl } = await getKalturaAudioUrl(kalturaId, "interlingua");
    console.log(`  transcoding floor audio → 16 kHz mono PCM`);
    execFileSync(
      "ffmpeg",
      ["-y", "-i", audioUrl, "-ac", "1", "-ar", "16000", "-f", "s16le", pcmPath],
      { stdio: "ignore" },
    );
  }
  const bytes = fs.statSync(pcmPath).size;
  return { pcmPath, durationMs: (bytes / 2 / 16000) * 1000 };
}

async function getPVText(symbol: string, language: string): Promise<string> {
  fs.mkdirSync(PV_CACHE, { recursive: true });
  const key = path.join(
    PV_CACHE,
    `${symbol.replace(/\//g, "_")}_${language}.txt`,
  );
  if (fs.existsSync(key)) return fs.readFileSync(key, "utf8");
  const parsed = await parsePVDocument(await fetchPVDocument(symbol, language));
  fs.writeFileSync(key, parsed.fullText);
  return parsed.fullText;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const symbolArg = args.find((a) => a.startsWith("--symbols="))?.split("=")[1];
  const langArg = args.find((a) => a.startsWith("--languages="))?.split("=")[1];
  const provArg = args.find((a) => a.startsWith("--providers="))?.split("=")[1];
  const budget = Number(
    args.find((a) => a.startsWith("--budget="))?.split("=")[1] ?? 10,
  );

  const languages = langArg ? langArg.split(",") : ["fr", "es", "ar", "zh", "ru"];
  let sessions = STUDY_SESSIONS.filter((s) => s.pvSymbol);
  if (symbolArg) {
    const want = new Set(symbolArg.split(","));
    sessions = sessions.filter((s) => want.has(s.pvSymbol!));
  }
  let providers = PROVIDERS;
  if (provArg) {
    const want = new Set(provArg.split(","));
    providers = providers.filter((p) => want.has(p.name));
  }

  const runnable = providers.filter((p) => {
    const miss = p.missingKey?.();
    if (miss) {
      console.log(`[stream] ${p.name}: SKIPPED — ${miss} not set`);
      return false;
    }
    return true;
  });

  const audioHours =
    sessions.reduce((a, s) => a + s.durationS, 0) / 3600 * languages.length;
  const estimate = audioHours * 0.12 * runnable.length;
  const wallMin = (sessions.reduce((a, s) => a + s.durationS, 0) / 60) *
    languages.length * runnable.length;

  console.log(
    `[stream] ${runnable.length} provider(s) × ${sessions.length} session(s) × ` +
      `${languages.length} language(s)`,
  );
  console.log(
    `[stream] ≈${audioHours.toFixed(2)} audio-hours, est. $${estimate.toFixed(2)}, ` +
      `≈${wallMin.toFixed(0)} min wall clock (1× real time)`,
  );
  if (estimate > budget) {
    console.error(
      `[stream] estimate $${estimate.toFixed(2)} exceeds --budget=${budget}; refusing to start`,
    );
    process.exit(1);
  }
  if (dryRun) return;

  fs.mkdirSync(OUT, { recursive: true });
  const rows: Array<Record<string, unknown>> = [];
  let spent = 0;

  for (const s of sessions) {
    console.log(`\n[stream] ${s.pvSymbol} (${(s.durationS / 60).toFixed(0)} min)`);
    const { pcmPath, durationMs } = await preparePcm(s.kalturaId);

    for (const p of runnable) {
      for (const lang of languages) {
        if (!p.supportedTargets.includes(lang)) {
          console.log(`  ${p.name} ${lang}: unsupported target, skipping`);
          continue;
        }
        console.log(`  ${p.name} → ${lang} (streaming at 1×)…`);
        const run = await p.run({
          pcmPath,
          audioDurationMs: durationMs,
          targetLanguage: lang,
        });
        spent += run.costUsd ?? 0;

        if (run.error) {
          console.log(`    ERROR: ${run.error}`);
          rows.push({ symbol: s.pvSymbol, provider: p.name, language: lang, error: run.error });
          continue;
        }

        const lat = computeLatency(run);
        const pv = await getPVText(s.pvSymbol!, lang);
        const m = computeMetrics(pv, run.fullText, lang);
        const quality = CHARACTER_SCORED.has(lang)
          ? m.normalizedWer.cer
          : m.normalizedWer.wer;

        rows.push({
          symbol: s.pvSymbol,
          provider: p.name,
          language: lang,
          qualityRate: quality,
          metric: CHARACTER_SCORED.has(lang) ? "CER" : "WER",
          ...lat,
          costUsd: run.costUsd,
        });
        console.log(
          `    ${CHARACTER_SCORED.has(lang) ? "CER" : "WER"} ${(quality * 100).toFixed(1)}%  ` +
            `lag median ${lat.medianLagS.toFixed(1)}s p90 ${lat.p90LagS.toFixed(1)}s  ` +
            `ATD ${lat.atdS.toFixed(1)}s  (n=${lat.nEvents})  $${(run.costUsd ?? 0).toFixed(3)}`,
        );

        fs.writeFileSync(
          path.join(OUT, `stream_${s.pvSymbol!.replace(/\//g, "_")}_${p.name}_${lang}.json`),
          JSON.stringify(run, null, 1),
        );
      }
    }
  }

  fs.writeFileSync(
    path.join(OUT, "streaming-results.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2),
  );
  console.log(`\n[stream] done — spent ≈$${spent.toFixed(2)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
