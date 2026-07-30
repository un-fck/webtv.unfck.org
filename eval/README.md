# UN Transcription Eval

Benchmarks speech-to-text providers against official UN verbatim records (PV documents).
Uses UN Web TV audio + documents.un.org ground truth across all 6 UN official languages.

**Live dashboard**: [huggingface.co/spaces/united-nations/transcription-benchmark](https://huggingface.co/spaces/united-nations/transcription-benchmark)

**Datasets**: [transcription-corpus](https://huggingface.co/datasets/united-nations/transcription-corpus) &middot; [transcription-results](https://huggingface.co/datasets/united-nations/transcription-results)

## Quick Start

```bash
# Run eval on all sessions in corpus/sessions.json with all providers
npm run eval

# Single session, single provider, single language
npm run eval -- --symbol=S/PV.9826 --providers=assemblyai-universal-3-5-pro --languages=en

# All sessions, English only
npm run eval -- --languages=en
```

## How It Works

For each session × language × provider:

1. Fetches audio URL from Kaltura (UN Web TV's CDN), for the requested language track
2. Fetches the PV document PDF from documents.un.org in the same language
3. Runs the transcription provider on the audio
4. Computes WER and CER against the verbatim record
5. Computes **omission** against the *audio* — seconds of speech energy with no transcript word over it

**Expected WER**: 15–40% even for excellent transcription, because verbatim records are professionally edited (fillers removed, grammar cleaned). This is documented in results.

**Omission is a mandatory criterion and not interchangeable with WER.** An omitted sentence and a misrecognised one score the same WER, but only the omission is invisible to a reader — and on a UN verbatim record an invisible deletion reads as deliberate removal. English was moved off AssemblyAI on 2026-07-30 for exactly this (see `analysis/SYNTHESIS.md` §16). Because it is scored from the audio it needs no PV, so it works on any session in any language. No provider may be selected on WER alone.

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

Provider implementations live in `lib/providers/` (shared with the main app). The eval runner imports them through `lib/providers/registry.ts`. Command names (registry keys) follow `{vendor}-{model}`. Production language routing lives in `lib/providers/config.ts` (`STT_ROUTING`).

| Provider                   | Command name (`--providers`) | Model                     | Pricing     |
| -------------------------- | ---------------------------- | ------------------------- | ----------- |
| AssemblyAI Universal-2     | `assemblyai-universal-2`     | universal-2               | ~$0.27/hr   |
| AssemblyAI Universal-3 Pro | `assemblyai-universal-3-pro` | universal-3-pro           | ~$0.21/hr   |
| AssemblyAI Universal-3.5 Pro | `assemblyai-universal-3-5-pro` | universal-3-5-pro     | ~$0.21/hr   |
| Azure OpenAI               | `azure-gpt-4o-transcribe`    | gpt-4o-transcribe         | ~$0.06/hr   |
| ElevenLabs                 | `elevenlabs-scribe-v2`       | Scribe v2                 | ~$0.40/hr   |
| Azure Speech               | `azure-speech-batch`         | Cognitive Services Batch  | ~$0.36/hr   |
| Gemini 3 Flash             | `gemini-3-flash`             | gemini-3-flash-preview    | ~$0.01/hr   |
| Gemini 3.5 Flash           | `gemini-3.5-flash`           | gemini-3.5-flash          | ~$0.03/hr   |
| Google Chirp               | `google-chirp-3`             | Chirp 3 (Speech V2 API)   | ~$0.016/min |
| Groq                       | `groq-whisper-large-v3`      | whisper-large-v3          | varies      |
| Alibaba Qwen3-ASR          | `alibaba-qwen3-asr`          | qwen3-asr-flash-filetrans | varies      |
| Alibaba Qwen3.5-Omni       | `alibaba-qwen3.5-omni`       | qwen3.5-omni-plus         | varies      |
| Alibaba Fun-ASR            | `alibaba-fun-asr`            | fun-asr (diarization)     | varies      |
| Deepgram                   | `deepgram-nova-3`            | Nova-3                    | varies      |
| Mistral Voxtral Mini       | `mistral-voxtral-mini`       | voxtral-mini-latest       | varies      |
| Mistral Voxtral Small      | `mistral-voxtral-small`      | voxtral-small-latest      | varies      |
| Cohere                     | `cohere`                     | cohere-transcribe-03-2026 | varies      |

Add a provider by implementing the `TranscriptionProvider` interface (`lib/providers/types.ts`) and registering it in `lib/providers/registry.ts`.

## Results

Raw results: `eval/results/raw/{symbol}/{provider}_{lang}.json`
Summary: `eval/results/summary.json`

Upload results to HuggingFace:

```bash
npm run hf:upload-results
```

## Dashboard

Interactive React dashboard comparing providers. Built with Vite, deployed to HuggingFace Spaces.

```bash
# Prepare data (aggregates results + ground truth into data.json)
cd eval/dashboard && npm run prepare-data

# Dev server
cd eval/dashboard && npm run dev

# Build for production
cd eval/dashboard && npm run build
```

Features:

- Provider ranking with 95% confidence intervals
- Per-language breakdown charts
- Side-by-side 3-column diff view (ground truth vs two providers)
- Word-level diff highlighting with substitution detection
- Punctuation-only change de-emphasis

## File Structure

```
eval/
  run.ts                    # Main runner — tsx eval/run.ts [options]
  config.ts                 # Language codes, constants

  ground-truth/             # PV document fetch + parse + normalize
  metrics/                  # WER / CER computation, text normalization,
                            #   omission.ts (+ negative controls in omission.test.ts)
  dashboard/                # Standalone Vite + React app (npm)
    src/App.tsx
    src/components/Leaderboard.tsx
    src/components/DiffView.tsx
    src/lib/diff.ts
    scripts/prepare-data.ts
  corpus/
    sessions.json           # Split 2 test set: [{symbol, assetId, notes}]
    discover-corpus.ts      # Auto-discover sessions from Web TV schedule
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
      metadata.jsonl
      audio/
    audio/
    metadata.jsonl

# Providers are NOT under eval/ — they live in lib/providers/ and are shared
# with the main app:
lib/providers/
  registry.ts               # Provider lookup by name
  types.ts                  # TranscriptionProvider interface
  config.ts, models.ts      # STT_ROUTING (per-language) and analysis-model env wiring
  convert.ts                # NormalizedTranscript → RawParagraph[] adapter
  gemini-production.ts      # Production Gemini provider (rich named speakers)
  gemini.ts                 # Eval Gemini provider (basic diarization)
  assemblyai.ts, azure-openai.ts, azure-speech.ts, elevenlabs.ts,
  google-chirp.ts, groq-whisper.ts, alibaba.ts, deepgram.ts,
  mistral.ts, cohere.ts
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
