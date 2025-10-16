# UN Web TV Transcribed

Browse UN Web TV videos with transcripts of all speeches.

## Overview

This app displays videos from [UN Web TV](https://webtv.un.org/en/schedule) in a filterable table with enhanced metadata extraction. The goal is to provide easy access to UN speeches and meetings with rich searchable metadata.

### Current Features

- **Embedded Video Pages**: Click any video to watch directly in the app with Kaltura player
- **AI-Powered Transcription**: Generate text transcripts of any video using AssemblyAI with speaker diarization
- **Enhanced Metadata Extraction**: Automatically extracts structured data from video titles
- **Real-time Status Tracking**: Color-coded badges showing if events are 🔴 Live, Scheduled, or Finished
- **Smart Sorting**: Sorts by status first (Live → Scheduled → Finished), then by date/time
- **Filterable Data Table**: Sortable, searchable table with pagination (powered by TanStack Table)
- **Multi-day Fetching**: Displays videos from 1 day ahead to 14 days in the past (configurable)
- **Global Search**: Real-time filtering across all columns
- **Smart Column Filters**: 
  - **Date dropdown** for When column (Tomorrow, Today, Yesterday, specific dates with weekdays)
  - **Dropdown filters** for categorical data (Status, Body)
  - **Text filter** for Title search
  - Each column uses the most appropriate filter UI
- **Active Filters Display**: See all active filters with one-click removal

### Extracted Metadata Fields

| Field | Description | Example |
|-------|-------------|---------|
| **When** | Relative date & time with weekday | Tomorrow 10:00 AM, Today 10:30 AM, Yesterday 2:15 PM, Wed, Oct 9 9:00 AM |
| **Status** | Event status badge (based on time & duration) | 🔴 Live, Scheduled, Finished |
| **Title** | Full title (event code removed) | High-Level Event, Second Committee, 9th plenary meeting - General Assembly, 80th session |
| **Body** | UN body (committee, council, or assembly) | Fourth Committee, General Assembly, Security Council |

**Title Cleaning:** The app removes event code prefixes from titles:
- Event codes (EM07, GO19, etc.) → removed from display (extracted to metadata)
- Everything else remains in the title as-is for full context

### Technical Details

**Data Fetching:**
- No official API exists - data is scraped from the HTML
- Fetches 14 dates in parallel for performance
- Page data cached for 5 minutes
- Videos hosted on Kaltura (partner ID: 2503451)

**Metadata Extraction:**
- Regex-based title parsing for structured data
- Extracts event codes, committee names, session numbers, part numbers
- Identifies organizations from titles and descriptions
- Scheduled time with timezone from HTML

## Getting Started

First, install dependencies:

```bash
npm install
```

Create a `.env.local` file in the project root with your API key:

```bash
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

- `app/page.tsx` - Main page (server component, fetches data)
- `app/video/[id]/page.tsx` - Individual video pages with embedded Kaltura player
- `app/api/transcribe/route.ts` - API endpoint for video transcription
- `components/video-table.tsx` - Filterable table (client component with TanStack Table)
- `components/transcription-panel.tsx` - Client component for generating and displaying transcripts
- `lib/un-api.ts` - Scraping logic with enhanced metadata extraction
- `app/globals.css` - Tailwind CSS v4 styling with UN color palette

## Tech Stack

- **Framework**: Next.js v15.4 with Server Components & API Routes
- **Styling**: Tailwind CSS v4
- **Table**: TanStack Table v8 (headless, sortable, filterable)
- **UI Components**: shadcn/ui base
- **Transcription**: AssemblyAI for speech-to-text with speaker diarization (stateless, no database needed)
- **Video Player**: Kaltura embedded player
