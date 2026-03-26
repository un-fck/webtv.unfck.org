# UN Web TV Transcribed

Browse and search UN Web TV videos with AI-generated transcripts, speaker identification, and topic analysis.

**Live site**: [webtv.unfck.org](https://webtv.unfck.org)

## Overview

This app scrapes [UN Web TV](https://webtv.un.org/en/schedule) (which has no public API), stores video metadata in Turso, and provides AI-powered transcription with speaker diarization, speaker identification, and topic analysis. Videos are displayed in a filterable table with real-time status tracking, search across the full archive, and individual video pages with embedded Kaltura player.

## Features

- **Video schedule table** with column filters, sorting, pagination, and global search (TanStack Table)
- **Full-archive search** via Turso database (beyond the rolling schedule window)
- **Embedded video pages** with Kaltura player
- **AI transcription** via AssemblyAI with speaker diarization and paragraph breaks
- **Speaker identification** via Azure OpenAI (maps speaker labels to named delegates)
- **Scheduled transcription** for upcoming events (cron job picks them up when audio becomes available)
- **Live transcription** via AssemblyAI streaming API (real-time WebSocket)
- **JSON API** for programmatic access to video data
- **Status badges** (Live / Scheduled / Finished) with smart sorting
- **Metadata extraction** from titles (UN body, event code, session number, etc.)
- **API cost tracking** per transcript (AssemblyAI hours, OpenAI tokens)

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
pnpm sync-videos              # Sync video metadata from UN Web TV into Turso
pnpm fetch-video-metadata     # Fetch additional Kaltura metadata for stored videos
pnpm retranscribe             # Re-run transcription pipeline on stored transcripts
pnpm reidentify               # Re-run speaker identification on stored transcripts
pnpm usage-report             # Print API usage/cost report from Turso
pnpm usage-benchmark          # Run usage benchmark

# Eval system (see eval/README.md)
pnpm eval -- --symbol=S/PV.9826 --providers=assemblyai --languages=en
```

## Environment Variables

See `.env.example` for all variables. Core ones:

| Variable                | Required   | Purpose                    |
| ----------------------- | ---------- | -------------------------- |
| `TURSO_DB`              | Yes        | libSQL/Turso database URL  |
| `TURSO_TOKEN`           | Yes        | Turso auth token           |
| `ASSEMBLYAI_API_KEY`    | Yes        | Transcription (AssemblyAI) |
| `AZURE_OPENAI_API_KEY`  | Yes        | Speaker identification     |
| `AZURE_OPENAI_ENDPOINT` | Yes        | Speaker identification     |
| `CRON_SECRET`           | Production | Vercel cron job auth       |

## Tech Stack

- **Framework**: Next.js 16 (App Router, Server Components, Turbopack)
- **Language**: TypeScript 6
- **Styling**: Tailwind CSS v4
- **UI**: shadcn/ui, Lucide icons, Radix UI primitives
- **Table**: TanStack Table v8
- **Database**: Turso (libSQL) via `@libsql/client`
- **Transcription**: AssemblyAI (batch + real-time streaming)
- **Speaker ID**: Azure OpenAI (structured output via Zod)
- **Video hosting**: Kaltura (partner ID: 2503451)
- **Deployment**: Vercel (cron job every 5 min for scheduled transcripts)
- **Package manager**: pnpm

## Project Structure

```
app/
  page.tsx                          # Home page (server component, fetches schedule)
  video/[id]/page.tsx               # Video page with player + transcript
  layout.tsx                        # Root layout (Roboto font, corner logo)
  globals.css                       # Tailwind v4 theme + UN color palette
  api/
    transcribe/route.ts             # Start transcription (accepts kalturaId)
    transcribe/poll/route.ts        # Poll transcription status
    transcribe/segments/route.ts    # Segmented transcription (time ranges)
    identify-speakers/route.ts      # Speaker identification (Azure OpenAI)
    get-speaker-mapping/route.ts    # Fetch speaker mapping for a transcript
    search/route.ts                 # Full-archive video search (Turso)
    stream-transcribe/token/route.ts # AssemblyAI streaming token generation
    download-hls/route.ts           # HLS segment download + AssemblyAI upload
    cron/process-scheduled/route.ts # Cron: process scheduled transcriptions
  json/
    route.ts                        # JSON API: video list
    [id]/route.ts                   # JSON API: single video

components/
  video-table.tsx                   # Main schedule table (client, TanStack Table)
  video-page-client.tsx             # Video page client wrapper
  transcription-panel.tsx           # Transcribe/poll/display flow
  video-player.tsx                  # Kaltura embedded player
  live-transcription.tsx            # Real-time streaming transcription
  site-header.tsx                   # Header (home vs nav variants)
  AnimatedCornerLogo.tsx            # Animated corner logo
  ui/switch.tsx                     # shadcn switch component

lib/
  turso.ts                          # Database layer (all queries, schema migration)
  un-api.ts                         # UN Web TV HTML scraper + metadata extraction
  transcription.ts                  # AssemblyAI submission + audio URL resolution
  speaker-identification.ts         # Azure OpenAI speaker mapping pipeline
  speakers.ts                       # Speaker mapping CRUD (Turso)
  usage-tracking.ts                 # API cost tracking (AssemblyAI + OpenAI)
  kaltura.ts                        # Kaltura ID extraction from various formats
  kaltura-helpers.ts                # Kaltura entry ID resolution + audio URL
  country-lookup.ts                 # ISO 3166 country code lookup
  config.ts                         # App config (lookback days, pricing rates)
  load-env.ts                       # Loads .env.local for scripts outside Next.js
  utils.ts                          # Shared utilities (cn, etc.)

scripts/                            # CLI scripts (run via tsx, use lib/load-env)
  sync-videos.ts                    # Scrape UN Web TV -> Turso
  fetch-video-metadata.ts           # Enrich videos with Kaltura metadata
  retranscribe.ts                   # Re-run transcription on existing records
  reidentify.ts                     # Re-run speaker identification
  usage-report.ts                   # Print cost report
  usage-benchmark.ts                # Benchmark usage tracking
  compare-transcription.ts          # Compare transcription outputs

eval/                               # Independent eval harness (see eval/README.md)
  eval/dashboard/                   # Standalone Vite + React dashboard (npm, not pnpm)
```

## Eval System

The `eval/` directory is an independent benchmarking harness for transcription providers. It has its own `tsconfig`, is excluded from the root type-check, and the dashboard uses npm (not pnpm). See [eval/README.md](eval/README.md) for full documentation.
