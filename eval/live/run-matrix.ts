#!/usr/bin/env tsx
/**
 * Run every system over the same evaluation matrix and write ONE results file.
 *
 *   tsx eval/live/run-matrix.ts [--tier=1|2|all] [--systems=a,b] [--budget=30]
 *                               [--dry-run]
 *
 * Quality and latency are recorded independently. Offline arms have no latency
 * and report none; live arms report both. Nothing here combines them into a
 * single score, because a system can be excellent at one and hopeless at the
 * other and that trade-off is the point.
 */
import "../../lib/load-env";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { Pool } from "pg";
import {
  ALL_CELLS,
  TIER1_CELLS,
  TIER2_CELLS,
  audioHours,
  wallClockMinutes,
  type Cell,
} from "./matrix";
import { fetchPVDocument } from "../ground-truth/documents-api";
import { parsePVDocument } from "../ground-truth/pdf-parser";
import { computeMetrics } from "../metrics";
import { computeChrF } from "../metrics/chrf";
import { getKalturaAudioUrl } from "../../lib/transcription";
import {
  humanInterpreter,
  pivotSystem,
  liveTextSystem,
  liveAudioSystem,
  type System,
  type RunContext,
} from "./systems";
import { sonioxRealtime } from "./providers/soniox-rt";
import { openaiRealtimeS2S, openaiRealtime } from "./providers/openai-realtime";
import { captionPipeline } from "./providers/caption-pipeline";
import { azureSpeechTranslation } from "./providers/azure-speech-translation";

const OUT = path.join(__dirname, "out");
const AUDIO_CACHE = path.join(__dirname, "cache", "audio");
const PV_CACHE = path.join(__dirname, "cache", "pv");
const RESULTS = path.join(OUT, "matrix-results.json");
/** Produced text per (system, cell) — needed by the adequacy judge, and the
 * only record of what a live run actually said. */
const TEXTS = path.join(OUT, "system-texts.json");

const SYSTEMS: System[] = [
  humanInterpreter,
  pivotSystem,
  liveTextSystem(sonioxRealtime, 0.12),
  // Speech-to-speech is the most expensive arm by an order of magnitude
  // (audio tokens both directions), so it is restricted to two contrasting
  // targets: French (Latin script, close to the floor languages) and Arabic
  // (different script and word order, the pair humans find hardest at 4.7s).
  // Second live-text vendor. The "live models lose" conclusion rested on a
  // single vendor; this tests it. Arabic is excluded because OpenAI's realtime
  // translation does not emit it.
  liveTextSystem(openaiRealtime({ mode: "text", targets: ["en", "es", "fr", "zh"] }), 2.04),
  liveAudioSystem(openaiRealtimeS2S(["fr", "ar"]), 2.5),
  // The YouTube architecture: caption first, translate the captions. Every
  // platform captioning stack (YouTube, Meet, Teams, Zoom) is shaped this way,
  // so it is measured as its own thing rather than assumed equivalent to a
  // single-model live translator.
  liveTextSystem(captionPipeline({ asrLanguage: "multi" }), 0.29 + 0.15),
  // Control for the above. The "multi" variant produces nonsense on a
  // multilingual floor ("Le message secret est...") at 35-41% coverage, but
  // that could be the ARCHITECTURE or just its language detection. Pinning the
  // ASR to English isolates it: same pipeline, same MT, one variable changed.
  liveTextSystem(captionPipeline({ asrLanguage: "en" }), 0.29 + 0.15),
  // The engine behind Teams' live translated captions, and the same Azure
  // Speech service our production pipeline already uses for fr/es/ar/ru.
  liveTextSystem(azureSpeechTranslation({ sourceLanguage: "en" }), 2.5),
];

/** Chinese has no spaces, so word-level WER is noise; CER is the substitute. */
const CHARACTER_SCORED = new Set(["zh"]);

export interface ResultRow {
  system: string;
  arm: string;
  symbol: string;
  language: string;
  /** WER, or CER for character-scored languages. Lower is better. */
  errorRate: number | null;
  errorMetric: "WER" | "CER";
  /** chrF++ 0-100. Higher is better. The translation-appropriate metric. */
  chrf: number | null;
  medianLagS: number | null;
  p90LagS: number | null;
  atdS: number | null;
  /** Caption readability — null for offline arms. */
  captionSegmented: boolean | null;
  captionMeanChars: number | null;
  captionsPerMinute: number | null;
  captionReadingRate: number | null;
  captionShareOverLimit: number | null;
  costUsd: number | null;
  error?: string;
}

