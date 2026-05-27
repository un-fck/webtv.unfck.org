#!/usr/bin/env tsx
// Experiment: give Gemini its OWN transcript (containing the hallucinated name
// "Natalia Kanem" for Diene Keita) + the source audio, and ask it — in plain
// text, no structured output — to flag errors. Run identically for both Gemini
// models. Same audio excerpt + same transcript for both.
import "@/lib/load-env";
import fs from "fs";
import {
  GEMINI_API_KEY,
  GEMINI_BASE as BASE,
  httpsPostJson,
  uploadFileToGemini,
  waitForGeminiFile,
  deleteGeminiFile,
  extractAudioChunk,
} from "@/lib/gemini-utils";

const AUDIO = "eval/corpus-data/audio/UN80-Apr06-keita_en.m4a";
const START = 16 * 60,
  DUR = 10 * 60; // 16:00–26:00 window
const MODELS = ["gemini-3-flash-preview", "gemini-3.5-flash"];

function buildTranscriptExcerpt(): string {
  const d = JSON.parse(
    fs.readFileSync(
      "eval/results/raw/UN80-Apr06-keita/gemini_en.json",
      "utf-8",
    ),
  );
  const lo = START * 1000,
    hi = (START + DUR) * 1000;
  const lines = d.utterances
    .filter((u: any) => u.start >= lo && u.start < hi)
    .map((u: any) => {
      const s = Math.floor(u.start / 1000);
      return `[${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}] Speaker ${u.speaker}: ${u.text}`;
    });
  return lines.join("\n");
}

const PROMPT = (excerpt: string) =>
  [
    "You are reviewing an automatically-generated transcript against its source audio.",
    "The audio is a ~10-minute excerpt of a United Nations General Assembly meeting.",
    "Below is the transcript produced for this exact excerpt.",
    "",
    "Listen to the audio carefully and identify ANY errors in the transcript —",
    "especially incorrect or mis-transcribed speaker NAMES, but also wrong words,",
    "omissions, or insertions. For each error, quote the transcript text and give the",
    "correction you hear in the audio. If the transcript is fully correct, say so.",
    "Answer in plain prose. Do not output JSON.",
    "",
    "TRANSCRIPT:",
    excerpt,
  ].join("\n");

async function reviewWith(
  model: string,
  fileUri: string,
  excerpt: string,
): Promise<string> {
  const body = {
    contents: [
      {
        parts: [
          { fileData: { mimeType: "audio/mp4", fileUri } },
          { text: PROMPT(excerpt) },
        ],
      },
    ],
    generationConfig: { temperature: 0, maxOutputTokens: 8192 },
  };
  const r = await httpsPostJson(
    `${BASE}/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    body,
  );
  if (r.status !== 200)
    return `[API error ${r.status}] ${r.body.slice(0, 300)}`;
  const raw = JSON.parse(r.body);
  return (
    (raw.candidates?.[0]?.content?.parts || [])
      .map((p: any) => p.text || "")
      .join("")
      .trim() || `[empty: ${JSON.stringify(raw.candidates?.[0]?.finishReason)}]`
  );
}

async function main() {
  const excerpt = buildTranscriptExcerpt();
  console.log(
    "=== TRANSCRIPT EXCERPT GIVEN TO BOTH MODELS (16:00–26:00) ===\n" +
      excerpt +
      "\n",
  );
  console.log("Extracting audio excerpt...");
  const chunk = await extractAudioChunk(AUDIO, START, DUR, "selfcheck");
  console.log("Uploading once, reusing for both models...");
  const file = await uploadFileToGemini(chunk, "selfcheck");
  await waitForGeminiFile(file.name, true);
  try {
    for (const m of MODELS) {
      console.log(
        `\n${"=".repeat(70)}\n### ${m} — error review (plain text)\n${"=".repeat(70)}`,
      );
      console.log(await reviewWith(m, file.uri, excerpt));
    }
  } finally {
    await deleteGeminiFile(file.name);
    try {
      fs.unlinkSync(chunk);
    } catch {}
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
