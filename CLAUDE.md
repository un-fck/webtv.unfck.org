# CLAUDE.md

Agent instructions for working with this codebase.

@AGENTS.md

## Commands

```bash
pnpm dev          # Dev server (Next.js + Turbopack) → http://localhost:3000
pnpm build        # Production build
pnpm lint         # ESLint
pnpm typecheck    # TypeScript type-check (no emit)
pnpm format       # Prettier (app, components, lib, scripts, eval)

# Data management (run with tsx, use lib/load-env for .env.local)
pnpm sync-videos              # Scrape UN Web TV schedule → Turso
pnpm fetch-video-metadata     # Enrich stored videos with Kaltura metadata
pnpm retranscribe             # Re-run transcription pipeline on existing transcripts
pnpm reidentify               # Re-run speaker identification on existing transcripts
pnpm usage-report             # Print API cost report from Turso
pnpm usage-benchmark          # Benchmark usage tracking

# Eval system (independent from main app, see eval/README.md)
pnpm eval -- --symbol=A/... --providers=assemblyai,gemini --languages=en
pnpm hf:upload-corpus         # Upload eval corpus to HuggingFace
pnpm hf:push-corpus           # Push corpus via Python (requires uv)
pnpm hf:build-gadebate        # Build GA debate metadata
pnpm hf:push-gadebate         # Push GA debate to HuggingFace (requires uv)
pnpm hf:discover-corpus       # Discover new sessions for eval corpus
pnpm hf:upload-results        # Upload eval results to HuggingFace
```

## Environment Variables

Copy `.env.example` → `.env.local` and fill in values.

**Required for the web app:**

- `TURSO_DB` — libSQL/Turso database URL
- `TURSO_TOKEN` — Turso auth token
- `GEMINI_API_KEY` — transcription (Gemini)
- `AZURE_OPENAI_ENDPOINT` — speaker identification & post-processing
- `AZURE_OPENAI_API_KEY` — speaker identification & post-processing
- `AZURE_OPENAI_API_VERSION` — defaults in `.env.example`

**Production only:**

- `CRON_SECRET` — Vercel cron job authorization

**Optional:**

- `NEXT_PUBLIC_BASE_URL` — defaults to `http://localhost:3000`
- `STT_PROVIDER` — STT provider name (default: `gemini`). See `lib/providers/registry.ts` for available providers
- `STT_ANALYSIS_MODEL` — Azure OpenAI model for speaker ID, resegmentation, topics, propositions (default: `gpt-5.4`)
- `STT_ANALYSIS_MODEL_MINI` — Azure OpenAI model for normalization (default: `gpt-5.4-mini`)
- `STT_ANALYSIS_MODEL_NANO` — Azure OpenAI model for sentence tagging (default: `gpt-5.4-nano`)

**Eval system only:** `ASSEMBLYAI_API_KEY`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_ENDPOINT`, `ELEVENLABS_API_KEY`, `GROQ_API_KEY`, `DASHSCOPE_API_KEY`, `DEEPGRAM_API_KEY`, `MISTRAL_API_KEY`, `HF_TOKEN`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_BUCKET`.

## Documentation

Detailed docs live in `docs/` — read these before working on the relevant subsystem:

- `docs/ai.md` — AI pipeline: models used, pipeline stages (transcription → speaker normalization → identification → resegmentation → topics → propositions → PV alignment)
- `docs/webtv.md` — UN Web TV scraping, Kaltura two-ID system, schedule scraping, per-video metadata, what gets stored
- `docs/eval.md` — Evaluation system: ground truth from PV documents, 10 STT providers, metrics (WER/CER), corpus, dashboard, HuggingFace datasets
- `docs/official-transcripts.md` — Which UN organs produce PV vs SR records, document symbol patterns
- `docs/api.md` — Public API: URL scheme, JSON endpoints, response shapes

## Architecture

For detailed architecture, see the `docs/` files above. Summary:

### Data Flow

UN Web TV has no public API — `lib/un-api.ts` scrapes HTML directly. See `docs/webtv.md` for full details on scraping, Kaltura ID resolution, and what gets stored.

On page load, videos are fetched for a rolling window (configurable in `lib/config.ts` via `scheduleLookbackDays`, default 14 days), cached for 5 minutes. All scraped videos are persisted into Turso via `scripts/sync-videos.ts`.

For search beyond the rolling window, the frontend calls `/api/search` which queries Turso directly.

### Transcription Pipeline

See `docs/ai.md` for the full 8-stage pipeline with model details and design decisions.

Triggered from the video page UI or via scheduled processing:

1. **Transcribe**: `lib/gemini-transcription.ts` — uploads audio to Gemini, transcribes with speaker identification
2. **Speaker normalization**: cross-chunk deduplication via GPT-5-mini (only for chunked audio)
3. **Speaker identification**: legacy path for non-Gemini transcripts
4. **Resegmentation**: splits paragraphs with multiple speakers
5. **Topic definition + tagging**: identifies policy topics, tags sentences
6. **Proposition analysis**: on-demand stakeholder position mapping
7. **PV alignment**: aligns official verbatim records with audio timestamps

The STT provider is configurable via `STT_PROVIDER` env var (default: `gemini`). Analysis model names are configurable via `STT_ANALYSIS_MODEL` and `STT_ANALYSIS_MODEL_MINI`. Provider implementations live in `lib/providers/` (shared with the eval system).

