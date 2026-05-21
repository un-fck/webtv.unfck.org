# CLAUDE.md

Agent instructions for working with this codebase.

## Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

## Commands

```bash
pnpm dev          # Dev server (Next.js + Turbopack) → http://localhost:3000
pnpm build        # Production build
pnpm lint         # ESLint
pnpm typecheck    # TypeScript type-check (no emit)
pnpm format       # Prettier (app, components, lib, scripts, eval)

# Data management (run with tsx, use lib/load-env for .env.local)
pnpm sync-videos              # Scrape UN Web TV schedule → PostgreSQL
pnpm fetch-video-metadata     # Dump stored videos to analysis/video-metadata.json
pnpm retranscribe             # Re-run transcription pipeline on existing transcripts
pnpm reidentify               # Re-run speaker identification on existing transcripts
pnpm usage-report             # Print API cost report
pnpm usage-benchmark          # Benchmark usage tracking
pnpm compare-transcribe -- <assetId|entryId> [provider]  # One-off provider compare

# Untracked (not in package.json — run via tsx directly)
tsx scripts/test-pv-alignment.ts     # Validate PV alignment timestamps
tsx scripts/test-pv-parser.ts        # Validate PV parser across 6 languages

# Schema migrations (apply once per database)
psql "$DATABASE_URL" -f sql/migrations/001_add_kaltura_id.sql

# Eval system (independent from main app, see eval/README.md)
pnpm eval -- --symbol=A/... --providers=assemblyai,gemini --languages=en
pnpm hf:upload-corpus         # Upload eval corpus to HuggingFace
pnpm hf:push-corpus           # Push corpus via Python (requires uv)
pnpm hf:build-gadebate        # Build GA debate metadata
pnpm hf:push-gadebate         # Push GA debate to HuggingFace (requires uv)
pnpm hf:discover-corpus       # Discover new sessions for eval corpus
pnpm hf:upload-results        # Upload eval results to HuggingFace
pnpm hf:push-dashboard        # Push dashboard to HuggingFace (requires uv)
```

## Environment Variables

Copy `.env.example` → `.env.local` and fill in values.

**Required for the web app:**

- `DATABASE_URL` — PostgreSQL connection string (Azure Database for PostgreSQL via PgBouncer port 6432). All tables live in the `webtv` schema; the connection pool runs `SET search_path = webtv, public` per checkout, so SQL queries use unqualified names.
- `GEMINI_API_KEY` — transcription (Gemini)
- `AZURE_OPENAI_ENDPOINT` — speaker identification, topics, propositions
- `AZURE_OPENAI_API_KEY` — speaker identification, topics, propositions
- `AZURE_OPENAI_API_VERSION` — defaults in `.env.example` (e.g. `2025-03-01-preview`)

**Production only:**

- `CRON_SECRET` — Vercel cron job authorization (auto-set by Vercel)
- `NEXT_PUBLIC_BASE_URL` — used by the API to call itself for fire-and-forget speaker-identification triggers; **must be set in production** or those internal requests will go to `localhost:3000` and silently fail.

**Optional:**

- `STT_PROVIDER` — STT provider name (default: `gemini`). Available: `gemini` (production, rich named-speaker output), `gemini-eval`, `assemblyai`, `azure-openai`, `azure-speech`, `elevenlabs`, `google-chirp`, `groq-whisper`, `alibaba`, `deepgram`, `mistral`, `cohere`. See `lib/providers/registry.ts`.
- `STT_ANALYSIS_MODEL` — Azure OpenAI model for speaker ID, resegmentation, topics, propositions (default: `gpt-5.4`)
- `STT_ANALYSIS_MODEL_MINI` — Azure OpenAI model for cross-chunk normalization (default: `gpt-5.4-mini`)
- `STT_ANALYSIS_MODEL_NANO` — Azure OpenAI model for sentence tagging (default: `gpt-5.4-nano`)

**Eval system only:** `ASSEMBLYAI_API_KEY`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_ENDPOINT`, `ELEVENLABS_API_KEY`, `GROQ_API_KEY`, `DASHSCOPE_API_KEY`, `DEEPGRAM_API_KEY`, `MISTRAL_API_KEY`, `HF_TOKEN`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_BUCKET`.

## Documentation

Detailed docs live in `docs/` — read these before working on the relevant subsystem:

