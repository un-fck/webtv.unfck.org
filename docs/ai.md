# AI Pipeline

Overview of how AI models are used in the transcription and analysis pipeline.

## Models

| Provider | Model | Used for |
| --- | --- | --- |
| Google Gemini | `gemini-3-flash-preview` | Audio transcription (default STT provider), PV document alignment |
| Azure OpenAI | `gpt-5` (configurable via `STT_ANALYSIS_MODEL`) | Speaker identification (legacy), resegmentation, topic definition, proposition analysis |
| Azure OpenAI | `gpt-5-mini` (configurable via `STT_ANALYSIS_MODEL_MINI`) | Cross-chunk speaker normalization, sentence-level topic tagging |

The STT provider is configurable via `STT_PROVIDER` env var (default: `gemini`). Available providers are registered in `lib/providers/registry.ts`. Analysis model names are configurable via `STT_ANALYSIS_MODEL` and `STT_ANALYSIS_MODEL_MINI`.

All AI calls are tracked in the `processing_usage_events` table via `lib/usage-tracking.ts`, recording token counts, duration, and estimated cost.

## Pipeline

```
Kaltura audio URL
       │
       ▼
 1. Transcription (Gemini)
       │
       ├── [if chunked] 2. Speaker normalization (GPT-5-mini)
       │
       ▼
 3. Speaker identification (GPT-5, legacy path only)
       │
       ├── [if mixed speakers] 4. Resegmentation (GPT-5)
       │
       ▼
 5. Topic definition (GPT-5)
       │
       ▼
 6. Sentence topic tagging (GPT-5-mini, parallel)
       │
       ▼ (on demand only)
 7. Proposition analysis (GPT-5)
```

Separately, PV document alignment (step 8) can run independently when an official verbatim record is available.

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

## 2. Speaker normalization (cross-chunk)

**File:** `lib/gemini-transcription.ts` — `normalizeSpeakers()`
**Model:** `gpt-5-mini` via Azure OpenAI (structured output)
**Only runs after chunked transcription.**

When audio is split into chunks, the same speaker may appear with slight variations across chunks (different spellings, titles, accents). This step deduplicates them.

**Input:** All speaker entries from all chunks with occurrence counts.
**Output:** A mapping from each variant key to a canonical key, plus the canonical speaker records.

Uses `reasoning_effort: 'minimal'`.

## 3. Speaker identification (legacy)

**File:** `lib/speaker-identification.ts` — `identifySpeakers()`
**Model:** `gpt-5` via Azure OpenAI (structured output)
**Only runs for non-Gemini transcripts** (Gemini already produces speaker mappings).

Identifies who is actually speaking each paragraph (not who is being mentioned or introduced). Uses ASR diarization labels as hints.

**Output per paragraph:** `name`, `function`, `affiliation`, `group`, `has_multiple_speakers`, `is_off_record`.

## 4. Resegmentation

**File:** `lib/speaker-identification.ts` — `resegmentParagraph()`
**Model:** `gpt-5` via Azure OpenAI (structured output)
**Only runs for paragraphs flagged as `has_multiple_speakers`.**

ASR sometimes places a speaker boundary incorrectly, merging two speakers into one paragraph. This step splits them. Each flagged paragraph is processed in parallel with surrounding context.

Low-confidence splits are discarded.

## 5. Topic definition

**File:** `lib/speaker-identification.ts` — `defineTopics()`
**Model:** `gpt-5` via Azure OpenAI (structured output)
**Runs automatically after speaker identification.**

Identifies 5-10 substantive policy topics discussed in the transcript. Each topic must appear in at least 2 different statements by different speakers. Chair/President/Moderator paragraphs are excluded from the input.

**Output per topic:** `key` (kebab-case slug), `label` (human-readable), `description` (1-2 sentences).

## 6. Sentence-level topic tagging

**File:** `lib/speaker-identification.ts` — `tagSentencesWithTopics()`
**Model:** `gpt-5-mini` via Azure OpenAI (structured output)
**Runs immediately after topic definition, fully parallelized.**

Each non-chair sentence is tagged with 0-3 topic keys from the defined topics. Each call receives 2 sentences of surrounding context.

## 7. Proposition analysis (on demand)

**File:** `lib/speaker-identification.ts` — `analyzePropositions()`
**API route:** `POST /api/transcripts/[id]/analysis`
**Model:** `gpt-5` via Azure OpenAI (structured output)
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
