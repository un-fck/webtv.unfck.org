# AI Pipeline

Overview of how AI models are used in the transcription and analysis pipeline.

## Models

| Provider | Model | Used for |
| --- | --- | --- |
| Google Gemini | `gemini-3-flash-preview` | Audio transcription (default STT provider), PV document alignment |
| Azure OpenAI | `gpt-5.4` (configurable via `STT_ANALYSIS_MODEL`) | Speaker identification (legacy), resegmentation, topic definition, proposition analysis |
| Azure OpenAI | `gpt-5.4-mini` (configurable via `STT_ANALYSIS_MODEL_MINI`) | Cross-chunk speaker normalization _(design intent, not implemented)_ |
| Azure OpenAI | `gpt-5.4-nano` (configurable via `STT_ANALYSIS_MODEL_NANO`) | Sentence-level topic tagging (reasoning disabled) |

The STT provider is configurable via `STT_PROVIDER` env var (default: `gemini`). Available providers are registered in `lib/providers/registry.ts`. Analysis model names are configurable via `STT_ANALYSIS_MODEL`, `STT_ANALYSIS_MODEL_MINI`, and `STT_ANALYSIS_MODEL_NANO`.

All AI calls are tracked in the `processing_usage_events` table via `lib/usage-tracking.ts`, recording token counts, duration, and estimated cost.

## Pipeline

```
Kaltura audio URL
       │
       ▼
 1. Transcription — STT provider (default: Gemini)
       │   Long audio is split into 10-min chunks inside the provider.
       │
       ▼
 2. Speaker identification + resegmentation (GPT-5.4)
       │   Single call in lib/pipeline/index.ts:identifySpeakers().
       │   Per-paragraph speaker resolution; multi-speaker paragraphs are
       │   resegmented in parallel; speaker mapping persisted.
       │
       ▼
 3. Topic definition (GPT-5.4)
       │   5–10 substantive policy topics across the meeting.
       │
       ▼
 4. Sentence topic tagging (GPT-5.4-nano, batched, rate-limited)
       │   0–3 topic keys per non-chair sentence.
       │
       ▼ (on demand only — POST /api/transcripts/[id]/analysis)
 5. Proposition analysis (GPT-5.4)
```

Separately, PV document alignment can run independently when an official verbatim record is available (`POST /api/pv/align`).

The transcript has **two status columns** (since migration 003). `transcription_status` transitions
`scheduled → transcribing → identifying_speakers → analyzing_topics → completed | error`.
Proposition analysis is **never** part of this pipeline — it is always on-demand and tracked by a separate `analysis_status` column (`none | analyzing | completed | error`), which never moves the transcript off `completed`. A transcript is viewable as soon as its content (`statements`) exists, independent of either status, so running analysis doesn't hide it from other viewers.