**Scheduled transcription**: Videos can be queued for transcription before audio is available. `lib/turso.ts:scheduleTranscript()` creates a `scheduled` status record. The Vercel cron job (`/api/cron/process-scheduled`, every 5 min) picks these up and starts transcription once audio is available.

### Database (Turso / libSQL)

`lib/turso.ts` is the single data-access layer. Schema auto-migrates on first connection via `ensureInitialized()`.

**Tables:**

- `videos` — scraped video metadata, keyed by `asset_id`. Columns: `entry_id`, `title`, `clean_title`, `date`, `scheduled_time`, `duration`, `url`, `body`, `category`, `event_code`, `event_type`, `session_number`, `part_number`, `slug`, `last_seen`
- `transcripts` — transcription results, keyed by `transcript_id`. Status lifecycle: `scheduled → transcribing → transcribed → identifying_speakers → analyzing_topics → completed | error`. Has `pipeline_lock` column for concurrency control (30-min timeout)
- `speaker_mappings` — AI-resolved speaker info per transcript (name, function, affiliation, group)
- `processing_usage_events` — per-operation API cost tracking (provider, stage, tokens, hours, rate card)

**Key queries:** `searchVideos` (LIKE on title/clean_title), `getScheduledTranscripts`, `getAllTranscriptedEntries`, `getRecentVideos`.

**Types exported:** `Transcript`, `TranscriptContent`, `VideoRecord`, `TranscriptStatus`, `ProcessingUsageEvent`, `SpeakerMapping` (from `lib/speakers.ts`).

### API Routes

| Route                               | Method | Purpose                                                      |
| ------------------------------------ | ------ | ------------------------------------------------------------ |
| `/api/transcripts/check`            | GET    | Check cache for existing transcript (`?kalturaId=...&language=...`) |
| `/api/transcripts`                  | POST   | Start or schedule transcription                              |
| `/api/transcripts/[id]`             | GET    | Poll transcript status / fetch result                        |
| `/api/transcripts/[id]/analysis`    | POST   | Run proposition analysis on transcript                       |
| `/api/identify-speakers`            | POST   | Run speaker identification on transcript                     |
| `/api/search`                       | GET    | Search video archive (`?q=...&offset=...`)                   |
| `/api/cron/process-scheduled`       | POST   | Cron: process scheduled transcripts (auth via `CRON_SECRET`) |
| `/json`                             | GET    | JSON API: all recent videos                                  |
| `/json/[...meeting]`               | GET    | JSON API: single video by meeting slug                       |

### Frontend

**Pages:**

- `app/page.tsx` — server component; scrapes videos for schedule window, fetches transcripted entries from Turso, renders `VideoTable`
- `app/[...meeting]/page.tsx` — catch-all meeting route; resolves human-readable slug (e.g. `/sc/9748`, `/ga/79/21`) to video, renders player + transcript panel

**URL scheme:** Meeting pages use human-readable slugs derived from UN document symbols:
- `/sc/{n}` — Security Council (from `S/PV.{n}`)
- `/ga/{session}/{meeting}` — General Assembly plenary (from `A/{session}/PV.{meeting}`)
- `/ga/c{n}/{session}/{meeting}` — GA committees
- `/hrc/{session}/{meeting}` — Human Rights Council
- `/ecosoc/{year}/{meeting}` — ECOSOC
- `/meeting/{asset_id}` — fallback for videos without document symbols

Slug logic lives in `lib/meeting-slug.ts` with bidirectional conversion (`slugFromSymbol` / `symbolFromSlug`).

**Components:**

- `components/video-table.tsx` — main table (client component, TanStack Table). Column filters (date dropdown, status dropdown, body dropdown, text search), pagination, active filters display. Includes scheduled-view toggle and search-archive mode
- `components/transcription-panel.tsx` — orchestrates the transcribe → poll → display lifecycle
- `components/stage-progress.tsx` — pipeline progress indicator
- `components/analysis-view.tsx` — proposition/stakeholder position display
- `components/video-page-client.tsx` — wraps video page client interactions
- `components/video-player.tsx` — Kaltura embedded player (loads Kaltura SDK dynamically)
- `components/site-header.tsx` — header with two variants: `home` (full) and `nav` (compact with back link)

**Hooks:**

- `lib/hooks/use-transcript.ts` — transcript state management (statements, segments, speakers, topics, propositions) and API interactions (transcribe, poll, schedule, analyze)
- `lib/hooks/use-playback-tracking.ts` — rAF-based playback position tracking, computes active segment/statement/paragraph/sentence/word indices

### Cost Tracking

`lib/usage-tracking.ts` wraps OpenAI and Gemini calls to record usage to the `processing_usage_events` table. Tracks tokens, hours, rate card versions, and estimated USD cost. Report via `pnpm usage-report`.

### Eval System

`eval/` is a fully independent evaluation harness — separate `tsconfig`, excluded from root type-check. The dashboard (`eval/dashboard/`) is a standalone Vite + React app using npm (not pnpm). See `docs/eval.md` for full details and `eval/README.md` for running instructions.

Benchmarks 10 STT providers against UN verbatim records (PV documents) as ground truth across all 6 UN languages. Provider implementations are shared with the main app via `lib/providers/`.

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