- `docs/ai.md` — AI pipeline: models used, pipeline stages (transcription → speaker identification + resegmentation → topics → sentence tagging → propositions → PV alignment)
- `docs/webtv.md` — UN Web TV scraping, Kaltura two-ID system, schedule scraping, per-video metadata, what gets stored
- `docs/eval.md` — Evaluation system: ground truth from PV documents, multi-provider STT, metrics (WER/CER), corpus, dashboard, HuggingFace datasets
- `docs/official-transcripts.md` — Which UN organs produce PV vs SR records, document symbol patterns
- `docs/api.md` — Public API: URL scheme, JSON endpoints, response shapes
- `REVIEW.md` (project root) — current code review, known issues, ranked refactor opportunities

## Architecture

For detailed architecture, see the `docs/` files above. Summary:

### Data Flow

UN Web TV has no public API — `lib/un-api.ts` scrapes HTML directly. See `docs/webtv.md` for full details on scraping, Kaltura ID resolution, and what gets stored.

On page load, videos are fetched from PostgreSQL for a rolling window (configurable in `lib/config.ts` via `scheduleLookbackDays`, default 14 days), with cached helpers in `lib/cached-db.ts` (60s revalidate). All scraped videos are persisted via `scripts/sync-videos.ts` and the `/api/cron/sync-videos` cron (every 15 min).

For search beyond the rolling window, the frontend calls `/api/search` which queries the database directly using the FTS index, with a trigram-accelerated ILIKE fallback when FTS errors.

### Transcription Pipeline

See `docs/ai.md` for the full pipeline with model details and design decisions.

Triggered from the video page UI (`POST /api/transcripts`) or via the scheduled-processing cron (`/api/cron/process-scheduled`):

1. **Transcribe** — provider-agnostic via `lib/providers/` (default `gemini`). Audio is downloaded from Kaltura, uploaded to the provider, and transcribed with speaker diarization. Long audio (>10 min) is chunked by the Gemini provider and stitched.
2. **Speaker identification + resegmentation** — `lib/speaker-identification.ts:identifySpeakers()` runs per-paragraph speaker resolution and multi-speaker resegmentation (Azure OpenAI / GPT-5.4) and persists the speaker mapping.
3. **Topic definition** — identifies 5–10 substantive policy topics across the meeting (GPT-5.4).
4. **Sentence tagging** — tags each non-chair sentence with 0–3 topic keys (GPT-5.4-nano, batched; rate-limited via Bottleneck — 20 concurrent / 10 per sec).
5. **Proposition analysis** *(on demand)* — `POST /api/transcripts/[id]/analysis` identifies stakeholder positions on concrete propositions, with fuzzy-match evidence verification.
6. **PV alignment** *(separate)* — `POST /api/pv/align` aligns an official UN verbatim record with the audio for timestamped speaker turns.

Stages 2–4 run in `runAnalysisPipeline` (`lib/transcription.ts:316`) inside `identifySpeakers()`. The status column transitions `transcribing → identifying_speakers → analyzing_topics → analyzing_propositions → completed` (or `error`); analyzing_propositions is only reached when proposition analysis runs.

The provider is selected via `STT_PROVIDER` (default `gemini`). Analysis model names are configurable via `STT_ANALYSIS_MODEL` / `_MINI` / `_NANO`. Provider implementations live in `lib/providers/` (shared with the eval system).

> Cross-chunk speaker normalization is described in `docs/ai.md` as a stage. The
> production Gemini provider deduplicates speakers within its own chunking, and
> there is no separate `normalizeSpeakers()` call in `runTranscriptionPipeline`.
> Treat the doc as design intent and the code as the source of truth.

**Scheduled transcription**: Videos can be queued for transcription before audio is available. `lib/db.ts:scheduleTranscript()` creates a `scheduled` status record. The cron `/api/cron/process-scheduled` (every 5 min) picks them up and starts transcription once Kaltura audio is available.

### Database (PostgreSQL)

`lib/db.ts` is the single data-access layer, backed by a `pg` connection pool. Schema lives in `sql/schema.sql`; the application role lives in `sql/role.sql`. Everything lives in the `webtv` schema. The pool runs `SET search_path = webtv, public` per checkout so queries use unqualified names. All queries use the `q()` helper which converts `?` placeholders to `$N` (parameterized — no string interpolation of user input).

**Tables:**