> Cross-chunk speaker normalization (described below as "Stage 2: speaker
> normalization") is **not part of the production pipeline and the
> `normalizeSpeakers()` helper no longer exists in the code** — the production
> Gemini provider deduplicates speakers within its own chunked output. The
> section below is retained only as design intent; `lib/transcription.ts` is the
> source of truth.

---

## 1. Transcription

**File:** `lib/gemini-transcription.ts` — `transcribeAudioWithGemini()`
**Model:** `gemini-3-flash-preview` via Gemini Files API
**Triggered by:** `POST /api/transcripts`

Audio is downloaded from Kaltura, uploaded to the Gemini Files API, and transcribed with speaker identification in a single call. Supports all 6 UN official languages plus the "floor" (original) channel.

**Chunking:** Audio longer than 10 minutes is split into 10-minute chunks with ffmpeg and processed in parallel. This avoids timestamp hallucination that Gemini exhibits on longer clips. Chunks are stitched back together afterward.

**Output per segment:**
- `speaker_name` — full name with correct accents
- `speaker_function` — official title (Representative, Chair, SG, etc.)
- `speaker_affiliation` — ISO 3166-1 alpha-3 for countries, or UN body name
- `speaker_group` — only if speaker explicitly says "on behalf of" a group (G77, EU, NAM, etc.)
- `is_off_record` — pre/post-meeting chatter, audio tests
- `start_time`, `end_time` — HH:MM:SS timestamps
- `text` — verbatim transcription including filler words and false starts

Word-level timestamps are derived by interpolation within each sentence-level segment. Providers with real word-level timestamps (AssemblyAI, Deepgram, ElevenLabs, Azure Speech, Google Chirp, Cohere) preserve them directly.

**Key design decision:** Free-text JSON output (not constrained decoding) is used because Gemini's constrained JSON mode corrupts non-ASCII characters like `é` due to a tokenizer bug.

**Settings:** `temperature: 0`, `maxOutputTokens: 65536`, thinking disabled by default.

## 2. Speaker normalization (cross-chunk) — design intent only, not implemented

> This stage is **not implemented**: there is no `normalizeSpeakers()` helper in
> the codebase and nothing in the production pipeline calls it. The production
> Gemini provider already deduplicates speakers within its own chunked output.
> The description below documents the original design intent.

**Model (intended):** `gpt-5.4-mini` via Azure OpenAI (structured output)
**Would run after chunked transcription.**

When audio is split into chunks, the same speaker may appear with slight variations across chunks (different spellings, titles, accents). This step deduplicates them.

**Input:** All speaker entries from all chunks with occurrence counts.
**Output:** A mapping from each variant key to a canonical key, plus the canonical speaker records.

Uses `reasoning_effort: 'minimal'`.

## 3. Speaker identification (legacy)

**File:** `lib/pipeline/index.ts` — `identifySpeakers()`
**Model:** `gpt-5.4` via Azure OpenAI (structured output)
**Only runs for non-Gemini transcripts** (Gemini already produces speaker mappings).

Identifies who is actually speaking each paragraph (not who is being mentioned or introduced). Uses ASR diarization labels as hints.

**Output per paragraph:** `name`, `function`, `affiliation`, `group`, `has_multiple_speakers`, `is_off_record`.

## 4. Resegmentation

**File:** `lib/pipeline/resegment.ts` — `resegmentParagraph()`
**Model:** `gpt-5.4` via Azure OpenAI (structured output)
**Only runs for paragraphs flagged as `has_multiple_speakers`.**

ASR sometimes places a speaker boundary incorrectly, merging two speakers into one paragraph. This step splits them. Each flagged paragraph is processed in parallel with surrounding context.

Low-confidence splits are discarded.

## 5. Topic definition

**File:** `lib/pipeline/define-topics.ts` — `defineTopics()`
**Model:** `gpt-5.4` via Azure OpenAI (structured output)
**Runs automatically after speaker identification.**

Identifies 5-10 substantive policy topics discussed in the transcript. Each topic must appear in at least 2 different statements by different speakers. Chair/President/Moderator paragraphs are excluded from the input.

**Output per topic:** `key` (kebab-case slug), `label` (human-readable), `description` (1-2 sentences).

## 6. Sentence-level topic tagging

**File:** `lib/pipeline/tag-sentences.ts` — `tagSentencesWithTopics()`
**Model:** `gpt-5.4-nano` via Azure OpenAI (structured output, `reasoning_effort: "none"`)
**Runs immediately after topic definition, batched with rate-limited concurrency.**

Sentences are grouped into batches of 15 and tagged in parallel (up to 20 concurrent requests, rate-limited to 10/sec via Bottleneck). Each non-chair sentence is tagged with 0-3 topic keys from the defined topics.

## 7. Proposition analysis (on demand)

**File:** `lib/pipeline/analyze-propositions.ts` — `analyzePropositions()`
**API route:** `POST /api/transcripts/[id]/analysis`
**Model:** `gpt-5.4` via Azure OpenAI (structured output)
**Not part of the automatic pipeline** — must be explicitly triggered.

Identifies 3-8 concrete propositions (not generic topics) and maps stakeholder positions on each.

**Output per proposition:**
- `key`, `title`, `statement` — the proposition itself
- `positions[]` — grouped by stance (`support`, `oppose`, `conditional`, `neutral`), each with:
  - `stakeholders[]` — speaker names/organizations
  - `summary` — 1-sentence position summary
  - `evidence[]` — exact quotes from the transcript with source paragraph indices

All evidence quotes are verified against the actual transcript text using fuzzy word matching; unverifiable quotes are filtered out.

## 8. PV document alignment

**File:** `lib/pv-alignment.ts`
**API route:** `POST /api/pv/align`
**Model:** `gemini-3-flash-preview` via Gemini Files API

Aligns an official UN verbatim record (Procès-Verbal) with the meeting audio to produce timestamps for each official speaker turn. The PV text is an edited version of what was spoken, so alignment is by speaker identity and content meaning rather than exact wording.

Uses the same 10-minute chunking strategy as transcription. Output is timestamps only (no text), making it token-efficient.

**Merging strategy for chunks:** Configurable — either "first occurrence wins" or best-fit (picks the alignment whose timestamp falls within the chunk's time range).
