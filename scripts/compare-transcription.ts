#!/usr/bin/env tsx
import "../lib/load-env";
import { resolveEntryId } from "../lib/kaltura-helpers";
import { getKalturaAudioUrl } from "../lib/transcription";
import { getProvider } from "../lib/providers/registry";
import { downloadAudioToTemp, formatTime } from "../lib/providers/utils";
import type { NormalizedTranscript } from "../lib/providers/types";
import fs from "fs";
import path from "path";

const usage = `Usage:
  pnpm compare-transcribe -- <asset-id|entry-id> [provider]

Transcribes a UN Web TV video with a single provider and saves the result
to transcription-comparisons/<entryId>/<provider>.txt (and _raw.json).
Run multiple times with different providers to compare side-by-side.

Provider defaults to "gemini". Available providers: gemini, gemini-eval,
assemblyai, azure-openai, elevenlabs, azure-speech, google-chirp,
groq-whisper, alibaba, deepgram, mistral, cohere`;

const [rawArg, providerName = "gemini"] = process.argv.slice(2);
if (!rawArg) {
  console.error(usage);
  process.exit(1);
}
const decodedArg = decodeURIComponent(rawArg.trim());

function transcriptToText(t: NormalizedTranscript): string {
  if (t.utterances.length > 0) {
    return t.utterances
      .map(
        (u, i) =>
          `[${i + 1}] Speaker ${u.speaker} (${formatTime(u.start)} - ${formatTime(u.end)})\n${u.text}\n`,
      )
      .join("\n");
  }
  return t.fullText;
}

async function main() {
  const provider = getProvider(providerName);

  const entryId = await resolveEntryId(decodedArg);
  if (!entryId)
    throw new Error(`Could not resolve entry ID for: ${decodedArg}`);

  console.log(`Entry ID:  ${entryId}`);
  console.log(`Provider:  ${providerName}`);

  const { audioUrl } = await getKalturaAudioUrl(entryId);
  console.log(`Audio URL: ${audioUrl}\n`);

  const outputDir = path.join(process.cwd(), "transcription-comparisons", entryId);
  fs.mkdirSync(outputDir, { recursive: true });

  const tmpPath = await downloadAudioToTemp(audioUrl);

  try {
    const transcript = await provider.transcribe(audioUrl, { audioFilePath: tmpPath });

    const safeProvider = providerName.replace(/[^a-z0-9-]/gi, "_");
    fs.writeFileSync(
      path.join(outputDir, `${safeProvider}_raw.json`),
      JSON.stringify(transcript.raw, null, 2),
    );
    const txtFile = path.join(outputDir, `${safeProvider}.txt`);
    fs.writeFileSync(txtFile, transcriptToText(transcript));

    console.log(`✓ Results written to:`);
    console.log(`  ${txtFile}`);
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
