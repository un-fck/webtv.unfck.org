# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server (Next.js + Turbopack)
pnpm build        # Production build
pnpm lint         # ESLint

# Data management scripts (run with tsx via pnpm)
pnpm sync-videos              # Sync video metadata from UN Web TV into Turso DB
pnpm fetch-video-metadata     # Fetch additional Kaltura metadata for stored videos
pnpm retranscribe             # Re-run transcription pipeline on stored transcripts
pnpm reidentify               # Re-run speaker identification on stored transcripts
pnpm usage-report             # Print API usage/cost report from Turso

# Transcription evaluation
pnpm eval --symbol=A/... --providers=assemblyai,azure-openai --languages=en
pnpm hf:upload-corpus         # Upload eval corpus to HuggingFace
pnpm hf:push-corpus           # Push corpus via Python (requires uv)
```

## Environment Variables

Create `.env.local` for the web app:

```
ASSEMBLYAI_API_KEY=          # Required: transcription
TURSO_DB=                    # Required: libSQL/Turso database URL
TURSO_TOKEN=                 # Required: Turso auth token
AZURE_OPENAI_API_KEY=        # Required: speaker identification
AZURE_OPENAI_ENDPOINT=       # Required: speaker identification
NEXT_PUBLIC_BASE_URL=        # Optional: defaults to http://localhost:3000
```

Additional vars for the eval system: `AZURE_OPENAI_API_VERSION`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_ENDPOINT`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `HF_TOKEN`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_BUCKET`.

## Architecture

### Data Flow

UN Web TV has no public API — `lib/un-api.ts` scrapes HTML directly. Videos are fetched for a rolling window (configurable in `lib/config.ts` via `scheduleLookbackDays`), cached for 5 minutes, and stored/synced into Turso via `scripts/sync-videos.ts`.

Videos are hosted on Kaltura (partner ID: `2503451`). The Kaltura entry ID differs from the asset ID visible in the URL; `lib/kaltura-helpers.ts` handles the resolution.

### Transcription Pipeline

Triggered from the video page UI or API:

1. `app/api/transcribe/route.ts` — accepts `kalturaId`, resolves to Kaltura `entryId` + audio URL
2. `lib/transcription.ts` — submits audio to AssemblyAI, returns `transcriptId` for polling
3. `app/api/transcribe/poll/route.ts` — client polls this until AssemblyAI finishes
4. `app/api/identify-speakers/route.ts` — fires async after transcription; uses Azure OpenAI to map raw speaker labels to named delegates
5. Results stored in Turso (`lib/turso.ts`) under the `transcripts` table with a pipeline lock to prevent duplicate processing

Long sessions can be split into time segments (`startTime`/`endTime`); `app/api/transcribe/segments/route.ts` handles segmented transcription.

### Database (Turso / libSQL)

`lib/turso.ts` is the single data access layer. Tables:
- `videos` — scraped video metadata, keyed by `asset_id`
- `transcripts` — transcription results with status lifecycle: `transcribing → transcribed → identifying_speakers → completed | error`
- `speaker_mappings` — AI-resolved speaker name→label mapping per transcript
- `processing_usage_events` — per-operation API cost tracking (AssemblyAI hours, OpenAI tokens)

Schema is auto-migrated on first connection via `ensureInitialized()`.

### Frontend

- `app/page.tsx` — server component; scrapes/fetches videos and renders the table
- `app/video/[id]/page.tsx` — individual video page; loads transcript from Turso server-side
- `components/video-table.tsx` — client component using TanStack Table with column filters, sorting, pagination
- `components/transcription-panel.tsx` — client component managing the transcribe/poll/display flow
- `components/video-page-client.tsx` — wraps the video page client interactions

### JSON API

`app/json/route.ts` and `app/json/[id]/route.ts` expose video list and individual video data as JSON.

### Eval System

`eval/` is an independent evaluation harness for benchmarking transcription providers (AssemblyAI, Azure OpenAI Whisper, Azure Speech, Gemini, ElevenLabs, Google Chirp) against UN verbatim records (PV documents) as ground truth.

- `eval/run.ts` — CLI entry point; accepts `--symbol`, `--corpus`, `--providers`, `--languages`
- `eval/providers/` — one file per STT provider implementing a common interface
- `eval/ground-truth/` — fetches UN verbatim PDFs from the Official Document System API and normalizes them
- `eval/metrics/` — WER/CER calculation with UN-specific text normalization
- `eval/corpus/` — corpus discovery (sessions with available ground truth)
- Results written to `eval/results/` as JSON; uploadable to HuggingFace via `eval/hf/`

### Eval Dashboard (`eval/dashboard/`)

A standalone Vite + React app for visualizing eval results. Completely independent from the root project — it has its own `package.json`, `node_modules`, and `tsconfig`, managed with `npm` (not pnpm). Run it with `npm run dev` from inside `eval/dashboard/`. The root `tsconfig.json` excludes `eval/` to prevent type-check cross-contamination.

## Conventions

- Use Tailwind CSS v4 syntax — many v3 utilities changed; consult docs when unsure
- Install shadcn components with `npx shadcn@latest add <component>`
- Use colors defined in `app/globals.css` (`--color-un-blue`, `--color-un-gray`, etc.) via Tailwind theme tokens
- Left-align UI elements; follow clear design hierarchy
- Prefer global solutions over parallel infrastructures; avoid hardcoding values that are hard to locate
- Scripts in `scripts/` use `lib/load-env` (loads `.env.local` via dotenv) since they run outside Next.js
