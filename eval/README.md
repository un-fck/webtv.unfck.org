# UN Transcription Eval

Benchmarks ASR transcription providers against official UN verbatim records (PV documents).
Uses UN Web TV audio + documents.un.org ground truth across all 6 UN official languages.

Published as [united-nations/transcription-corpus](https://huggingface.co/datasets/united-nations/transcription-corpus) on HuggingFace.

## Quick Start

```bash
# Run eval on all sessions in corpus/sessions.json with all providers
npm run eval

# Single session, single provider, single language
npm run eval -- --symbol=S/PV.9826 --providers=assemblyai --languages=en

# All sessions, English only
npm run eval -- --languages=en
```

## How It Works

For each session × language × provider:
1. Fetches audio URL from Kaltura (UN Web TV's CDN), for the requested language track
2. Fetches the PV document PDF from documents.un.org in the same language
3. Runs the transcription provider on the audio
4. Computes WER and CER against the verbatim record

**Expected WER**: 15–40% even for excellent ASR, because verbatim records are professionally edited (fillers removed, grammar cleaned). This is documented in results.

## Corpus: Two Splits

### Split 1: `gadebate` — GA General Debate per-speech

~192 speeches from GA session 80 (2025). Each row = one country's speech.

- **Audio**: 7 tracks per speech (FL floor + EN/FR/ES/AR/ZH/RU), streamed from UN Radio S3 CDN
- **Text**: Original-language "as delivered" text from gadebate.un.org PDFs (nullable; quality varies)
- **Source**: gadebate.un.org sitemap + UN Radio S3

```bash
# Build metadata.jsonl (scrapes gadebate.un.org)
npm run hf:build-gadebate -- --sessions=80

# Push to HuggingFace (streams audio from S3 → writes Parquet row-by-row → uploads → deletes)
npm run hf:push-gadebate -- --sessions=80
```

Metadata lives in `eval/corpus-data/gadebate/metadata.jsonl`.

### Split 2: `sessions` — Whole sessions from UN Web TV

Sample of SC/GA sessions from 2024 with matched Kaltura audio + PV documents in all 6 languages.
Each row = one meeting session, up to 7 audio tracks + 6 PV language texts.

- **Audio**: Kaltura multi-language flavors (floor + EN/FR/ES/AR/ZH/RU)
- **Text**: Full session PV documents in all 6 UN languages
- **Source**: UN Web TV (Kaltura) + documents.un.org

```bash
# Discover sessions (scans Web TV schedule, verifies PV exists)
npm run hf:discover-corpus -- --year=2024 --target=30

# Download audio + PV text locally
npm run hf:upload-corpus

# Push to HuggingFace one session at a time (writes Parquet → uploads → deletes audio)
npm run hf:push-corpus
```

Sessions list: `eval/corpus/sessions.json` (20 sessions ≤ 90 min from 2024).

## Providers

| Provider | Command name | Languages | Notes |
|---|---|---|---|
| AssemblyAI | `assemblyai` | all 6 | Speaker diarization |
| Azure OpenAI (gpt-4o-transcribe) | `azure-openai` | en only | No diarization |
| ElevenLabs | `elevenlabs` | en only | — |

Add providers in `eval/providers/` implementing the `TranscriptionProvider` interface.

## Results

Raw results: `eval/results/raw/{symbol}/{provider}_{lang}.json`
Summary: `eval/results/summary.json`

Upload results to HuggingFace:
```bash
npm run hf:upload-results
```

## File Structure

```
eval/
  run.ts                    # Main runner — tsx eval/run.ts [options]
  config.ts                 # Language codes, constants
  utils.ts                  # downloadAudioToTemp, formatTime

  providers/
    types.ts                # TranscriptionProvider, NormalizedTranscript interfaces
    registry.ts             # Provider lookup by name
    assemblyai.ts           # AssemblyAI implementation
    azure-openai.ts         # Azure OpenAI gpt-4o-transcribe
    elevenlabs.ts           # ElevenLabs

  ground-truth/
    documents-api.ts        # Fetch PV PDFs from documents.un.org
    pdf-parser.ts           # Extract + parse speaker turns from PV PDFs
    normalizer.ts           # Strip headers, page numbers, normalize text
    resolver.ts             # Video asset ID → session symbol matching

  metrics/
    wer.ts                  # WER + CER via Levenshtein DP
    text-normalizer.ts      # Lowercase, strip punctuation, remove fillers
    index.ts                # computeMetrics(), computePairwiseMetrics()

  corpus/
    sessions.json           # Split 2 test set: [{symbol, assetId, notes}]
    discover-corpus.ts      # Auto-discover sessions from Web TV schedule
    discover-dev-sessions.ts # Find short sessions for dev iteration

  hf/
    build-gadebate.ts       # Scrape gadebate.un.org → metadata.jsonl
    push-gadebate.py        # Push split 1 to HuggingFace (uv run)
    upload-corpus.ts        # Download split 2 audio + PV text locally
    push-corpus.py          # Push split 2 to HuggingFace (uv run)
    upload-results.ts       # Upload eval results to HuggingFace

  results/                  # gitignored
    raw/{symbol}/{provider}_{lang}.json
    summary.json

  corpus-data/              # gitignored
    gadebate/
      metadata.jsonl        # Split 1 speech metadata
      audio/                # Cached audio (optional)
    audio/                  # Split 2 audio (temporary, deleted after push)
    metadata.jsonl          # Split 2 session metadata
```

## Session Symbols

The primary identifier throughout is the UN document symbol:
- Security Council: `S/PV.{meeting_number}` e.g. `S/PV.9826`
- General Assembly plenary: `A/{session}/PV.{meeting}` e.g. `A/79/PV.18`
- First Committee: `A/C.1/{session}/PV.{meeting}`

## Notes on Storage

Audio files are large (~7 tracks × MP3). Scripts are designed to minimize peak disk usage:
- `push-gadebate.py`: streams S3 audio into Parquet row-by-row, never holds all audio in RAM
- `push-corpus.py`: processes one session at a time, deletes audio after each upload

Expect ~12 GB peak disk for gadebate session 80, ~1-2 GB peak per split-2 session.
