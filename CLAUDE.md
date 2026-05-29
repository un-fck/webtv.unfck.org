# CLAUDE.md

Agent instructions for working with this codebase.

## Think before coding

Don't assume, don't hide confusion, surface tradeoffs. Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick one silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

(For trivial tasks, use judgment — this biases toward caution over speed.)

## Never apply database changes yourself

Do NOT run migrations or any write/DDL against a database (no `psql -f`, no
`ALTER`/`CREATE`/`INSERT`/`UPDATE`/`DELETE` against a live DB) unless the user
has explicitly asked or approved it in this conversation. Write the migration
file and hand the apply command to the user; let them run it. Read-only queries
for investigation are fine.

## Migrations always come with a matching `sql/schema.sql` update

Every migration under `sql/migrations/NNN_*.sql` must come with an edit to
`sql/schema.sql` in the same change. Migrations are the incremental log;
`schema.sql` is the from-scratch snapshot. Edit the relevant `CREATE TABLE`
directly (do not paste the migration's `ALTER TABLE`), mirror new indexes and
constraints, and remove dropped objects. No placeholder "see migration NNN"
comments without DDL. Data-only seeds (`INSERT`s) are deliberately omitted.

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

# Schema migrations (apply once per database, in order; see sql/migrations/)
# NOTE: the agent must NOT run these — the user applies them (see rule below).
# DATABASE_URL lives in .env (loaded by lib/load-env), NOT the shell and NOT
# .env.local. A bare `psql "$DATABASE_URL"` in the shell sees an empty string
# and silently connects to the LOCAL postgres instead of Azure.
psql "$DATABASE_URL" -f sql/migrations/<NNN_name>.sql

# Eval system (independent from main app, see eval/README.md)
pnpm eval -- --symbol=A/... --providers=assemblyai-universal-3-pro,gemini-3-flash --languages=en
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

> **Where the real credentials live:** in this checkout the actual secrets
> (including `DATABASE_URL` for the Azure dev DB) are in **`.env`**, not
> `.env.local` (which does not exist here). `lib/load-env` loads `.env.local`
> first, then `.env`. The shell does NOT export these, so `$DATABASE_URL` is
> empty in a bare terminal — never trust it for `psql`.

**Required for the web app:**

- `DATABASE_URL` — PostgreSQL connection string (Azure Database for PostgreSQL via PgBouncer port 6432). All tables live in the `webtv` schema and every query is explicitly schema-qualified (`webtv.<table>`); there is no `search_path` setup, so this works regardless of the connection's default schema.
- `GEMINI_API_KEY` — transcription of the multilingual "floor" track + PV document alignment (Gemini)
- `ASSEMBLYAI_API_KEY` — English transcription (AssemblyAI Universal-3 Pro)
- `DASHSCOPE_API_KEY` — Chinese transcription (Alibaba Fun-ASR)
- `AZURE_OPENAI_ENDPOINT` — fr/es/ar/ru transcription (gpt-4o-transcribe) + speaker identification, topics, propositions
- `AZURE_OPENAI_API_KEY` — as above
- `AZURE_OPENAI_API_VERSION` — defaults in `.env.example` (e.g. `2025-03-01-preview`)
- `AUTH_SECRET` — HMAC secret signing login session cookies (`openssl rand -hex 32`). Required in production; falls back to a dev default otherwise.
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` — outbound email for magic-link login. Login is required to generate transcripts; experimental features (proposition analysis, speaker directory) additionally require the per-user `experimental_access` flag (migration 011). `SMTP_FROM` falls back to `SMTP_USER`; `SMTP_HOST` defaults to `smtp.mailbox.org`.

**Production only:**

- `CRON_SECRET` — Vercel cron job authorization (auto-set by Vercel)
- `NEXT_PUBLIC_BASE_URL` — public base URL of the site. (No longer used for internal speaker-identification triggers — those now run in-process via `runSpeakerIdentification()` + `after()`, not an HTTP self-call.)

**Optional:**

- STT provider selection is **per-language**, configured in `lib/providers/config.ts` (`STT_ROUTING`), not via an env var. Provider keys are `{vendor}-{model}` (e.g. `assemblyai-universal-3-pro`, `azure-gpt-4o-transcribe`, `alibaba-fun-asr`, `gemini-3-flash`); see `lib/providers/registry.ts`. All Gemini providers emit numeric speaker IDs only — names are assigned downstream by the OpenAI speaker-ID stage.
- `STT_ANALYSIS_MODEL` — Azure OpenAI model for speaker ID, resegmentation, topics, propositions (default: `gpt-5.4`)
- `STT_ANALYSIS_MODEL_MINI` — Azure OpenAI model for cross-chunk normalization (default: `gpt-5.4-mini`)
- `STT_ANALYSIS_MODEL_NANO` — Azure OpenAI model for sentence tagging (default: `gpt-5.4-nano`)

**Eval system only:** `ASSEMBLYAI_API_KEY`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_ENDPOINT`, `ELEVENLABS_API_KEY`, `GROQ_API_KEY`, `DASHSCOPE_API_KEY`, `DEEPGRAM_API_KEY`, `MISTRAL_API_KEY`, `HF_TOKEN`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_BUCKET`.

## Documentation

Detailed docs live in `docs/` — read these before working on the relevant subsystem:

- `docs/ai.md` — AI pipeline: models used, pipeline stages (transcription → speaker identification + resegmentation → topics → sentence tagging → propositions → PV alignment)
- `docs/webtv-kaltura.md` — UN Web TV scraping and the **three-ID system** (`asset_id` → `kaltura_id` player ID → canonical `entry_id`), Kaltura redirects, audio flavors, schedule scraping, per-video metadata, what gets stored, and the legacy-data gotchas behind slow/missing-transcript lookups. **Read this before touching any Kaltura ID, entry resolution, or audio-URL code.**
- `docs/eval.md` — Evaluation system: ground truth from PV documents, multi-provider STT, metrics (WER/CER), corpus, dashboard, HuggingFace datasets
- `docs/official-transcripts.md` — Which UN organs produce PV vs SR records, document symbol patterns
- `docs/api.md` — Public API: URL scheme, JSON endpoints, response shapes
- `docs/realignment.md` — Realigning transcript timestamps after WebTV re-cuts a video: detection (duration reduction), Gemini-computed front-shift offset, geometric validation, `source_duration_ms`/`time_offset_ms`/`aligned_duration_ms`, and where the offset is applied
- `REVIEW.md` (project root) — current code review, known issues, ranked refactor opportunities

## Architecture

For detailed architecture, see the `docs/` files above. Summary:

### Data Flow

UN Web TV has no public API — `lib/un-api.ts` scrapes HTML directly. See `docs/webtv-kaltura.md` for full details on scraping, the three-ID system, Kaltura redirect/entry resolution, audio flavors, and what gets stored.

On page load, videos are fetched from PostgreSQL for a rolling window (configurable in `lib/config.ts` via `scheduleLookbackDays`, default 14 days), with cached helpers in `lib/cached-db.ts` (60s revalidate). All scraped videos are persisted via `scripts/sync-videos.ts` and the `/api/cron/sync-videos` cron (every 15 min).

For search beyond the rolling window, the frontend calls `/api/search` which queries the database directly using the FTS index, with a trigram-accelerated ILIKE fallback when FTS errors.

### Transcription Pipeline

See `docs/ai.md` for the full pipeline with model details and design decisions.

Triggered from the video page UI (`POST /api/transcripts`) or via the scheduled-processing cron (`/api/cron/process-scheduled`):

1. **Transcribe** — provider selected **per language** via `lib/providers/config.ts` (`STT_ROUTING`: English→AssemblyAI Universal-3 Pro, fr/es/ar/ru→Azure gpt-4o-transcribe, Chinese→Alibaba Fun-ASR, floor→Gemini). Audio is downloaded from Kaltura and transcribed with numeric speaker diarization (no names — see step 2). Providers chunk long audio internally as needed.
2. **Speaker identification + resegmentation** — `lib/pipeline/index.ts:identifySpeakers()` runs per-paragraph speaker resolution and multi-speaker resegmentation (Azure OpenAI / GPT-5.4) and persists the speaker mapping. (Pipeline stages live in `lib/pipeline/`.)
3. **Topic definition** — identifies 5–10 substantive policy topics across the meeting (GPT-5.4).
4. **Sentence tagging** — tags each non-chair sentence with 0–3 topic keys (GPT-5.4-nano, batched; rate-limited via Bottleneck — 20 concurrent / 10 per sec).
5. **Proposition analysis** *(always on demand, never in the main pipeline)* — `POST /api/transcripts/[id]/analysis` identifies stakeholder positions on concrete propositions, with fuzzy-match evidence verification. It is tracked on a separate `analysis_status` axis and **never** moves the transcript off `completed`, so running it doesn't hide the transcript from other viewers.
6. **PV alignment** *(separate)* — `POST /api/pv/align` aligns an official UN verbatim record with the audio for timestamped speaker turns.

Stages 2–4 run in `runAnalysisPipeline` (`lib/transcription.ts`) inside `identifySpeakers()`. **Two status axes** (since migration 003): `transcription_status` transitions `scheduled → transcribing → identifying_speakers → analyzing_topics → completed` (or `error`); `analysis_status` (`none | analyzing | completed | error`) is driven only by the on-demand analysis route. **Viewability = content exists** (a transcript with `statements` is shown to everyone regardless of any later/in-progress stage), so the cache/check lookups use `getActiveTranscriptByKalturaId()` (latest non-error row) rather than keying strictly on `completed`. In-progress and scheduled transcripts are surfaced to all viewers (with their stage) via the same polling, so others see live progress instead of a duplicate Transcribe button. Starting transcription/scheduling is idempotent per video+language via `withVideoLock()` (a `pg_advisory_xact_lock`), so simultaneous clicks reuse one transcript row.

The provider is selected per language via `STT_ROUTING` in `lib/providers/config.ts` (`getSTTProvider(language)`). Analysis model names are configurable via `STT_ANALYSIS_MODEL` / `_MINI` / `_NANO`. Provider implementations live in `lib/providers/` (shared with the eval system).

> No provider names speakers itself — all emit opaque/numeric speaker labels, and
> the OpenAI speaker-ID stage (step 2) assigns names from context. There is no
> separate `normalizeSpeakers()` call in `runTranscriptionPipeline`; chunk
> stitching and any within-chunk speaker handling are internal to each provider.

**Scheduled transcription**: Videos can be queued for transcription before audio is available. `lib/db.ts:scheduleTranscript()` creates a `scheduled` status record. The cron `/api/cron/process-scheduled` (every 5 min) picks them up and starts transcription once Kaltura audio is available.

### Database (PostgreSQL)

`lib/db.ts` is the single data-access layer, backed by a `pg` connection pool. Schema lives in `sql/schema.sql`; the application role lives in `sql/role.sql`. Everything lives in the `webtv` schema, and every query references tables with an explicit `webtv.` prefix (there is no `SET search_path` — queries never rely on the connection's default schema). All queries use the `q()` helper which converts `?` placeholders to `$N` (parameterized — no string interpolation of user input).

**Tables:**

- `videos` — scraped video metadata, keyed by `asset_id`. Columns: `entry_id`, `title`, `clean_title`, `date`, `scheduled_time`, `duration`, `url`, `body`, `category`, `event_code`, `event_type`, `session_number`, `part_number`, `pv_symbol`, `pv_available`, `pv_checked_at`, `slug`, `last_seen`, `created_at`, `updated_at`, plus a generated `fts_vec tsvector` over `COALESCE(clean_title, title)`. Indexes: unique on `slug`; btree on `entry_id`, `date`, `last_seen`, `body`, `category`; GIN on `fts_vec`; GIN trigram on the title fallback.
- `transcripts` — transcription results, keyed by `transcript_id`. Two status columns: `transcription_status` (`scheduled → transcribing → identifying_speakers → analyzing_topics → completed | error`) and `analysis_status` (`none | analyzing | completed | error`, for on-demand proposition analysis only). Has `pipeline_lock` column for concurrency control (30-min stale-lock timeout, refreshed by a heartbeat — `touchPipelineLock()` — at each pipeline stage boundary and throttled during the long resegmentation pass, so a job still making progress isn't re-entered). No FK to `videos`; the join is via `entry_id`.
- `speaker_mappings` — AI-resolved speaker info per transcript (name, function, affiliation, group), one row per `transcript_id` with a JSONB `mapping` column.
- `processing_usage_events` — per-operation API cost tracking (provider, stage, operation, status, model, tokens, hours, rate card, USD-derivable). 33 columns, SERIAL PK.
- `pv_contents` — cached PV/SR document content, composite PK `(pv_symbol, language)`, JSONB `content` plus `fetched_at` / `parsed_at`. Populated by `app/api/pv/route.ts`.

Historically the schema avoided FK constraints and enforced referential integrity in application code (e.g. `deleteTranscript()` and `deleteTranscriptsForEntry()` delete from `processing_usage_events` and `transcripts` inside a single `BEGIN/COMMIT` transaction via `withTransaction()` in `lib/db.ts`). New tables/columns may use FKs when they're a clear win — but adding FKs to **existing** tables requires an orphan-row audit first (existing inconsistent rows would block `ADD CONSTRAINT`) and may render manual app-level cascades redundant.

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

**Components** (file naming is kebab-case throughout; exported component identifiers stay PascalCase, e.g. `transcript-table.tsx` exports `VideoTable`):

- `components/transcript-table.tsx` — main schedule table (client, TanStack Table), exports `VideoTable`. Column filters (date popover, status, body, category, text search), pagination, scheduled-view toggle, search-archive mode.
- `components/transcription-panel.tsx` — orchestrates the transcribe → poll → display lifecycle, language switching, topic/proposition state.
- `components/transcript-view.tsx`, `transcript-toolbar.tsx`, `raw-transcript-view.tsx` — transcript rendering surfaces.
- `components/speaker-toc.tsx` — speaker table of contents.
- `components/pv-panel.tsx` — fetches and displays the official verbatim record alongside the AI transcript.
- `components/analysis-view.tsx` — proposition / stakeholder position display.
- `components/stage-progress.tsx` — pipeline progress indicator.
- `components/video-page-client.tsx` — wraps video page client interactions (player docking, language selection, panels).
- `components/video-player.tsx` — Kaltura embedded player (loads Kaltura SDK dynamically).
- `components/site-header.tsx` — header with `home` and `nav` variants (exports `SiteHeader`).
- `components/nav-menu.tsx`, `components/timezone-picker.tsx`, `components/animated-corner-logo.tsx` — header chrome.
- `components/ui/` — shadcn primitives (button, calendar, popover, switch, tooltip).

**Hooks (`lib/hooks/`):**

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
- **Typography**: text sizes/weights come from the semantic scale in `lib/typography.ts` (e.g. `typography.sectionTitle`, `typography.body`, `typography.caption`), composed with `cn()`. New text should use a token rather than raw `text-*`/`font-*` utilities. Intentionally bespoke and excluded: the brand logo / "Public Preview" badge in `site-header.tsx`, and the shadcn button's own `cva` sizing in `components/ui/button.tsx`.
- **Left-align** UI elements; follow clear design hierarchy
- **Global solutions** over parallel infrastructures; avoid hardcoding values
- **Scripts** in `scripts/` use `lib/load-env` (loads `.env.local` via dotenv) since they run outside Next.js
- **Path alias**: `@/*` maps to project root (see `tsconfig.json`)
- **Vercel cron**: configured in `vercel.json`, authenticated via `CRON_SECRET` Bearer token
- **Three ID systems**: `asset_id` (UN Web TV URL, DB primary key) → `kaltura_id` (player ID, parsed from the asset) → canonical `entry_id` (what `kaltura_id` redirects to in Kaltura; equal unless redirected). Always be clear which one you're working with — see `docs/webtv-kaltura.md`