async function getPVText(symbol: string, language: string): Promise<string> {
  fs.mkdirSync(PV_CACHE, { recursive: true });
  const key = path.join(PV_CACHE, `${symbol.replace(/\//g, "_")}_${language}.txt`);
  if (fs.existsSync(key)) return fs.readFileSync(key, "utf8");
  const parsed = await parsePVDocument(await fetchPVDocument(symbol, language));
  fs.writeFileSync(key, parsed.fullText);
  return parsed.fullText;
}

async function preparePcm(kalturaId: string) {
  fs.mkdirSync(AUDIO_CACHE, { recursive: true });
  const pcmPath = path.join(AUDIO_CACHE, `${kalturaId}_floor.pcm`);
  if (!fs.existsSync(pcmPath)) {
    const { audioUrl } = await getKalturaAudioUrl(kalturaId, "interlingua");
    execFileSync(
      "ffmpeg",
      ["-y", "-i", audioUrl, "-ac", "1", "-ar", "16000", "-f", "s16le", pcmPath],
      { stdio: "ignore" },
    );
  }
  const bytes = fs.statSync(pcmPath).size;
  return { pcmPath, durationMs: (bytes / 2 / 16000) * 1000 };
}

function loadExisting(): ResultRow[] {
  if (!fs.existsSync(RESULTS)) return [];
  return (JSON.parse(fs.readFileSync(RESULTS, "utf8")).rows ?? []) as ResultRow[];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const tier = args.find((a) => a.startsWith("--tier="))?.split("=")[1] ?? "1";
  const sysArg = args.find((a) => a.startsWith("--systems="))?.split("=")[1];
  const budget = Number(
    args.find((a) => a.startsWith("--budget="))?.split("=")[1] ?? 30,
  );

  const cells: Cell[] =
    tier === "1" ? TIER1_CELLS : tier === "2" ? TIER2_CELLS : ALL_CELLS;

  let systems = SYSTEMS;
  if (sysArg) {
    const want = new Set(sysArg.split(","));
    systems = systems.filter((s) => want.has(s.id));
  }
  const runnable = systems.filter((s) => {
    const miss = s.missingKey?.();
    if (miss) {
      console.log(`[matrix] ${s.id}: SKIPPED — ${miss} not set`);
      return false;
    }
    return true;
  });

  // ── Cost + wall-clock estimate before anything bills ─────────────────────
  let estimate = 0;
  for (const s of runnable)
    estimate += audioHours(cells.filter((c) => s.supports(c))) * s.usdPerHour;
  const liveSystems = runnable.filter((s) => s.arm.startsWith("C") || s.arm.startsWith("D"));
  const wall = wallClockMinutes(cells) * liveSystems.length;

  console.log(
    `[matrix] tier=${tier}: ${cells.length} cells ` +
      `(${[...new Set(cells.map((c) => c.symbol))].join(", ")})`,
  );
  console.log(`[matrix] systems: ${runnable.map((s) => s.id).join(", ")}`);
  console.log(
    `[matrix] est. $${estimate.toFixed(2)}; live arms need ≈${wall.toFixed(0)} min wall clock at 1×`,
  );
  if (estimate > budget) {
    console.error(`[matrix] estimate exceeds --budget=${budget}; refusing`);
    process.exit(1);
  }
  if (dryRun) return;

  fs.mkdirSync(OUT, { recursive: true });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const rows = force ? [] : loadExisting();
  const texts: Record<string, string> = fs.existsSync(TEXTS)
    ? JSON.parse(fs.readFileSync(TEXTS, "utf8"))
    : {};
  const done = new Set(rows.map((r) => `${r.system}|${r.symbol}|${r.language}`));
  let spent = 0;

  // Group by session so each session's audio is prepared once, and so a
  // session's languages can be streamed concurrently.
  const bySession = new Map<string, Cell[]>();
  for (const c of cells) {
    if (!bySession.has(c.kalturaId)) bySession.set(c.kalturaId, []);
    bySession.get(c.kalturaId)!.push(c);
  }

  for (const [kalturaId, sessionCells] of bySession) {
    const { pcmPath, durationMs } = await preparePcm(kalturaId);
    const ctx: RunContext = {
      pool,
      floorPcmPath: pcmPath,
      floorDurationMs: durationMs,
    };
    console.log(
      `\n[matrix] ${sessionCells[0].symbol} (${(sessionCells[0].durationS / 60).toFixed(0)} min) — ` +
        `${sessionCells.length} language(s)`,
    );

    for (const sys of runnable) {
      const todo = sessionCells.filter(
        (c) => sys.supports(c) && !done.has(`${sys.id}|${c.symbol}|${c.language}`),
      );
      if (!todo.length) continue;
      const isLive = sys.arm.startsWith("C") || sys.arm.startsWith("D");
      console.log(
        `  ${sys.id}: ${todo.length} cell(s)${isLive ? " — streaming at 1×, concurrent" : ""}`,
      );

      // Live systems stream all of a session's languages at once, so the wall
      // clock is one session length rather than one per language.
      const outputs = isLive
        ? await Promise.all(todo.map((c) => sys.produce(c, ctx)))
        : await todo.reduce(
            async (accP, c) => {
              const acc = await accP;
              acc.push(await sys.produce(c, ctx));
              return acc;
            },
            Promise.resolve([] as Awaited<ReturnType<System["produce"]>>[]),
          );

      for (let i = 0; i < todo.length; i++) {
        const cell = todo[i];
        const o = outputs[i];
        spent += o.costUsd ?? 0;

        if (!o.text) {
          rows.push({
            system: sys.id,
            arm: sys.arm,
            symbol: cell.symbol,
            language: cell.language,
            errorRate: null,
            errorMetric: CHARACTER_SCORED.has(cell.language) ? "CER" : "WER",
            chrf: null,
            medianLagS: null,
            p90LagS: null,
            atdS: null,
            captionSegmented: null,
            captionMeanChars: null,
            captionsPerMinute: null,
            captionReadingRate: null,
            captionShareOverLimit: null,
            costUsd: o.costUsd ?? null,
            error: o.error ?? "empty output",
          });
          console.log(`    ${cell.language}: ${o.error ?? "empty output"}`);
          continue;
        }

        texts[`${sys.id}|${cell.symbol}|${cell.language}`] = o.text;
        fs.writeFileSync(TEXTS, JSON.stringify(texts, null, 1));

        const pv = await getPVText(cell.symbol, cell.language);
        const m = computeMetrics(pv, o.text, cell.language);
        const chrf = computeChrF(pv, o.text).score;
        const errorRate = CHARACTER_SCORED.has(cell.language)
          ? m.normalizedWer.cer
          : m.normalizedWer.wer;

        rows.push({
          system: sys.id,
          arm: sys.arm,
          symbol: cell.symbol,
          language: cell.language,
          errorRate,
          errorMetric: CHARACTER_SCORED.has(cell.language) ? "CER" : "WER",
          chrf,
          medianLagS: o.latency?.medianLagS ?? null,
          p90LagS: o.latency?.p90LagS ?? null,
          atdS: o.latency?.atdS ?? null,
          captionSegmented: o.caption?.segmented ?? null,
          captionMeanChars: o.caption?.meanChars ?? null,
          captionsPerMinute: o.caption?.captionsPerMinute ?? null,
          captionReadingRate: o.caption?.medianReadingRate ?? null,
          captionShareOverLimit: o.caption?.shareOverLimit ?? null,
          costUsd: o.costUsd ?? null,
          error: o.error,
        });
        console.log(
          `    ${cell.language}: chrF++ ${chrf.toFixed(1)}  ` +
            `${CHARACTER_SCORED.has(cell.language) ? "CER" : "WER"} ${(errorRate * 100).toFixed(1)}%` +
            (o.latency ? `  lag ${o.latency.medianLagS.toFixed(1)}s` : "") +
            (o.error ? `  [${o.error}]` : ""),
        );
        fs.writeFileSync(
          RESULTS,
          JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2),
        );
      }
    }
  }

  console.log(`\n[matrix] done — spent ≈$${spent.toFixed(2)} this run`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
