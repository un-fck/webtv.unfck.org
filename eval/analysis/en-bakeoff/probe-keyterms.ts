/**
 * Does AssemblyAI's keyterm biasing actually FIX the UN80 class?
 *
 * This is the highest-value remaining experiment. The state of play:
 *
 *  - Both vendors mangle "UN80" badly (§15.5a, reconfirmed in the battery:
 *    AssemblyAI 11 correct / 21 mangled, azure-llm 6 correct / 49 mangled).
 *  - It is invisible to WER (0.2% of tokens) and it is the error class that
 *    matters most in a UN record, because the institution being discussed IS
 *    the content.
 *  - Azure has **no working mechanism** to fix it: `phraseList` is
 *    accepted-and-ignored, the documented `prompt` substitute returns 400.
 *  - AssemblyAI exposes `keyterms_prompt`, `word_boost`, `custom_spelling`.
 *
 * So the whole "entity biasing" argument for the incumbent rests on a capability
 * that EXISTS but has never been shown to WORK. If it fixes UN80, that is a
 * strong reason to keep AssemblyAI. If it does not, the argument collapses and
 * the fix has to be an external glossary — which helps both vendors equally and
 * therefore stops being a reason to prefer either.
 *
 * Uses the same 12-minute excerpt as probe-phraselist, so the two vendors'
 * biasing mechanisms are compared on identical audio.
 */
import "../../../lib/load-env";
import fs from "fs";

const KEY = process.env.ASSEMBLYAI_API_KEY!;
const CLIP = "/Volumes/SSDAStorage/un-en-bakeoff/audio-derived/UN80-excerpt_64k.mp3";

const KEYTERMS = [
  "UN80",
  "UN80 Initiative",
  "Keita",
  "Secretary-General",
  "Member States",
];

function count(t: string, needles: string[]) {
  return needles.reduce(
    (n, x) => n + (t.match(new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length,
    0,
  );
}

async function run(label: string, extra: Record<string, unknown>) {
  const bytes = fs.readFileSync(CLIP);
  const up = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { authorization: KEY, "content-type": "application/octet-stream" },
    body: new Uint8Array(bytes),
  });
  if (!up.ok) {
    console.log(`  [${label}] upload failed ${up.status}`);
    return null;
  }
  const { upload_url } = (await up.json()) as { upload_url: string };

  const sub = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: { authorization: KEY, "content-type": "application/json" },
    body: JSON.stringify({
      audio_url: upload_url,
      speaker_labels: true,
      language_code: "en",
      speech_models: ["universal-3-5-pro", "universal-2"],
      ...extra,
    }),
  });
  if (!sub.ok) {
    console.log(`  [${label}] submit REJECTED ${sub.status}: ${(await sub.text()).slice(0, 240)}`);
    return null;
  }
  const { id } = (await sub.json()) as { id: string };
  let r: any;
  for (;;) {
    await new Promise((s) => setTimeout(s, 2000));
    const p = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { authorization: KEY },
    });
    r = await p.json();
    if (r.status === "completed" || r.status === "error") break;
  }
  if (r.status === "error") {
    console.log(`  [${label}] job error: ${r.error}`);
    return null;
  }
  const t: string = r.text || "";
  const good = count(t, ["UN80", "UN 80", "UN-80"]);
  const realBody = count(t, ["UNAT ", "UNAIDS"]);
  const fake = count(t, ["UNAD", "UNATE"]);
  console.log(
    `  [${label.padEnd(30)}] ${t.split(/\s+/).length} words | UN80 correct: ${String(good).padStart(3)} | ` +
      `-> real UN body: ${String(realBody).padStart(3)} | -> non-existent: ${String(fake).padStart(3)}`,
  );
  return { t, good, realBody, fake };
}

(async () => {
  console.log("Does AssemblyAI keyterm biasing fix UN80?  (12-min excerpt, same clip as the Azure probe)\n");

  const base = await run("baseline, no biasing", {});
  // The documented field for Universal models.
  const kt = await run("keyterms_prompt", { keyterms_prompt: KEYTERMS });
  // Legacy boosting, still accepted.
  const wb = await run("word_boost (high)", { word_boost: KEYTERMS, boost_param: "high" });
  // Deterministic post-hoc replacement — the strongest form.
  const cs = await run("custom_spelling", {
    custom_spelling: [
      { from: ["UNAT", "UNAD", "you and 80", "UN 80"], to: "UN80" },
    ],
  });

  console.log("\n  A control first: is AssemblyAI deterministic on this clip?");
  const base2 = await run("baseline again", {});
  if (base && base2) {
    console.log(
      `  baseline vs baseline: identical text = ${base.t === base2.t}, ` +
        `UN80 ${base.good} vs ${base2.good}`,
    );
    if (base.t !== base2.t)
      console.log(
        "  !! NON-DETERMINISTIC — a changed output is not evidence of biasing;\n" +
          "     only a change in the TARGET COUNT beyond this noise floor counts.",
      );
  }

  console.log("\n  VERDICT");
  for (const [name, r] of [["keyterms_prompt", kt], ["word_boost", wb], ["custom_spelling", cs]] as const) {
    if (!r || !base) continue;
    const d = r.good - base.good;
    const dm = r.realBody + r.fake - (base.realBody + base.fake);
    console.log(
      `    ${name.padEnd(18)} UN80 ${base.good} -> ${r.good} (${d >= 0 ? "+" : ""}${d}), ` +
        `mangled ${base.realBody + base.fake} -> ${r.realBody + r.fake} (${dm >= 0 ? "+" : ""}${dm})` +
        (d > 0 && dm < 0 ? "   <-- WORKS" : d === 0 && dm === 0 ? "   <-- no effect" : ""),
    );
  }
})();
