# UN Web TV Transcribed

Browse and search UN Web TV videos with AI-generated transcripts, speaker identification, and topic analysis.

**Live site**: [webtv.unfck.org](https://webtv.unfck.org)

## Overview

This app scrapes [UN Web TV](https://webtv.un.org/en/schedule) (which has no public API), stores video metadata in PostgreSQL, and provides AI-powered transcription with speaker diarization, speaker identification, and topic analysis. Videos are displayed in a filterable table with real-time status tracking, search across the full archive, and individual video pages with embedded Kaltura player.

## Features

- **Video schedule table** with column filters, sorting, pagination, and global search (TanStack Table)
- **Full-archive search** via PostgreSQL (beyond the rolling schedule window)
- **Embedded video pages** with Kaltura player
- **AI transcription** via Gemini with speaker diarization and paragraph breaks
- **Speaker identification** via Azure OpenAI (maps speaker labels to named delegates)
- **Scheduled transcription** for upcoming events (cron job picks them up when audio becomes available)
- **JSON API** for programmatic access to video data
- **Status badges** (Live / Scheduled / Finished) with smart sorting
- **Metadata extraction** from titles (UN body, event code, session number, etc.)
- **API cost tracking** per transcript (Gemini hours, OpenAI tokens)

## Documentation

Detailed documentation lives in [`docs/`](docs/):

- [AI Pipeline](docs/ai.md) — models, pipeline stages, design decisions
- [UN Web TV & Kaltura](docs/webtv.md) — scraping, ID systems, data flow
- [Evaluation System](docs/eval.md) — STT benchmarking, metrics, dashboard
- [Official Meeting Records](docs/official-transcripts.md) — PV vs SR records by UN organ

## Getting Started

```bash
pnpm install
cp .env.example .env.local   # fill in values
pnpm dev                     # http://localhost:3000
```

## Commands

```bash
pnpm dev                      # Next.js dev server with Turbopack
pnpm build                    # Production build
pnpm lint                     # ESLint
pnpm typecheck                # TypeScript type-check (no emit)
pnpm format                   # Prettier

# Data management
pnpm sync-videos              # Sync video metadata from UN Web TV into PostgreSQL
pnpm fetch-video-metadata     # Dump stored videos to analysis/video-metadata.json
pnpm retranscribe             # Re-run transcription pipeline on stored transcripts
pnpm reidentify               # Re-run speaker identification on stored transcripts
pnpm usage-report             # Print API usage/cost report
pnpm usage-benchmark          # Run usage benchmark
pnpm compare-transcribe -- <asset-id|entry-id> [provider]  # Single-shot provider compare

# Eval system (see eval/README.md)
pnpm eval -- --symbol=S/PV.9826 --providers=assemblyai --languages=en
```

## Environment Variables

See `.env.example` for all variables. Core ones:

| Variable                | Required   | Purpose                        |
| ----------------------- | ---------- | ------------------------------ |
| `DATABASE_URL`          | Yes        | PostgreSQL connection string   |
| `GEMINI_API_KEY`        | Yes        | Transcription (Gemini)         |
| `AZURE_OPENAI_API_KEY`  | Yes        | Speaker identification         |
| `AZURE_OPENAI_ENDPOINT` | Yes        | Speaker identification         |
| `CRON_SECRET`           | Production | Vercel cron job auth           |

## Tech Stack

- **Framework**: Next.js 16 (App Router, Server Components, Turbopack)
- **Language**: TypeScript 6
- **Styling**: Tailwind CSS v4
- **UI**: shadcn/ui, Lucide icons, Radix UI primitives
- **Table**: TanStack Table v8
- **Database**: PostgreSQL via `pg` connection pool
- **Transcription**: Gemini (batch)
- **Speaker ID**: Azure OpenAI (structured output via Zod)
- **Video hosting**: Kaltura (partner ID: 2503451)
- **Deployment**: Vercel (cron job every 5 min for scheduled transcripts)
- **Package manager**: pnpm

## Project Structure

```
app/
  page.tsx                          # Home page (server component, fetches schedule)
  [...meeting]/page.tsx             # Video page with player + transcript
  layout.tsx                        # Root layout (Roboto font, corner logo)
  globals.css                       # Tailwind v4 theme + UN color palette
  api/
    health/route.ts                 # DB liveness probe
    transcripts/check/route.ts      # Cache check (GET, by kalturaId)
    transcripts/route.ts            # Start / force / schedule transcription
    transcripts/[id]/route.ts       # Poll transcript status / fetch result
    transcripts/[id]/analysis/...   # Run on-demand proposition analysis
    identify-speakers/route.ts      # Speaker identification (Azure OpenAI)
    languages/route.ts              # Available audio language tracks for a Kaltura entry
    pv/route.ts                     # Fetch + parse + cache PV document
    pv/align/route.ts               # Align PV with audio (timestamps)
    search/route.ts                 # Full-archive video search (FTS + trigram fallback)
    cron/sync-videos/route.ts       # Cron (15 min): scrape tomorrow + last 3 days
    cron/process-scheduled/route.ts # Cron (5 min): process scheduled transcripts
    cron/check-pv/route.ts          # Cron (6 h): check PV document availability
  json/
    route.ts                        # JSON API: video list
    [...meeting]/route.ts           # JSON API: single video

components/
  TranscriptTable.tsx               # Main schedule table (client, TanStack Table) — exports VideoTable
  video-page-client.tsx             # Video page client wrapper
  transcription-panel.tsx           # Transcribe/poll/display flow
  transcript-view.tsx               # Statement rendering
  raw-transcript-view.tsx           # Raw paragraph rendering
  transcript-toolbar.tsx            # View-mode switcher
  speaker-toc.tsx                   # Speaker table-of-contents
  analysis-view.tsx                 # Proposition / stakeholder positions
  pv-panel.tsx                      # Side-by-side PV display with alignment
  stage-progress.tsx                # Pipeline progress indicator
  video-player.tsx                  # Kaltura embedded player
  SiteHeader.tsx / NavMenu.tsx      # Site chrome
  TimezonePicker.tsx                # User timezone preference
  AnimatedCornerLogo.tsx            # Decorative

lib/
  db.ts                             # Database layer (all queries, pg pool)
  un-api.ts                         # UN Web TV HTML scraper + metadata extraction
  transcription.ts                  # Transcription submission + audio URL resolution
  speaker-identification.ts         # Azure OpenAI speaker mapping pipeline
  speakers.ts                       # Speaker mapping CRUD
  usage-tracking.ts                 # API cost tracking (Gemini + OpenAI)
  kaltura-helpers.ts                # Kaltura entry ID resolution + audio URL
  meeting-slug.ts                   # Bidirectional slug ↔ document symbol conversion
  config.ts                         # App config (lookback days, pricing rates)
  load-env.ts                       # Loads .env.local for scripts outside Next.js

scripts/                            # CLI scripts (run via tsx, use lib/load-env)
  sync-videos.ts                    # Scrape UN Web TV → database
  fetch-video-metadata.ts           # Dump stored videos to analysis/video-metadata.json
  retranscribe.ts                   # Re-run transcription on existing records
  reidentify.ts                     # Re-run speaker identification
  usage-report.ts                   # Print cost report
  usage-benchmark.ts                # Benchmark usage tracking
  compare-transcription.ts          # Single-shot provider compare
  test-pv-alignment.ts              # Validate PV alignment timestamps (not in package.json)
  test-pv-parser.ts                 # Validate PV parser (not in package.json)

docs/
  ai.md                             # AI pipeline: models, stages, design decisions
  webtv.md                          # UN Web TV scraping & Kaltura integration
  eval.md                           # Eval system: providers, metrics, corpus, dashboard
  official-transcripts.md           # PV vs SR records by UN organ

eval/                               # Independent eval harness (see docs/eval.md)
  eval/dashboard/                   # Standalone Vite + React dashboard (npm, not pnpm)
```

## Eval System

The `eval/` directory is an independent benchmarking harness for transcription providers. It has its own `tsconfig`, is excluded from the root type-check, and the dashboard uses npm (not pnpm). See [docs/eval.md](docs/eval.md) for full details and [eval/README.md](eval/README.md) for running instructions.
