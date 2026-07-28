/**
 * The §9 / §14.2 anecdotal battery, re-run on both arms.
 *
 * These three clips have NO PV, so they cannot be scored by WER. They exist
 * because they contain known, pre-registered traps that WER cannot see:
 *
 *  V1  UN80-Apr06-keita        171 min — the HALLUCINATION GATE. A speaker named
 *                              Keita is discussed; some engines substitute
 *                              "Kanem" — a *different real person*, confidently.
 *                              §14.2 pre-registered this as the one binary,
 *                              non-negotiable disqualifier: any Kanem-class
 *                              substitution fails the arm for `en` regardless of
 *                              WER. It also carries "UN80" ~56 times, the entity
 *                              trap of §15.5a.
 *  V3  UN80-Apr29-timestamps   171 min — the other long file on which §14.3
 *                              found AssemblyAI collapsing to 2 speakers with a
 *                              single 15.9-minute utterance.
 *  V4  Nebenzia-Starobelsk      40 min — accented English. Historical probes:
 *                              "appalling" (mis-heard as "polling"), "cold
 *                              blood", the place name "Starobelsk", and the
 *                              patronymic "Alexeyevich".
 *
 * Run AFTER the scored corpus, because it costs money and answers a different
 * question. Reuses run-bakeoff's arms by shelling out with an extended manifest.
 */
import fs from "fs";
import path from "path";

const OUT = "/Volumes/SSDAStorage/un-en-bakeoff";
const RAW = path.join(OUT, "raw");

interface Probe {
  label: string;
  /** case-insensitive substring; counted per arm */
  needles: string[];
  note: string;
}

const BATTERY: Record<string, Probe[]> = {
  "UN80-Apr06-keita": [
    { label: "Keita (the correct name)", needles: ["Keita"], note: "higher is better" },
    {
      label: "KANEM — the pre-registered disqualifier",
      needles: ["Kanem"],
      note: "MUST BE ZERO. A different real person, rendered confidently.",
    },
    { label: "UN80 rendered correctly", needles: ["UN80", "UN 80"], note: "higher is better" },
    {
      label: "UN80 mangled into a real UN body",
      needles: ["UNAIDS", "UNAT "],
      note: "§15.5a: puts a wrong-but-real institution in front of a reader",
    },
    { label: "UN80 mangled into a non-existent acronym", needles: ["UNAD", "UNATE"], note: "" },
  ],
  "UN80-Apr29-timestamps": [
    { label: "UN80 rendered correctly", needles: ["UN80", "UN 80"], note: "" },
    { label: "UN80 mangled (real body)", needles: ["UNAIDS", "UNAT "], note: "" },
  ],
  "Nebenzia-Starobelsk": [
    {
      label: '"appalling" (the U-2-era mishear is "polling")',
      needles: ["appalling"],
      note: "should be >0",
    },
    { label: '"polling" — the wrong reading', needles: ["polling"], note: "should be 0" },
    { label: '"cold blood"', needles: ["cold blood"], note: "should be >0" },
    { label: "Starobelsk (place name)", needles: ["Starobel", "Starobil"], note: "higher is better" },
    { label: 'patronymic "Alexeyevich"', needles: ["Alexeyevich", "Alekseyevich"], note: "" },
  ],
};

function textOf(file: string, arm: string): string | null {
  if (!fs.existsSync(file)) return null;
  const j = JSON.parse(fs.readFileSync(file, "utf-8"));
  if (arm === "A0" || arm === "A1") return j.text || "";
  return (j.combinedPhrases || []).map((c: any) => c.text).join("\n");
}

function count(hay: string, needle: string): number {
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return (hay.match(re) || []).length;
}

const ARMS = ["A1", "A2"] as const;
const ARM_LABEL: Record<string, string> = {
  A1: "AssemblyAI U-3.5 Pro",
  A2: "azure-llm-speech",
};

console.log("=".repeat(100));
console.log("ANECDOTAL BATTERY — traps that WER cannot see (§9 / §14.2 / §15.5a)");
console.log("=".repeat(100));

for (const [dir, probes] of Object.entries(BATTERY)) {
  const texts: Record<string, string | null> = {};
  for (const a of ARMS) texts[a] = textOf(path.join(RAW, `${a}__${dir}__p1.json`), a);
  if (!texts.A1 && !texts.A2) {
    console.log(`\n${dir}: not transcribed yet — skipped`);
    continue;
  }
  console.log(`\n### ${dir}`);
  console.log(
    `${"probe".padEnd(46)} ${ARM_LABEL.A1.padStart(22)} ${ARM_LABEL.A2.padStart(20)}   note`,
  );
  for (const p of probes) {
    const cells = ARMS.map((a) =>
      texts[a] === null ? "  —" : String(p.needles.reduce((n, x) => n + count(texts[a]!, x), 0)),
    );
    console.log(
      `${p.label.padEnd(46)} ${cells[0].padStart(22)} ${cells[1].padStart(20)}   ${p.note}`,
    );
  }
  for (const a of ARMS) {
    if (texts[a]) {
      const w = texts[a]!.split(/\s+/).filter(Boolean).length;
      console.log(`   [${a}] ${w} words of output`);
    }
  }
}

console.log(
  "\nGATE: the Kanem row must be 0 for an arm to remain eligible for the English track.",
);
