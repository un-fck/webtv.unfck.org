/**
 * Pre-run API probes for the en bake-off. Answers the PLAN's open questions
 * empirically before any money is spent:
 *   1. Does Azure fast transcription enhanced mode accept a URL instead of a
 *      multipart upload? (If yes, confound C2 largely dissolves.)
 *   2. What does the enhanced-mode response actually carry — is there ANY model
 *      or version identifier we could pin or at least record?
 *   3. Does AssemblyAI /v2/upload work, and what does it cost in wall clock?
 *   4. Which speech_model actually serves an English request?
 *
 * Uses the shortest corpus file (S/PV.9675, 81 s) so probes are ~free.
 */
import "../../../lib/load-env";
import fs from "fs";

const AZ_KEY = process.env.AZURE_SPEECH_KEY!;
const AZ_EP = process.env.AZURE_SPEECH_ENDPOINT!.replace(/\/$/, "");
const AAI_KEY = process.env.ASSEMBLYAI_API_KEY!;

const MP3 = "/Volumes/SSDAStorage/un-en-bakeoff/audio-derived/S_PV.9675_en_64k.mp3";

function log(...a: unknown[]) {
  console.log(...a);
}

async function probeAzureMultipart() {
  log("\n=== PROBE 1: Azure enhanced mode, multipart (the config we use) ===");
  const bytes = fs.readFileSync(MP3);
  const form = new FormData();
  form.append("audio", new Blob([bytes], { type: "audio/mpeg" }), "a.mp3");
  form.append(
    "definition",
    JSON.stringify({
      enhancedMode: { enabled: true, task: "transcribe" },
      diarization: { enabled: true, maxSpeakers: 20 },
      locales: ["en-US"],
    }),
  );
  const t0 = Date.now();
  const res = await fetch(
    `${AZ_EP}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`,
    { method: "POST", headers: { "Ocp-Apim-Subscription-Key": AZ_KEY }, body: form },
  );
  const ms = Date.now() - t0;
  log(`  HTTP ${res.status} in ${ms} ms  (${(bytes.length / 1024).toFixed(0)} KB uploaded)`);
  log(`  response headers:`);
  for (const [k, v] of res.headers.entries()) log(`    ${k}: ${v}`);
  const body = await res.text();
  if (!res.ok) {
    log(`  BODY: ${body.slice(0, 1500)}`);
    return null;
  }
  const j = JSON.parse(body);
  log(`  top-level keys: ${Object.keys(j).join(", ")}`);
  log(`  durationMilliseconds: ${j.durationMilliseconds}`);
  log(`  phrases: ${j.phrases?.length}  combinedPhrases: ${j.combinedPhrases?.length}`);
  if (j.phrases?.[0])
    log(`  phrase[0] keys: ${Object.keys(j.phrases[0]).join(", ")}`);
  if (j.phrases?.[0]?.words?.[0])
    log(`  word[0] keys: ${Object.keys(j.phrases[0].words[0]).join(", ")}`);
  const speakers = new Set(j.phrases?.map((p: any) => p.speaker));
  log(`  distinct speakers: ${speakers.size} -> ${[...speakers].join(",")}`);
  log(`  chars of text: ${(j.combinedPhrases || []).map((c: any) => c.text).join(" ").length}`);
  fs.writeFileSync(
    "/Volumes/SSDAStorage/un-en-bakeoff/logs/probe-azure-multipart.json",
    JSON.stringify(j, null, 2),
  );
  return { ms, json: j };
}

