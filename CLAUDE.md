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

- `DATABASE_URL` — Azure PostgreSQL connection string (use PgBouncer port 6432 for Vercel serverless)
- `GEMINI_API_KEY` — transcription (Gemini)
- `AZURE_OPENAI_ENDPOINT` — speaker identification & post-processing
- `AZURE_OPENAI_API_KEY` — speaker identification & post-processing
- `AZURE_OPENAI_API_VERSION` — defaults in `.env.example`

**Production only:**

- `CRON_SECRET` — Vercel cron job authorization (auto-set by Vercel)

**Optional:**

- `NEXT_PUBLIC_BASE_URL` — defaults to `http://localhost:3000` (used for server-to-self fetches)
- `STT_PROVIDER` — STT provider name (default: `gemini`). See `lib/providers/registry.ts` for available providers
- `STT_ANALYSIS_MODEL` — Azure OpenAI model for speaker ID, resegmentation, topics, propositions (default: `gpt-5.4`)
- `STT_ANALYSIS_MODEL_MINI` — Azure OpenAI model for cross-chunk speaker normalization (default: `gpt-5.4-mini`)
- `STT_ANALYSIS_MODEL_NANO` — Azure OpenAI model for sentence-level topic tagging (default: `gpt-5.4-nano`)

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

The home page (`app/page.tsx`) is **fully server-rendered from PostgreSQL** via `getVideosPage` with server-side pagination/filtering. There is no longer a "live scrape on page load" path — scraping happens out-of-band via `pnpm sync-videos` and the `/api/cron/sync-videos` cron (every 15 min, scrapes tomorrow + last 3 days).

`lib/config.ts:scheduleLookbackDays` (default 14) is currently only used for one or two callers; the home page uses `DAYS_BACK = 365` directly in `app/page.tsx`. (This is a small inconsistency — see `docs/TODO.md`.)

For search beyond the rolling window, the frontend calls `/api/search` which queries the database directly (FTS with `to_tsvector('english', …)` + a trigram fallback for short tokens).

### Transcription Pipeline

See `docs/ai.md` for the full pipeline with model details and design decisions.

Triggered from the video page UI or via scheduled processing:

1. **Transcribe** (`lib/gemini-transcription.ts` via `lib/providers/gemini-production.ts`) — uploads audio to Gemini, transcribes with rich speaker output (named speakers, function, affiliation, group)
2. **Speaker normalization** — cross-chunk deduplication via `STT_ANALYSIS_MODEL_MINI` (only for chunked audio)
3. **Speaker identification** (`lib/speaker-identification.ts:identifySpeakers`) — legacy path for non-Gemini transcripts; for Gemini, this stage builds the per-paragraph mapping from the rich output
4. **Resegmentation** — splits paragraphs flagged as `has_multiple_speakers`
5. **Topic definition + sentence tagging** — `STT_ANALYSIS_MODEL` defines 5–10 topics, `STT_ANALYSIS_MODEL_NANO` tags sentences in batches
6. **Proposition analysis** — on-demand stakeholder position mapping (`POST /api/transcripts/[id]/analysis`)
7. **PV alignment** (`lib/pv-alignment.ts` via `POST /api/pv/align`) — aligns official verbatim records with audio timestamps

The STT provider is configurable via `STT_PROVIDER` env var (default: `gemini`). Provider implementations live in `lib/providers/` (shared with the eval system). Note: `lib/providers/registry.ts` registers two Gemini providers — `gemini` (production, rich output) and `gemini-eval` (simplified, for benchmarking only).

**Scheduled transcription:** Videos can be queued before audio is available. `scheduleTranscript()` creates a `scheduled` status row where `entry_id` is reused to carry the `kalturaId` until resolution. The Vercel cron (`/api/cron/process-scheduled`, every 5 min) picks these up and starts transcription once audio is available.

### Database (Azure PostgreSQL)

`lib/db.ts` is the single data-access layer, backed by a `pg` connection pool (max 5, 30s idle, 5s connect, `sslmode=require` with `rejectUnauthorized: false`).

