# Evaluation System

The eval system benchmarks speech-to-text (STT) providers against official UN verbatim records. It measures how accurately each provider transcribes UN meeting audio across all six official languages, publishing results to a live HuggingFace dashboard.

## Ground Truth

Ground truth comes from UN **Procès-Verbal (PV) documents** — the official verbatim records of Security Council and General Assembly meetings. These are edited transcripts: fillers are removed, grammar is cleaned, and formatting is standardized. This means a "perfect" transcription will still show 15–40% WER against the PV text, which is inherent to the benchmark rather than a deficiency.

The pipeline fetches PV PDFs from the UN Documents API (`documents.un.org`), extracts text with `pdf-parse`, then strips boilerplate: page headers/footers, document symbols, table-of-contents entries, vote roll-call blocks, and speaker labels. The cleaned text is split into speaker turns using language-specific regex patterns. Results are cached locally to avoid repeated downloads.

PV symbol resolution maps video asset IDs to document symbols by scraping UN Web TV metadata — either from the video's `relatedDocuments` array or by parsing the meeting number from the video title (e.g., "10103rd meeting" → `S/PV.10103`).

## Audio

Audio is sourced from Kaltura, the UN's video hosting platform. For each session, the system resolves the Kaltura entry ID, queries available audio language tracks (floor + interpretation channels), and downloads each track. Audio files are cached in `eval/corpus-data/audio/` and shared across all providers for a given session/language combination.

## Providers

Ten STT providers are benchmarked:

| Provider | Model | Mechanism |
|---|---|---|
| AssemblyAI | Universal-2 | URL submission, polling |
| Azure OpenAI | gpt-4o-transcribe-diarize | File upload |
| Azure Speech | Cognitive Services Batch | Batch job submission, polling |
| Deepgram | Nova-3 | File upload |
| ElevenLabs | Scribe v2 | File upload |
| Gemini | gemini-3-flash-preview | File upload to Gemini Files API, structured prompt |
| Google Chirp | chirp_3 (Speech V2) | FLAC conversion, GCS upload, batch recognition |
| Groq | whisper-large-v3 | File upload, chunked for files >24 MB |
| Alibaba | Qwen3-ASR-Flash | 4-minute chunks, base64 encoded |
| Mistral | voxtral-mini-latest | File upload |

All providers produce a normalized transcript format: `{provider, language, fullText, utterances[], durationMs}`, where each utterance has a speaker label and start/end timestamps in milliseconds. Providers that support word-level timestamps (AssemblyAI, Deepgram, ElevenLabs, Azure Speech, Google Chirp, Cohere) also return `words[]` per utterance with per-word timing.

Provider implementations live in `lib/providers/` and are shared with the main application. The eval runner imports from this shared location.

Gemini is the only provider that accepts custom instructions (a structured JSON schema prompt). Providers that require local files (most of them) receive a downloaded copy; AssemblyAI works directly from the audio URL. Google Chirp requires GCP credentials and a GCS bucket for batch processing. Groq and Alibaba implement chunking logic to handle their respective size/duration limits.

## Languages

The six official UN languages:

| Code | Language | Notes |
|---|---|---|
| en | English | — |
| fr | French | — |
| es | Spanish | — |
| ar | Arabic | Google Chirp lacks diarization support |
| zh | Chinese | CER is the primary metric (no word boundaries) |
| ru | Russian | Google Chirp lacks diarization support |

Each language has a defined set of filler words (um, uh, euh, etc.) that are stripped during normalized metric computation.

## Metrics

Four metrics are computed for each (session, language, provider) combination:

- **WER** (Word Error Rate): Levenshtein edit distance on word arrays, divided by reference word count. `(substitutions + insertions + deletions) / reference_words`
- **CER** (Character Error Rate): Same formula but on character arrays (whitespace stripped). More meaningful for Chinese.
- **Normalized WER/CER**: Same computation after applying text normalization to both sides — lowercasing, removing punctuation, stripping filler words, and collapsing whitespace.

For large inputs, the system uses chunked computation (max 3,000 words or 10,000 characters per chunk) to keep the O(n×m) dynamic programming tractable. Both raw and normalized scores are stored, allowing comparison at different strictness levels.

Ground truth text is additionally cleaned before comparison: document boilerplate, page headers/footers, speaker labels, and vote roll-call blocks are removed via language-specific patterns.

## Corpus

The eval corpus is defined in `eval/corpus/sessions.json` — approximately 20 manually curated Security Council and General Assembly sessions from 2023–2024, ranging from 4 minutes to over 3 hours.

New sessions can be discovered automatically via `pnpm hf:discover-corpus`, which scans UN Web TV schedules across a year, derives PV symbols from video titles, verifies PV documents exist, and produces a stratified sample (60% Security Council, 30% General Assembly, 10% First Committee).

A separate General Assembly General Debate corpus (`eval/hf/build-gadebate.ts`) scrapes `gadebate.un.org` for sessions 70–80 (2015–2025), collecting audio from UN Radio's S3 storage and original-language PDFs.

## Pipeline

The evaluation runner (`eval/run.ts`) processes each session sequentially, but runs all providers in parallel for a given language:

1. Load sessions from `sessions.json` (filterable by `--symbol`, `--corpus`)
2. For each session, resolve the Kaltura entry ID and query available audio languages
3. For each language:
   - Fetch and parse the PV PDF into ground truth text (cached)
   - Download the audio track (cached, shared across providers)
   - Run all providers concurrently — each provider transcribes the audio, then metrics are computed against the ground truth
   - Raw transcripts and metrics are cached in `eval/results/`
4. Merge results into `eval/results/summary.json` (deduplicated by symbol, language, provider)

The runner is fully resumable: it loads existing results at startup and skips already-completed evaluations. The `--cached-only` flag recomputes metrics from cached transcripts without making new API calls.

## Results

Results are stored locally under `eval/results/`:

```
eval/results/
  summary.json                     # All metric rows
  ground-truth/{symbol}/{lang}.txt # Cleaned PV text
  raw/{symbol}/{provider}_{lang}.json  # Full normalized transcript
  raw/{symbol}/{provider}_{lang}.txt   # Human-readable text
```

Each row in `summary.json` records: symbol, asset ID, language, provider, WER, normalized WER, CER, normalized CER, substitution/insertion/deletion counts, reference/hypothesis lengths, audio duration, and timestamp.

## Dashboard

The dashboard is a standalone React + Vite app deployed to HuggingFace Spaces. A preparation script reads `summary.json` and collects ground truth and provider texts into a single `data.json` bundle.

**Overview tab**: A leaderboard ranking providers by a selectable metric (default: normalized CER). Each row shows the provider, model name, a bar with 95% confidence intervals (Student's t-distribution), pricing, and capability flags (diarization, custom instructions). Below the main table, six per-language cards show rankings for each UN language.

**Diff tab**: A three-column comparison view — ground truth, provider A, provider B — for a selected session and language. Sentence-level alignment (greedy Levenshtein matching) with word-level diff highlighting: red for missed words, green for added words, grey for punctuation-only differences.

## HuggingFace Datasets

Two datasets are published:

- **`united-nations/transcription-corpus`**: Audio files (converted to MP3) and PV texts for each session/language combination, in HuggingFace AudioFolder format. Only includes tracks where both audio and ground truth are available.
- **`united-nations/transcription-results`**: The `summary.json` rows as JSONL plus raw transcript files. Includes a schema-documenting README.

Upload uses streaming Parquet generation (Python via `uv`) to minimize peak disk usage — processing one session at a time and deleting audio after upload.