- `videos` — scraped video metadata, keyed by `asset_id`. Columns: `entry_id`, `title`, `clean_title`, `date`, `scheduled_time`, `duration`, `url`, `body`, `category`, `event_code`, `event_type`, `session_number`, `part_number`, `pv_symbol`, `pv_available`, `pv_checked_at`, `slug`, `last_seen`, `created_at`, `updated_at`, plus a generated `fts_vec tsvector` over `COALESCE(clean_title, title)`. Indexes: unique on `slug`; btree on `entry_id`, `date`, `last_seen`, `body`, `category`; GIN on `fts_vec`; GIN trigram on the title fallback.
- `transcripts` — transcription results, keyed by `transcript_id`. Status lifecycle: `scheduled → transcribing → identifying_speakers → analyzing_topics → analyzing_propositions → completed | error`. Has `pipeline_lock` column for concurrency control (30-min stale-lock timeout, no heartbeat). No FK to `videos`; the join is via `entry_id`.
- `speaker_mappings` — AI-resolved speaker info per transcript (name, function, affiliation, group), one row per `transcript_id` with a JSONB `mapping` column.
- `processing_usage_events` — per-operation API cost tracking (provider, stage, operation, status, model, tokens, hours, rate card, USD-derivable). 33 columns, SERIAL PK.
- `pv_contents` — cached PV/SR document content, composite PK `(pv_symbol, language)`, JSONB `content` plus `fetched_at` / `parsed_at`. Populated by `app/api/pv/route.ts`.

There are **no foreign-key constraints** between these tables; referential integrity is enforced in application code only. `deleteTranscript()` and `deleteTranscriptsForEntry()` issue separate DELETEs against `processing_usage_events` and `transcripts` without a transaction; if the second fails, orphan usage events remain.

**Key queries:** `searchVideos` (FTS with ILIKE/trigram fallback), `getVideosPage`, `getRecentVideos`, `getScheduledTranscripts`, `getAllTranscriptedEntries`, `getVideosNeedingPVCheck`, `getProcessingUsageSummaryByTranscript`.

**Types exported from `lib/db.ts`:** `Transcript`, `TranscriptContent`, `RawParagraph`, `VideoRecord`, `TranscriptStatus`, `ProcessingUsageProvider`, `ProcessingUsageStatus`. `SpeakerMapping` is exported from `lib/speakers.ts`.

### API Routes

| Route                                | Method | Purpose                                                              |
| ------------------------------------ | ------ | -------------------------------------------------------------------- |
| `/api/health`                        | GET    | DB ping (`{status}`)                                                 |
| `/api/transcripts/check`             | GET    | Check cache for existing transcript (`?kalturaId=...&language=...`)  |
| `/api/transcripts`                   | POST   | Start or schedule transcription                                      |
| `/api/transcripts/[id]`              | GET    | Poll transcript status / fetch result                                |
| `/api/transcripts/[id]/analysis`     | POST   | Run proposition analysis on transcript                               |
| `/api/identify-speakers`             | POST   | Run speaker identification + topic pipeline on a transcript          |
| `/api/languages`                     | GET    | List available audio language tracks for a Kaltura entry             |
| `/api/search`                        | GET    | Search video archive (`?q=...&offset=...`)                           |
| `/api/pv`                            | GET    | Fetch / parse a PV document PDF and cache JSON in `pv_contents`      |
| `/api/pv/align`                      | POST   | Align a PV document with audio (timestamps only)                     |
| `/api/cron/process-scheduled`        | GET    | Cron: process scheduled transcripts (auth via `CRON_SECRET`)         |
| `/api/cron/sync-videos`              | GET    | Cron: sync UN Web TV schedule (auth via `CRON_SECRET`)               |
| `/api/cron/check-pv`                 | GET    | Cron: check PV document availability (auth via `CRON_SECRET`)        |
| `/json`                              | GET    | JSON API: all transcribed videos                                     |
| `/json/[...meeting]`                 | GET    | JSON API: single video by meeting slug                               |

Cron schedule (`vercel.json`): `process-scheduled` every 5 min, `sync-videos` every 15 min, `check-pv` every 6 hours.

### Frontend

**Pages:**

- `app/page.tsx` — server component; fetches recent videos from PostgreSQL and the cached transcripted-entries set, renders the home schedule table.
- `app/[...meeting]/page.tsx` — catch-all meeting route; resolves human-readable slug (e.g. `/sc/9748`, `/ga/79/21`) to a video record, renders player + transcript panel.
- `app/about/page.tsx`, `app/methodology/page.tsx` — static content pages.