async function probeAzureUrl() {
  log("\n=== PROBE 2: Azure enhanced mode with a URL instead of a file ===");
  // Try the two plausible shapes documented for the batch API, against the
  // fast-transcription route, to see whether either is accepted.
  for (const shape of [
    { name: "contentUrls in definition", def: { contentUrls: ["https://example.com/a.mp3"], enhancedMode: { enabled: true, task: "transcribe" }, locales: ["en-US"] } },
    { name: "audioUrl in definition", def: { audioUrl: "https://example.com/a.mp3", enhancedMode: { enabled: true, task: "transcribe" }, locales: ["en-US"] } },
  ]) {
    const form = new FormData();
    form.append("definition", JSON.stringify(shape.def));
    const res = await fetch(
      `${AZ_EP}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`,
      { method: "POST", headers: { "Ocp-Apim-Subscription-Key": AZ_KEY }, body: form },
    );
    const body = await res.text();
    log(`  [${shape.name}] HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
}

async function probeAzureApiVersions() {
  log("\n=== PROBE 3: which api-versions answer, and do they differ? ===");
  const bytes = fs.readFileSync(MP3);
  for (const v of [
    "2024-11-15",
    "2025-05-15-preview",
    "2025-10-15",
    "2026-01-15-preview",
    "2099-01-01",
  ]) {
    const form = new FormData();
    form.append("audio", new Blob([bytes], { type: "audio/mpeg" }), "a.mp3");
    form.append(
      "definition",
      JSON.stringify({
        enhancedMode: { enabled: true, task: "transcribe" },
        locales: ["en-US"],
      }),
    );
    const t0 = Date.now();
    const res = await fetch(
      `${AZ_EP}/speechtotext/transcriptions:transcribe?api-version=${v}`,
      { method: "POST", headers: { "Ocp-Apim-Subscription-Key": AZ_KEY }, body: form },
    );
    const ms = Date.now() - t0;
    const body = await res.text();
    let note = "";
    if (res.ok) {
      const j = JSON.parse(body);
      const txt = (j.combinedPhrases || []).map((c: any) => c.text).join(" ");
      note = `${txt.length} chars, ${j.phrases?.length} phrases`;
    } else {
      note = body.slice(0, 200);
    }
    log(`  api-version=${v}: HTTP ${res.status} (${ms} ms) — ${note}`);
  }
}

async function probeAzureModelParam() {
  log("\n=== PROBE 4: is the default model nameable/pinnable at all? ===");
  const bytes = fs.readFileSync(MP3);
  for (const model of [
    "mai-transcribe-1.5",
    "default",
    "speech-llm",
    "latest",
  ]) {
    const form = new FormData();
    form.append("audio", new Blob([bytes], { type: "audio/mpeg" }), "a.mp3");
    form.append(
      "definition",
      JSON.stringify({
        enhancedMode: { enabled: true, task: "transcribe", model },
        locales: ["en-US"],
      }),
    );
    const res = await fetch(
      `${AZ_EP}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`,
      { method: "POST", headers: { "Ocp-Apim-Subscription-Key": AZ_KEY }, body: form },
    );
    const body = await res.text();
    let note = "";
    if (res.ok) {
      const j = JSON.parse(body);
      const txt = (j.combinedPhrases || []).map((c: any) => c.text).join(" ");
      note = `OK — ${txt.length} chars, ${j.phrases?.length} phrases, keys=${Object.keys(j).join(",")}`;
    } else note = body.slice(0, 300);
    log(`  model="${model}": HTTP ${res.status} — ${note}`);
  }
}

async function probeAssemblyUpload() {
  log("\n=== PROBE 5: AssemblyAI /v2/upload + transcribe on the same MP3 ===");
  const bytes = fs.readFileSync(MP3);
  const t0 = Date.now();
  const up = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { authorization: AAI_KEY, "content-type": "application/octet-stream" },
    body: bytes,
  });
  const tUpload = Date.now() - t0;
  if (!up.ok) {
    log(`  upload FAILED ${up.status}: ${await up.text()}`);
    return;
  }
  const { upload_url } = (await up.json()) as { upload_url: string };
  log(`  upload OK in ${tUpload} ms (${(bytes.length / 1024).toFixed(0)} KB) -> ${upload_url.slice(0, 60)}...`);

  const t1 = Date.now();
  const sub = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: { authorization: AAI_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      audio_url: upload_url,
      speaker_labels: true,
      language_code: "en",
      speech_models: ["universal-3-5-pro", "universal-2"],
    }),
  });
  if (!sub.ok) {
    log(`  submit FAILED ${sub.status}: ${await sub.text()}`);
    return;
  }
  const { id } = (await sub.json()) as { id: string };
  let result: any;
  for (;;) {
    await new Promise((r) => setTimeout(r, 1000));
    const p = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { authorization: AAI_KEY },
    });
    result = await p.json();
    if (result.status === "completed" || result.status === "error") break;
  }
  const tJob = Date.now() - t1;
  log(`  transcript status=${result.status} in ${tJob} ms (1 s polling)`);
  log(`  top-level keys: ${Object.keys(result).join(", ")}`);
  log(`  speech_model=${result.speech_model} speech_model_used=${result.speech_model_used}`);
  log(`  language_code=${result.language_code} audio_duration=${result.audio_duration}`);
  log(`  utterances=${result.utterances?.length} words=${result.words?.length} chars=${result.text?.length}`);
  const spk = new Set((result.utterances || []).map((u: any) => u.speaker));
  log(`  distinct speakers: ${spk.size} -> ${[...spk].join(",")}`);
  fs.writeFileSync(
    "/Volumes/SSDAStorage/un-en-bakeoff/logs/probe-assemblyai-upload.json",
    JSON.stringify(result, null, 2),
  );
}

(async () => {
  await probeAzureMultipart();
  await probeAzureUrl();
  await probeAzureApiVersions();
  await probeAzureModelParam();
  await probeAssemblyUpload();
  log("\n=== probes done ===");
})();
