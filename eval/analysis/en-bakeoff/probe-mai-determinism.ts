/**
 * CONTROL for probe-phraselist.
 *
 * That probe concluded "phraseList DID change the output" from the fact that
 * mai-transcribe-1.5's text differed between a run with and a run without a
 * phrase list. That inference is only valid if the model is DETERMINISTIC — if
 * it varies run-to-run on identical input, a differing output proves nothing.
 *
 * The default enhanced model was already shown deterministic (byte-identical on
 * repeat). mai-transcribe-1.5 has not been tested. This runs it twice on
 * identical input and compares.
 */
import "../../../lib/load-env";
import fs from "fs";
const K = process.env.AZURE_SPEECH_KEY!;
const EP = process.env.AZURE_SPEECH_ENDPOINT!.replace(/\/$/, "");
const URL = `${EP}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`;
const CLIP = "/Volumes/SSDAStorage/un-en-bakeoff/audio-derived/UN80-excerpt_64k.mp3";

async function call(def: unknown): Promise<string> {
  const b = fs.readFileSync(CLIP);
  const f = new FormData();
  f.append("audio", new Blob([new Uint8Array(b)], { type: "audio/mpeg" }), "a.mp3");
  f.append("definition", JSON.stringify(def));
  const r = await fetch(URL, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": K }, body: f });
  const j: any = await r.json();
  return (j.combinedPhrases || []).map((c: any) => c.text).join(" ");
}

(async () => {
  const mai = {
    enhancedMode: { enabled: true, task: "transcribe", model: "mai-transcribe-1.5" },
    locales: ["en-US"],
    profanityFilterMode: "None",
  };
  console.log("mai-transcribe-1.5, SAME request twice, no phrase list:");
  const a = await call(mai);
  const b = await call(mai);
  console.log(`  run1 ${a.length} chars, run2 ${b.length} chars, identical: ${a === b}`);
  if (a !== b) {
    // where do they first diverge?
    let i = 0;
    while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
    console.log(`  first divergence at char ${i}:`);
    console.log(`    run1: ...${a.slice(Math.max(0, i - 60), i + 60)}`);
    console.log(`    run2: ...${b.slice(Math.max(0, i - 60), i + 60)}`);
  }
  console.log(
    a === b
      ? "\n  => DETERMINISTIC. A phraseList-induced difference would be real."
      : "\n  => NON-DETERMINISTIC. The phraselist probe's 'output changed' conclusion is INVALID —\n     run-to-run variation alone explains it. Entity biasing remains UNPROVEN on Azure.",
  );
})();
