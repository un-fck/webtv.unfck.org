/**
 * Can the Azure family be told that "UN80" is a word?
 *
 * This is the top open item from SYNTHESIS §15.5a. azure-llm renders "UN80"
 * correctly 6 times and mangles it ~50 times into "the UNAT initiative" — UNAT
 * being a real UN body (the Appeals Tribunal), so the reader gets a
 * wrong-but-real institution. WER cannot see it (0.2% of tokens) and it is
 * exactly the class that matters most in a UN record.
 *
 * The fix everywhere else is keyterm biasing. On our endpoint:
 *   - the default enhanced model REJECTS `prompt` (400, schema violation) and
 *     ACCEPTS-AND-IGNORES `phraseList` — verified in probe-api2.
 *   - `mai-transcribe-1.5` documents `phraseList`. §10 called a targeted test
 *     against the §9 entity criteria "worth" doing. It was never run.
 *
 * So: run mai-transcribe-1.5 on the UN80 clip WITH and WITHOUT a phrase list and
 * count how often "UN80" survives. This does not make mai-transcribe usable — it
 * has no diarization and no word timestamps, both load-bearing for us — but it
 * answers whether the CAPABILITY exists anywhere in the Azure family, which is
 * what decides whether "wait for the roadmap" is a real option or wishful.
 *
 * Uses a 12-minute excerpt, not the full 171 min, because the mangling is dense
 * enough that a slice is decisive and the full clip costs 6x more.
 */
import "../../../lib/load-env";
import fs from "fs";
import { execSync } from "child_process";

const AZ_KEY = process.env.AZURE_SPEECH_KEY!;
const AZ_EP = process.env.AZURE_SPEECH_ENDPOINT!.replace(/\/$/, "");
const URL = `${AZ_EP}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`;

const SRC = "/Volumes/SSDAStorage/transcripts-eval-corpus-data-audio/UN80-Apr06-keita_en.m4a";
const CLIP = "/Volumes/SSDAStorage/un-en-bakeoff/audio-derived/UN80-excerpt_64k.mp3";

const PHRASES = [
  "UN80",
  "UN80 Initiative",
  "Keita",
  "Secretary-General",
  "Member States",
];

function countAll(t: string, needles: string[]) {
  return needles.reduce(
    (n, x) => n + (t.match(new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length,
    0,
  );
}

async function call(label: string, definition: unknown) {
  const bytes = fs.readFileSync(CLIP);
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }), "a.mp3");
  form.append("definition", JSON.stringify(definition));
  const t0 = Date.now();
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": AZ_KEY },
    body: form,
  });
  const ms = Date.now() - t0;
  const body = await res.text();
  if (!res.ok) {
    console.log(`  [${label}] HTTP ${res.status} — ${body.slice(0, 220)}`);
    return null;
  }
  const j = JSON.parse(body);
  const t = (j.combinedPhrases || []).map((c: any) => c.text).join(" ");
  const un80 = countAll(t, ["UN80", "UN 80", "UN-80"]);
  const unat = countAll(t, ["UNAT", "UNAD", "UNAIDS", "UNET", "U N 80"]);
  const keita = countAll(t, ["Keita"]);
  const kanem = countAll(t, ["Kanem"]);
  console.log(
    `  [${label.padEnd(34)}] ${ms}ms  ${t.split(/\s+/).length} words | ` +
      `UN80 correct: ${String(un80).padStart(3)} | mangled-to-real-acronym: ${String(unat).padStart(3)} | ` +
      `Keita: ${keita} | KANEM: ${kanem}`,
  );
  return { t, un80, unat };
}

(async () => {
  if (!fs.existsSync(CLIP)) {
    console.log("cutting a 12-minute excerpt...");
    // Start 20 min in — past the procedural opening, into the substantive debate
    // where "UN80" is used densely.
    execSync(
      `ffmpeg -y -loglevel error -ss 1200 -t 720 -i "${SRC}" -ac 1 -b:a 64k "${CLIP}"`,
    );
  }
  console.log(`clip: ${(fs.statSync(CLIP).size / 1e6).toFixed(1)} MB, 12 min\n`);

  console.log("=== the default enhanced model (what production would use) ===");
  const base = {
    enhancedMode: { enabled: true, task: "transcribe" },
    diarization: { enabled: true, maxSpeakers: 35 },
    locales: ["en-US"],
    profanityFilterMode: "None",
  };
  await call("default, no biasing", base);
  await call("default + phraseList", { ...base, enhancedMode: { ...base.enhancedMode, phraseList: PHRASES } });

  console.log("\n=== mai-transcribe-1.5 — the only Azure model documenting phraseList ===");
  const mai = {
    enhancedMode: { enabled: true, task: "transcribe", model: "mai-transcribe-1.5" },
    locales: ["en-US"],
    profanityFilterMode: "None",
  };
  const a = await call("mai, no biasing", mai);
  const b = await call("mai + phraseList", {
    ...mai,
    enhancedMode: { ...mai.enhancedMode, phraseList: PHRASES },
  });

  if (a && b) {
    console.log(
      `\n  phraseList effect on mai: UN80 ${a.un80} -> ${b.un80}   ` +
        `mangled ${a.unat} -> ${b.unat}   ` +
        `output byte-identical: ${a.t === b.t}`,
    );
    // A differing output is NOT evidence of biasing unless the model is
    // deterministic. probe-mai-determinism.ts shows mai-transcribe-1.5 is NOT:
    // two identical requests differ ("towards stronger" vs "towards a stronger").
    // So the only admissible evidence here is a change in the TARGET COUNT.
    console.log(
      a.un80 === b.un80 && a.unat === b.unat
        ? "  => phraseList did NOT improve UN80 recall. And mai-transcribe-1.5 is\n" +
          "     non-deterministic (see probe-mai-determinism.ts), so a differing output\n" +
          "     is run-to-run noise, not evidence of biasing. ENTITY BIASING UNPROVEN."
        : "  => phraseList moved the TARGET COUNT. That is admissible evidence of biasing.",
    );
  }
})();
