#!/usr/bin/env tsx
/**
 * Uploads eval results to united-nations/transcription-results.
 *
 * Dataset structure:
 *   results.jsonl         — one row per (symbol, language, provider)
 *   raw/{symbol}/{provider}_{lang}.json  — full transcript JSON
 *   README.md
 *
 * Usage:
 *   npm run hf:upload-results
 *   npm run hf:upload-results -- --dry-run
 */
import "../../lib/load-env";
import fs from "fs";
import path from "path";
import { uploadFiles, createRepo } from "@huggingface/hub";

const HF_TOKEN = process.env.HF_TOKEN!;
const HF_REPO = "united-nations/transcription-results";
const RESULTS_DIR = path.join(__dirname, "..", "results");
const DRY_RUN = process.argv.includes("--dry-run");

const README_CONTENT = `---
license: cc-by-4.0
task_categories:
- automatic-speech-recognition
language:
- en
- fr
- es
- ar
- zh
- ru
tags:
- multilingual
- speech
- united-nations
- evaluation
- benchmark
pretty_name: UN Transcription Benchmark Results
size_categories:
- n<1K
---

# UN Transcription Benchmark Results

Evaluation results for speech-to-text systems on UN Security Council and General Assembly meeting recordings, assessed against official UN verbatim records.

See [united-nations/transcription-corpus](https://huggingface.co/datasets/united-nations/transcription-corpus) for the underlying audio and ground truth data.

## Metrics

- **WER**: Word Error Rate (reference = verbatim record, no normalization)
- **normalized_wer**: WER after lowercasing, punctuation removal, and filler word removal
- **CER**: Character Error Rate (same reference, no normalization)
- **normalized_cer**: CER after normalization

**Note**: WER of 20–40% is expected for high-quality transcription on these recordings due to the editing gap between live speech and published verbatim records. For Chinese, use CER as the primary metric (Chinese text has no word boundaries).

## Providers Evaluated

| Provider | Model | Pricing |
|---|---|---|
| \`assemblyai\` | AssemblyAI Universal-2 (diarization enabled) | ~$0.27/hr |
| \`azure-openai\` | Azure OpenAI gpt-4o-transcribe-diarize | ~$0.06/hr |
| \`elevenlabs\` | ElevenLabs Scribe v2 | ~$0.40/hr |
| \`azure-speech\` | Azure Cognitive Services Speech Batch Transcription | ~$0.36/hr |
| \`gemini\` | Gemini 3 Flash (structured diarization via prompt) | ~$0.01/hr |
| \`google-chirp\` | Google Cloud Chirp 3 (Speech V2 API) | ~$0.016/min |

## Schema

| Column | Type | Description |
|---|---|---|
| symbol | string | UN document symbol, e.g. \`S/PV.10100\` |
| assetId | string | UN Web TV asset ID |
| language | string | ISO 639-1 code |
| provider | string | Transcription provider name |
| wer | float | Word Error Rate (0–1) |
| normalized_wer | float | Normalized WER (0–1) |
| cer | float | Character Error Rate (0–1) |
| normalized_cer | float | Normalized CER (0–1) |
| substitutions | int | Number of word substitutions |
| insertions | int | Number of word insertions |
| deletions | int | Number of word deletions |
| ref_length | int | Reference word count |
| hyp_length | int | Hypothesis word count |
| duration_ms | int | Audio duration in ms |
| timestamp | string | ISO 8601 evaluation timestamp |
`;

async function main() {
  const summaryPath = path.join(RESULTS_DIR, "summary.json");
  if (!fs.existsSync(summaryPath)) {
    console.error(
      `No summary.json found at ${summaryPath}. Run npm run eval first.`,
    );
    process.exit(1);
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
  console.log(`Found ${summary.length} result rows.`);

  if (DRY_RUN) {
    console.log("DRY RUN — would upload:");
    console.log(`  results.jsonl (${summary.length} rows)`);
    const rawFiles = collectRawFiles();
    console.log(`  ${rawFiles.length} raw transcript JSON files`);
    return;
  }

  const credentials = { accessToken: HF_TOKEN };
  try {
    await createRepo({ repo: { type: "dataset", name: HF_REPO }, credentials });
  } catch (err: unknown) {
    if (!(err instanceof Error && err.message.includes("already created")))
      throw err;
  }

  const files: Array<{ path: string; content: Blob }> = [];

  // README
  files.push({ path: "README.md", content: new Blob([README_CONTENT]) });

  // results.jsonl
  const resultsJsonl =
    summary.map((r: object) => JSON.stringify(r)).join("\n") + "\n";
  files.push({ path: "results.jsonl", content: new Blob([resultsJsonl]) });

  // Raw transcript JSON files
  for (const { hfPath, localPath } of collectRawFiles()) {
    files.push({
      path: hfPath,
      content: new Blob([fs.readFileSync(localPath)]),
    });
  }

  console.log(`Uploading ${files.length} files to ${HF_REPO}...`);

  await uploadFiles({
    repo: { type: "dataset", name: HF_REPO },
    credentials,
    files,
    commitTitle: `Update results: ${summary.length} rows, ${new Date().toISOString().split("T")[0]}`,
  });

  console.log(`\nDone! https://huggingface.co/datasets/${HF_REPO}`);
}

function collectRawFiles(): Array<{ hfPath: string; localPath: string }> {
  const rawDir = path.join(RESULTS_DIR, "raw");
  if (!fs.existsSync(rawDir)) return [];

  const files: Array<{ hfPath: string; localPath: string }> = [];
  for (const sessionDir of fs.readdirSync(rawDir)) {
    const sessionPath = path.join(rawDir, sessionDir);
    if (!fs.statSync(sessionPath).isDirectory()) continue;
    for (const file of fs.readdirSync(sessionPath)) {
      if (!file.endsWith(".json")) continue;
      files.push({
        hfPath: `raw/${sessionDir}/${file}`,
        localPath: path.join(sessionPath, file),
      });
    }
  }
  return files;
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
