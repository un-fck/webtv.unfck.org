import "../../../lib/load-env";
import fs from "fs";
const AZ_KEY = process.env.AZURE_SPEECH_KEY!;
const AZ_EP = process.env.AZURE_SPEECH_ENDPOINT!.replace(/\/$/, "");
const URL = `${AZ_EP}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`;
const F = "/Volumes/SSDAStorage/un-en-bakeoff/audio-derived/S_PV.10156_en_64k.mp3";
const bytes = fs.readFileSync(F);
async function call(label: string, def: any) {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }), "a.mp3");
  form.append("definition", JSON.stringify(def));
  const res = await fetch(URL, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": AZ_KEY }, body: form });
  const body = await res.text();
  if (!res.ok) { console.log(`  [${label}] HTTP ${res.status}: ${body.slice(0,220)}`); return; }
  const j = JSON.parse(body);
  const t = (j.combinedPhrases||[]).map((c:any)=>c.text).join(" ");
  const m = t.indexOf("****");
  const anchor = t.indexOf("for the contributions they made");
  console.log(`  [${label}] HTTP 200  masked=${m>=0}`);
  const k = m>=0 ? m : anchor;
  if (k>=0) console.log(`      ...${t.slice(Math.max(0,k-95), k+60).replace(/\n/g," ")}...`);
}
(async () => {
  const base = { enhancedMode: { enabled: true, task: "transcribe" }, diarization: { enabled: true, maxSpeakers: 35 }, locales: ["en-US"] };
  console.log("=== current production config (no profanity setting) ===");
  await call("default", base);
  console.log("=== profanityFilterMode variants ===");
  for (const mode of ["None", "Removed", "Tags", "Masked"]) {
    await call(`profanityFilterMode=${mode}`, { ...base, profanityFilterMode: mode });
  }
})();