All tables live in the `webtv` schema and **every query in the app uses fully-qualified table names** (e.g. `webtv.transcripts`). The schema is provisioned via `sql/schema.sql`; an application role with scoped privileges is provisioned via `sql/role.sql`.

Internally, `lib/db.ts:q()` rewrites `?` placeholders to `$N` for `pg` — a convenience layer kept from the libSQL/Turso era.

**Tables:**

- `videos` — scraped video metadata, keyed by `asset_id`. Columns include `entry_id` (resolved Kaltura entry), `kaltura_id` (pre-redirect Kaltura ID, extracted from asset_id), `title`, `clean_title`, `date`, `scheduled_time`, `duration`, `url`, `body`, `category`, `event_code`, `event_type`, `session_number`, `part_number`, `pv_symbol`, `pv_available`, `pv_checked_at`, `slug`, `last_seen`. Has a generated `fts_vec tsvector` column + GIN indexes for FTS and trigram search.
- `transcripts` — transcription results, keyed by `transcript_id`. Carries both `entry_id` (resolved) and `kaltura_id` (stable player ID) for legacy compatibility. Status lifecycle: `scheduled → transcribing → identifying_speakers → analyzing_topics → analyzing_propositions → completed | error`. Has `pipeline_lock` column for concurrency control (30-min timeout). `content` is a JSONB blob containing `raw_paragraphs`, `statements`, `topics`, `propositions`.
- `speaker_mappings` — AI-resolved speaker info per transcript (`{name, function, affiliation, group, is_off_record}`), keyed by `transcript_id`.
- `processing_usage_events` — per-operation API cost tracking (provider, stage, tokens, hours, rate card).
- `pv_contents` — cached, parsed PV documents keyed by `(pv_symbol, language)`.

**Key queries:** `searchVideos` (FTS with trigram fallback), `getScheduledTranscripts`, `getAllTranscriptedEntries`, `getVideosPage` (server-paginated, filterable), `getFilterOptions`, `getVideosNeedingPVCheck`.

**Types exported:** `Transcript`, `TranscriptContent`, `VideoRecord`, `TranscriptStatus`, `ProcessingUsageEvent`, `SpeakerMapping`, `SpeakerInfo`. `lib/speakers.ts` is a thin shim that re-exports the speaker-related symbols from `lib/db.ts` and adds `formatSpeakerInfo`.

### API Routes

| Route                              | Method | Purpose                                                              |
| ---------------------------------- | ------ | -------------------------------------------------------------------- |
| `/api/health`                      | GET    | DB liveness probe (`SELECT 1`)                                       |
| `/api/transcripts/check`           | GET    | Check cache for existing transcript (`?kalturaId=...&language=...`)  |
| `/api/transcripts`                 | POST   | Start, force-restart, or schedule transcription                      |
| `/api/transcripts/[id]`            | GET    | Poll transcript status / fetch result                                |
| `/api/transcripts/[id]/analysis`   | POST   | Run on-demand proposition analysis                                   |
| `/api/identify-speakers`           | POST   | Run speaker identification on an existing transcript                 |
| `/api/languages`                   | GET    | Available audio language tracks for a Kaltura entry                  |
| `/api/pv`                          | GET    | Fetch + parse + cache a PV document (`?symbol=...&lang=...`)         |
| `/api/pv/align`                    | POST   | Align a PV document with audio (timestamps)                          |
| `/api/search`                      | GET    | Search video archive (`?q=...&offset=...`) — FTS + trigram fallback  |
| `/api/cron/sync-videos`            | GET    | Cron (every 15 min): scrape tomorrow + last 3 days                   |
| `/api/cron/process-scheduled`      | GET    | Cron (every 5 min): pick up scheduled transcripts                    |
| `/api/cron/check-pv`               | GET    | Cron (every 6 h): probe documents.un.org for PV availability         |
| `/json`                            | GET    | JSON API: video list                                                 |
| `/json/[...meeting]`               | GET    | JSON API: single video by meeting slug                               |

