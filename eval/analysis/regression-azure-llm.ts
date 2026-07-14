/**
 * Drift regression test for `azure-llm-speech`.
 *
 * WHY THIS EXISTS: "enhanced mode" routes to an *unnamed* Microsoft speech-LLM.
 * There is no `model` version to pin, and Microsoft has already replaced it once
 * ("renewed speech-LLM model", Build 2026) under an unchanged request shape. A
 * silent swap would show up as a quiet quality regression across 96% of our
 * audio with no signal at all. This turns that into a visible diff.
 *
 * It transcribes one short fixed clip, compares against a committed baseline,
 * and exits non-zero if the output has drifted beyond a threshold.
 *
 *   npx tsx eval/analysis/regression-azure-llm.ts            # check vs baseline
 *   npx tsx eval/analysis/regression-azure-llm.ts --update   # (re)write baseline
 *
 * Drift is measured as WER of today's transcript against the baseline transcript
 * (not against ground truth — we are detecting *change*, not correctness). A
 * couple of percent is normal ASR nondeterminism; a step change is the model
 * moving under us.
 */
import "../../lib/load-env";
import fs from "fs";
import path from "path";
import { getProvider } from "../../lib/providers/registry";
import { computeWER } from "../metrics/wer";
import { normalizeForWER } from "../metrics/text-normalizer";

// A short, stable, publicly-hosted UN meeting. Kept small deliberately: this
// runs weekly and must not re-download gigabytes. S/PV.10100 is 4.5 minutes.
const CLIP = {
  symbol: "S/PV.10100",
  assetId: "k17/k1765cxnjb",
  language: "en",
};
const BASELINE = path.join(__dirname, "baselines", "azure-llm-speech.en.json");

// Above this, assume the model changed rather than ordinary ASR jitter.
const DRIFT_THRESHOLD = 0.05;

interface Baseline {
  capturedAt: string;
  symbol: string;
  language: string;
  chars: number;
  words: number;
  speakers: number;
  fullText: string;
}

async function main() {
  const update = process.argv.includes("--update");

  // assetId → canonical entryId → audio URL (see docs/webtv-kaltura.md).
  const { getKalturaAudioUrl } = await import("../../lib/transcription");
  const { resolveEntryId } = await import("../../lib/kaltura-helpers");
  const entryId = await resolveEntryId(CLIP.assetId);
  const { audioUrl } = await getKalturaAudioUrl(entryId, "english");

  const provider = getProvider("azure-llm-speech");
  const t0 = Date.now();
  const t = await provider.transcribe(audioUrl, { language: CLIP.language });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);

  const speakers = new Set(t.utterances.map((u) => u.speaker)).size;
  const words = t.fullText.split(/\s+/).filter(Boolean).length;
  const current: Baseline = {
    capturedAt: new Date().toISOString(),
    symbol: CLIP.symbol,
    language: CLIP.language,
    chars: t.fullText.length,
    words,
    speakers,
    fullText: t.fullText,
  };

  if (update || !fs.existsSync(BASELINE)) {
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
    fs.writeFileSync(BASELINE, JSON.stringify(current, null, 2));
    console.log(
      `Baseline ${update ? "updated" : "created"}: ${current.words} words, ` +
        `${speakers} speakers, ${elapsed}s → ${path.relative(process.cwd(), BASELINE)}`,
    );
    return;
  }

  const base: Baseline = JSON.parse(fs.readFileSync(BASELINE, "utf-8"));
  const drift = computeWER(
    normalizeForWER(base.fullText, CLIP.language),
    normalizeForWER(current.fullText, CLIP.language),
  ).wer;

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(
    `azure-llm-speech drift check — ${CLIP.symbol} (${CLIP.language})`,
  );
  console.log(`  baseline captured : ${base.capturedAt}`);
  console.log(`  words             : ${base.words} → ${current.words}`);
  console.log(`  speakers          : ${base.speakers} → ${current.speakers}`);
  console.log(`  wall clock        : ${elapsed}s`);
  console.log(
    `  DRIFT vs baseline : ${pct(drift)}  (threshold ${pct(DRIFT_THRESHOLD)})`,
  );

  if (drift > DRIFT_THRESHOLD) {
    console.error(
      `\n❌ DRIFT EXCEEDS THRESHOLD. The unnamed enhanced-mode model has probably ` +
        `changed.\n   Re-run the §14/§15 evals before trusting production output, then ` +
        `refresh the baseline with --update.`,
    );
    process.exit(1);
  }
  console.log(`\n✅ within tolerance — no evidence of a model swap.`);
}

main().catch((e) => {
  console.error(`Regression check FAILED to run: ${e?.message ?? e}`);
  process.exit(2);
});