**URL scheme:** Meeting pages use human-readable slugs derived from UN document symbols:
- `/sc/{n}` — Security Council (from `S/PV.{n}`)
- `/ga/{session}/{meeting}` — General Assembly plenary (from `A/{session}/PV.{meeting}`)
- `/ga/c{n}/{session}/{meeting}` — GA committees
- `/hrc/{session}/{meeting}` — Human Rights Council
- `/ecosoc/{year}/{meeting}` — ECOSOC
- `/meeting/{asset_id}` — fallback for videos without document symbols

Slug logic lives in `lib/meeting-slug.ts` with bidirectional conversion (`slugFromSymbol` / `symbolFromSlug`).

**Components** (file naming is intentionally mixed PascalCase / kebab-case — match neighbours when editing, don't bulk-rename):

- `components/TranscriptTable.tsx` — main schedule table (client, TanStack Table). Column filters (date popover, status, body, category, text search), pagination, scheduled-view toggle, search-archive mode.
- `components/transcription-panel.tsx` — orchestrates the transcribe → poll → display lifecycle, language switching, topic/proposition state.
- `components/transcript-view.tsx`, `transcript-toolbar.tsx`, `raw-transcript-view.tsx` — transcript rendering surfaces.
- `components/speaker-toc.tsx` — speaker table of contents.
- `components/pv-panel.tsx` — fetches and displays the official verbatim record alongside the AI transcript.
- `components/analysis-view.tsx` — proposition / stakeholder position display.
- `components/stage-progress.tsx` — pipeline progress indicator.
- `components/video-page-client.tsx` — wraps video page client interactions (player docking, language selection, panels).
- `components/video-player.tsx` — Kaltura embedded player (loads Kaltura SDK dynamically).
- `components/SiteHeader.tsx` — header with `home` and `nav` variants.
- `components/NavMenu.tsx`, `components/TimezonePicker.tsx`, `components/AnimatedCornerLogo.tsx` — header chrome.
- `components/ui/` — shadcn primitives (button, calendar, popover, switch, tooltip).

**Hooks (`lib/hooks/`):**

- `use-transcript.ts` — transcript state machine (statements, segments, speakers, topics, propositions) and API interactions (transcribe, poll, schedule, analyze).
- `use-playback-tracking.ts` — rAF-based playback position tracking; computes active segment/statement/paragraph/sentence/word indices.
- `use-timezone.tsx` — timezone context for date/time formatting.

### Cost Tracking

`lib/usage-tracking.ts` wraps OpenAI and Gemini calls to record usage to the `processing_usage_events` table. Tracks tokens, hours, rate card versions, and estimated USD cost. Includes built-in retry/backoff for 429s. Insert errors are swallowed (logged only) so a usage-tracking outage does not break the pipeline. Report via `pnpm usage-report`.

### Eval System

`eval/` is a fully independent evaluation harness — separate `tsconfig`, excluded from root type-check. The dashboard (`eval/dashboard/`) is a standalone Vite + React app using npm (not pnpm). See `docs/eval.md` for full details and `eval/README.md` for running instructions.

Benchmarks ~12 STT providers (registered in `lib/providers/registry.ts`) against UN verbatim records (PV documents) as ground truth across all 6 UN languages. Provider implementations are shared with the main app via `lib/providers/`.

## Conventions

- **Tailwind CSS v4** — many utilities changed from v3; consult docs when unsure
- **shadcn components**: `npx shadcn@latest add <component>`
- **UN colors**: defined in `app/globals.css` (`--color-un-blue`, `--color-un-gray`, etc.), used via Tailwind theme tokens
- **Font**: Roboto (loaded via `next/font/google` in layout)
- **Left-align** UI elements; follow clear design hierarchy
- **Global solutions** over parallel infrastructures; avoid hardcoding values
- **Scripts** in `scripts/` use `lib/load-env` (loads `.env.local` via dotenv) since they run outside Next.js
- **Path alias**: `@/*` maps to project root (see `tsconfig.json`)
- **Vercel cron**: configured in `vercel.json`, authenticated via `CRON_SECRET` Bearer token
- **Two ID systems**: Asset IDs (UN Web TV URLs, DB primary key) vs Kaltura entry IDs (player/audio). Always be clear which one you're working with
- **Component file naming is intentionally mixed** (`TranscriptTable.tsx` vs `transcription-panel.tsx`) — match neighbours when editing, don't bulk-rename