All cron routes are **GET** (Vercel switched away from POST a while back) and gated on `Authorization: Bearer ${CRON_SECRET}`.

### Frontend

**Pages:**

- `app/page.tsx` — server component; reads videos directly from PostgreSQL via `getVideosPage`, renders `VideoTable` (in `components/TranscriptTable.tsx`)
- `app/[...meeting]/page.tsx` — catch-all meeting route; resolves human-readable slug to a video, renders player + transcript panel
- `app/about/page.tsx`, `app/methodology/page.tsx` — static pages

**URL scheme:** Meeting pages use human-readable slugs derived from UN document symbols (see `docs/api.md` for the full table):

- `/sc/{n}` — Security Council (from `S/PV.{n}`)
- `/ga/{session}/{meeting}` — General Assembly plenary
- `/ga/es{s}/{n}` — GA Emergency Special Session
- `/ga/c{c}/{session}/{meeting}` — GA Committees (1st = PV, others = SR)
- `/hrc/{session}/{meeting}` — Human Rights Council
- `/ecosoc/{year}/{meeting}` — ECOSOC
- `/meeting/{asset_id}` — fallback for videos without document symbols
- Multi-part meetings append `-part-{n}`.

Slug logic lives in `lib/meeting-slug.ts` with bidirectional conversion (`meetingSlugFromVideo` / `symbolFromSlug`).

**Components** (note: filename casing is currently inconsistent — see review notes):

- `components/TranscriptTable.tsx` — main table (`VideoTable`, despite the filename). TanStack Table with column filters (date dropdown, status dropdown, body dropdown, text-presence filter, global search), pagination, active filters chip strip, search-archive mode.
- `components/transcription-panel.tsx` — orchestrates the transcribe → poll → display lifecycle.
- `components/stage-progress.tsx` — pipeline progress indicator.
- `components/transcript-view.tsx` / `raw-transcript-view.tsx` — rendering of statements / raw paragraphs.
- `components/transcript-toolbar.tsx` — view-mode switcher.
- `components/speaker-toc.tsx` — speaker table-of-contents.
- `components/analysis-view.tsx` — proposition / stakeholder positions.
- `components/pv-panel.tsx` — side-by-side PV display with alignment.
- `components/video-page-client.tsx` — wraps video page client interactions.
- `components/video-player.tsx` — Kaltura embedded player (loads Kaltura SDK dynamically).
- `components/SiteHeader.tsx` / `NavMenu.tsx` / `TimezonePicker.tsx` / `AnimatedCornerLogo.tsx` — chrome.

**Hooks:**

- `lib/hooks/use-transcript.ts` — transcript state machine + API interactions.
- `lib/hooks/use-playback-tracking.ts` — rAF-based playback position tracking; computes active segment / statement / paragraph / sentence / word indices.
- `lib/hooks/use-timezone.tsx` — user timezone preference (client localStorage).

### Cost Tracking

`lib/usage-tracking.ts` wraps OpenAI and Gemini calls to record usage into `processing_usage_events`. Tracks tokens, hours, rate card versions (see `lib/config.ts:GEMINI_RATE_CARD_VERSION` + `GEMINI_MODEL_PRICING`), and estimated USD cost. Report via `pnpm usage-report`.

### Eval System

`eval/` is a fully independent evaluation harness — separate `tsconfig`, excluded from the root type-check. The dashboard (`eval/dashboard/`) is a standalone Vite + React app using npm (not pnpm). See `docs/eval.md` for full details and `eval/README.md` for running instructions.

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
- **Vercel cron**: configured in `vercel.json`, all `GET`, authenticated via `CRON_SECRET` Bearer token
- **Two ID systems**: Asset IDs (UN Web TV URLs, DB primary key) vs Kaltura entry IDs (player/audio). A third "stable player ID" (`kaltura_id`, extracted from the asset_id via `extractKalturaId`) was added later to avoid round-tripping Kaltura on every cache check. Always be clear which one you're working with.
