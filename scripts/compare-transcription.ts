#!/usr/bin/env tsx
import '../lib/load-env';
import { resolveEntryId } from '../lib/kaltura-helpers';
import { getKalturaAudioUrl } from '../lib/transcription';
import { assemblyai } from '../eval/providers/assemblyai';
import { azureOpenai } from '../eval/providers/azure-openai';
import { downloadAudioToTemp, formatTime } from '../eval/utils';
import type { NormalizedTranscript } from '../eval/providers/types';
import fs from 'fs';
import path from 'path';

const usage = `Usage:
  npm run compare-transcribe -- <asset-id|entry-id>

Runs both Azure OpenAI gpt-4o-transcribe-diarize and AssemblyAI on the same
UN Web TV video, writing results to two .txt files for easy diff comparison.`;

const rawArg = process.argv[2];
if (!rawArg) {
  console.error(usage);
  process.exit(1);
}
const decodedArg = decodeURIComponent(rawArg.trim());

const outputDir = path.join(process.cwd(), 'transcription-comparisons');

function transcriptToText(t: NormalizedTranscript): string {
  if (t.utterances.length > 0) {
    return t.utterances.map((u, i) =>
      `[${i + 1}] Speaker ${u.speaker} (${formatTime(u.start)} - ${formatTime(u.end)})\n${u.text}\n`
    ).join('\n');
  }
  return t.fullText;
}

async function main() {
  const entryId = await resolveEntryId(decodedArg);
  if (!entryId) throw new Error(`Could not resolve entry ID for: ${decodedArg}`);

  console.log(`Entry ID: ${entryId}`);
  const { audioUrl } = await getKalturaAudioUrl(entryId);
  console.log(`Audio URL: ${audioUrl}\n`);

  fs.mkdirSync(outputDir, { recursive: true });

  // Download audio once, shared between providers
  const tmpPath = await downloadAudioToTemp(audioUrl);

  try {
    const [azureTranscript, assemblyTranscript] = await Promise.all([
      azureOpenai.transcribe(audioUrl, { audioFilePath: tmpPath }),
      assemblyai.transcribe(audioUrl),
    ]);

    // Save raw JSON for debugging
    fs.writeFileSync(path.join(outputDir, `${entryId}_azure_raw.json`), JSON.stringify(azureTranscript.raw, null, 2));
    fs.writeFileSync(path.join(outputDir, `${entryId}_assemblyai_raw.json`), JSON.stringify(assemblyTranscript.raw, null, 2));

    const azureFile = path.join(outputDir, `${entryId}_azure.txt`);
    const assemblyFile = path.join(outputDir, `${entryId}_assemblyai.txt`);
    fs.writeFileSync(azureFile, transcriptToText(azureTranscript));
    fs.writeFileSync(assemblyFile, transcriptToText(assemblyTranscript));

    console.log(`\n✓ Results written to:`);
    console.log(`  Azure:      ${azureFile}`);
    console.log(`  AssemblyAI: ${assemblyFile}`);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
