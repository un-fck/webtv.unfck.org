#!/usr/bin/env tsx
/**
 * Re-transcribe the floor (original audio) track of every study session with
 * Speechmatics Melia, caching the normalized transcript to disk.
 *
 * Why not just read the floor transcript out of the DB: see sessions.ts — the
 * stored floor rows are Gemini-era and their timestamps drift by tens of
 * seconds, which is the very quantity we are trying to measure.
 *
 * Melia is the right model here for two reasons beyond accuracy: it emits real
 * per-word timestamps (the interpreted tracks mostly don't), and it labels
 * each word with the language actually being spoken — which is how we recover
 * the SOURCE language of each floor passage without any extra model call.
 *
 *   tsx analysis/interp-lag/fetch-floor.ts [--dry-run] [--only=<kalturaId>]
 */
import "../../lib/load-env";
import fs from "fs";
import path from "path";
import { getKalturaAudioUrl } from "../../lib/transcription";
import { getProvider } from "../../lib/providers/registry";
import { STUDY_SESSIONS, TOTAL_FLOOR_HOURS } from "./sessions";

const CACHE_DIR = path.join(__dirname, "cache", "floor");
const PROVIDER_KEY = "speechmatics-melia-1";
/** lib/providers/pricing.ts, rate card 2026-07-10. */
const USD_PER_HOUR = 0.129;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const only = args.find((a) => a.startsWith("--only="))?.split("=")[1];

  const sessions = only
    ? STUDY_SESSIONS.filter((s) => s.kalturaId === only)
    : STUDY_SESSIONS;

  fs.mkdirSync(CACHE_DIR, { recursive: true });

  // --force re-bills. It exists because a cached file written before the
  // adapter carried Melia's per-word `language` labels is missing the source-
  // language signal the analysis conditions on, and there is no way to
  // backfill that without re-transcribing.
  const pending = force
    ? sessions
    : sessions.filter(
        (s) => !fs.existsSync(path.join(CACHE_DIR, `${s.kalturaId}.json`)),
      );
  const pendingHours = pending.reduce((a, s) => a + s.durationS, 0) / 3600;

  console.log(
    `[floor] ${sessions.length} session(s), ${pending.length} not yet cached`,
  );
  console.log(
    `[floor] corpus is ${TOTAL_FLOOR_HOURS.toFixed(2)} h total; ` +
      `${pendingHours.toFixed(2)} h to transcribe ` +
      `≈ $${(pendingHours * USD_PER_HOUR).toFixed(2)} at $${USD_PER_HOUR}/h`,
  );
  if (dryRun) {
    console.log("[floor] --dry-run, stopping before any billable call");
    return;
  }

  const provider = getProvider(PROVIDER_KEY);
  let spentHours = 0;

  for (const s of pending) {
    const out = path.join(CACHE_DIR, `${s.kalturaId}.json`);
    const t0 = Date.now();
    try {
      // "interlingua" is Kaltura's label for the floor/original flavor.
      const { audioUrl, entryId } = await getKalturaAudioUrl(
        s.kalturaId,
        "interlingua",
      );
      console.log(
        `[floor] ${s.kalturaId} (${s.label}, ${(s.durationS / 60).toFixed(0)} min) → ${entryId}`,
      );

      const result = await provider.transcribe(audioUrl, { language: "floor" });

      fs.writeFileSync(
        out,
        JSON.stringify(
          {
            kalturaId: s.kalturaId,
            entryId,
            label: s.label,
            pvSymbol: s.pvSymbol,
            provider: PROVIDER_KEY,
            fetchedAt: new Date().toISOString(),
            durationMs: result.durationMs,
            usage: result.usage,
            utterances: result.utterances,
          },
          null,
          1,
        ),
      );
      spentHours += s.durationS / 3600;
      console.log(
        `[floor]   ok — ${result.utterances.length} utterances, ` +
          `${((Date.now() - t0) / 1000).toFixed(0)}s wall, ` +
          `running spend ≈ $${(spentHours * USD_PER_HOUR).toFixed(2)}`,
      );
    } catch (err) {
      console.error(
        `[floor]   FAILED ${s.kalturaId}: ${(err as Error).message}`,
      );
    }
  }
  console.log(
    `[floor] done — transcribed ${spentHours.toFixed(2)} h ` +
      `≈ $${(spentHours * USD_PER_HOUR).toFixed(2)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
