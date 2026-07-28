/**
 * Probe round 2. Round 1 turned up two things that change the design:
 *
 *  a) Azure returns the BILLED QUANTITY in a response header —
 *     `csp-billing-usage: CognitiveServices.SpeechServices.LLMSpeechTranscribe=82`
 *     for an 81.3 s file. So cost is directly measurable per request, and the
 *     meter has a name we can look up. Confirm the unit is seconds (not
 *     minutes/hours) by testing files of different lengths, and find out whether
 *     mai-transcribe bills to the SAME meter (same price) or a different one.
 *
 *  b) `enhancedMode.model: "mai-transcribe-1.5"` is ACCEPTED on our resource.
 *     That model is NAMED and PINNABLE, which is exactly the governance blocker
 *     the default model fails. Worth knowing what it can and cannot do before
 *     deciding whether it deserves an arm.
 *
 * Also: does the default model support any entity-biasing (phraseList / prompt)?
 * §15.5a ("UNAT" for "UN80", 50 times) is the worst known defect and hinges on this.
 */
import "../../../lib/load-env";
import fs from "fs";

const AZ_KEY = process.env.AZURE_SPEECH_KEY!;
const AZ_EP = process.env.AZURE_SPEECH_ENDPOINT!.replace(/\/$/, "");
const URL = `${AZ_EP}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`;

const SHORT = "/Volumes/SSDAStorage/un-en-bakeoff/audio-derived/S_PV.9675_en_64k.mp3"; // 81.3 s
const MED = "/Volumes/SSDAStorage/un-en-bakeoff/audio-derived/S_PV.10100_en_64k.mp3"; // 274.4 s

async function call(label: string, file: string, definition: unknown) {
  const bytes = fs.readFileSync(file);
  const form = new FormData();
  form.append("audio", new Blob([bytes], { type: "audio/mpeg" }), "a.mp3");
  form.append("definition", JSON.stringify(definition));
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(URL, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": AZ_KEY },
      body: form,
    });
  } catch (e) {
    console.log(`  [${label}] NETWORK ERROR: ${(e as Error).message}`);
    return null;
  }
  const ms = Date.now() - t0;
  const billing = res.headers.get("csp-billing-usage");
  const region = res.headers.get("x-ms-region");
  const body = await res.text();
  if (!res.ok) {
    console.log(`  [${label}] HTTP ${res.status} (${ms} ms) billing=${billing} — ${body.slice(0, 260)}`);
    return null;
  }
  const j = JSON.parse(body);
  const text = (j.combinedPhrases || []).map((c: any) => c.text).join(" ");
  const spk = new Set((j.phrases || []).map((p: any) => p.speaker));
  const hasWords = (j.phrases || []).some((p: any) => p.words?.length);
  console.log(
    `  [${label}] HTTP 200 (${ms} ms) billing="${billing}" region=${region}\n` +
      `      chars=${text.length} phrases=${j.phrases?.length} speakers=${spk.size} words=${hasWords} durMs=${j.durationMilliseconds}`,
  );
  return { ms, json: j, text, billing };
}

(async () => {
  console.log("\n=== A: billing unit — same audio, two lengths, default model ===");
  console.log("  (81.3 s file and 274.4 s file; if the meter is seconds we expect ~82 and ~275)");
  await call("default/81s", SHORT, {
    enhancedMode: { enabled: true, task: "transcribe" },
    diarization: { enabled: true, maxSpeakers: 20 },
    locales: ["en-US"],
  });
  await call("default/274s", MED, {
    enhancedMode: { enabled: true, task: "transcribe" },
    diarization: { enabled: true, maxSpeakers: 20 },
    locales: ["en-US"],
  });

  console.log("\n=== B: does NON-enhanced (classic) fast transcription bill to a different meter? ===");
  await call("classic/81s", SHORT, { locales: ["en-US"] });
  await call("classic-diar/81s", SHORT, {
    locales: ["en-US"],
    diarization: { enabled: true, maxSpeakers: 20 },
  });

  console.log("\n=== C: mai-transcribe-1.5 — capabilities and meter ===");
  const mai = await call("mai/81s", SHORT, {
    enhancedMode: { enabled: true, task: "transcribe", model: "mai-transcribe-1.5" },
    locales: ["en-US"],
  });
  if (mai)
    fs.writeFileSync(
      "/Volumes/SSDAStorage/un-en-bakeoff/logs/probe-mai-default.json",
      JSON.stringify(mai.json, null, 2),
    );
  console.log("  -- mai + diarization (docs say unsupported; confirm):");
  await call("mai+diar", SHORT, {
    enhancedMode: { enabled: true, task: "transcribe", model: "mai-transcribe-1.5" },
    diarization: { enabled: true, maxSpeakers: 20 },
    locales: ["en-US"],
  });
  console.log("  -- mai + transcribeStyle verbatim:");
  await call("mai+verbatim", SHORT, {
    enhancedMode: {
      enabled: true,
      task: "transcribe",
      model: "mai-transcribe-1.5",
      transcribeStyle: "verbatim",
    },
    locales: ["en-US"],
  });

  console.log("\n=== D: ENTITY BIASING — the §15.5a blocker. Does anything take a phrase list? ===");
  const PHRASES = ["UN80", "UN80 Initiative", "Starobelsk", "Nebenzia"];
  console.log("  -- default model + enhancedMode.phraseList:");
  await call("default+phraseList", SHORT, {
    enhancedMode: { enabled: true, task: "transcribe", phraseList: PHRASES },
    locales: ["en-US"],
  });
  console.log("  -- default model + top-level phraseList:");
  await call("default+topPhraseList", SHORT, {
    enhancedMode: { enabled: true, task: "transcribe" },
    phraseList: PHRASES,
    locales: ["en-US"],
  });
  console.log("  -- default model + prompt:");
  await call("default+prompt", SHORT, {
    enhancedMode: {
      enabled: true,
      task: "transcribe",
      prompt: "This is a UN Security Council meeting. Key terms: UN80 Initiative.",
    },
    locales: ["en-US"],
  });
  console.log("  -- mai-transcribe-1.5 + phraseList:");
  await call("mai+phraseList", SHORT, {
    enhancedMode: {
      enabled: true,
      task: "transcribe",
      model: "mai-transcribe-1.5",
      phraseList: PHRASES,
    },
    locales: ["en-US"],
  });

  console.log("\n=== E: maxSpeakers ceiling — is 20 a hard cap? ===");
  for (const n of [36, 50]) {
    await call(`maxSpeakers=${n}`, SHORT, {
      enhancedMode: { enabled: true, task: "transcribe" },
      diarization: { enabled: true, maxSpeakers: n },
      locales: ["en-US"],
    });
  }

  console.log("\n=== F: determinism — same request twice, is the output identical? ===");
  const r1 = await call("determinism/1", SHORT, {
    enhancedMode: { enabled: true, task: "transcribe" },
    diarization: { enabled: true, maxSpeakers: 20 },
    locales: ["en-US"],
  });
  const r2 = await call("determinism/2", SHORT, {
    enhancedMode: { enabled: true, task: "transcribe" },
    diarization: { enabled: true, maxSpeakers: 20 },
    locales: ["en-US"],
  });
  if (r1 && r2)
    console.log(
      `  identical text? ${r1.text === r2.text}  (len ${r1.text.length} vs ${r2.text.length})`,
    );

  console.log("\n=== probes 2 done ===");
})();
