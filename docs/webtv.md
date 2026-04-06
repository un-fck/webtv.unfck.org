# UN Web TV & Kaltura: Video Fetching Pipeline

## Overview

UN Web TV (`webtv.un.org`) has no public API. All video data is obtained by scraping HTML pages. Videos are hosted on Kaltura (partner ID `2503451`), which introduces a two-ID system that requires resolution.

## Two ID Systems

- **Asset ID** — visible in UN Web TV URLs (e.g. `security-council/k1abc123`), used as primary key in our `videos` table.
- **Kaltura entry ID** — format `1_xxxxxxxx`, needed for player embed and audio URL extraction. Not directly available from the schedule page.

### Entry ID Resolution

`lib/kaltura.ts` tries several regex patterns to extract a Kaltura ID from the asset ID string (parenthetical, path segment, `k1`-prefixed, double-segment, or bare Kaltura format).

`lib/kaltura-helpers.ts` then resolves this to the canonical entry ID via the Kaltura API:
1. `POST https://cdnapisec.kaltura.com/api_v3/service/multirequest` with a two-step request:
   - `session.startWidgetSession` (widget `_2503451`) to get a session token
   - `baseEntry.list` with `redirectFromEntryId` filter to resolve aliases to the canonical ID
2. The resolved entry ID is cached in the `videos.entry_id` column.

This redirect resolution is necessary because UN asset IDs can reference alias/redirect entries in Kaltura rather than the canonical entry.

## Schedule Scraping

`lib/un-api.ts:fetchVideosForDate(date)` scrapes `https://webtv.un.org/en/schedule/{date}`:

- Extracts scheduled timestamps from hidden `<div class="d-none mediaun-timezone" data-nid="NNN">` elements
- Extracts video blocks via regex: category (`<h6>`), title (`<div class="field__item">`), asset ID (`href="/en/asset/..."`)
- Extracts duration from `<span class="badge">HH:MM:SS</span>` and live status from a `Live` badge
- Derives additional fields from the title: `eventCode`, `eventType`, `body`, `sessionNumber`, `partNumber`, `pvSymbol`

`scrapeVideos(days)` fetches tomorrow + past N days concurrently, deduplicating by asset ID.

### Caching / Revalidation

- Today/tomorrow: 5 min (`next.revalidate: 300`)
- Yesterday: 1 hour
- Older: 24 hours

## Per-Video Metadata (On-Demand)

`getVideoMetadata(assetId)` scrapes `https://webtv.un.org/en/asset/{assetId}` and extracts:

| Field | Source |
|---|---|
| `summary` | `.smt-content` under "Summary" heading |
| `description` | `.smt-content` under "Description" heading |
| `categories` | Links under "Categories" section |
| `relatedDocuments` | `{ title, url }[]` from "Related Sites and Documents" |
| `geographicSubject` | Field items under geographic section |
| `subjectTopical` | Field items under topical section |
| `corporateName` | Field items under corporate name section |
| `speakerAffiliation` | Field items under speaker section |

**None of these are stored in Turso.** They are fetched on demand only.

## What Gets Stored (Turso `videos` table)

| Column | Source | Notes |
|---|---|---|
| `asset_id` | Schedule page URL | Primary key |
| `entry_id` | Kaltura API | Resolved asynchronously, cached |
| `title`, `clean_title` | Schedule page | `clean_title` strips event code prefix |
| `date` | Schedule page | `YYYY-MM-DD` |
| `scheduled_time` | Hidden `mediaun-timezone` div | ISO timestamp |
| `duration` | Schedule page badge | Stored as integer seconds |
| `url` | Derived from asset ID | |
| `category` | Schedule page `<h6>` | |
| `body` | Parsed from title/category | Committee/council name |
| `event_code`, `event_type` | Parsed from title | e.g. `EM07` / `Event - Ministerial` |
| `session_number` | Parsed from title | e.g. `9th plenary meeting` |
| `part_number` | Parsed from title | Integer |
| `pv_symbol` | Parsed from title | Meeting document symbol |
| `pv_available`, `pv_checked_at` | PV check system | Availability of verbatim record |
| `last_seen` | Sync date | Used for recency filtering |

The `saveVideo` upsert uses `COALESCE` for `entry_id` and `pv_symbol` to never overwrite resolved values with null.

## Data Flow Summary

```
Schedule page HTML
  ├─ scrapeVideos() → Video[] (in-memory)
  ├─ saveVideo() → Turso `videos` table (upsert)
  └─ resolveEntryId() → Kaltura API → updates `entry_id` in Turso

App page load
  └─ getRecentVideos(14 days) from Turso → VideoTable

Search
  └─ /api/search?q=... → SQL LIKE on title/clean_title

Video page
  ├─ Video record from Turso
  ├─ getVideoMetadata() → on-demand scrape of asset page (not stored)
  └─ entry_id → Kaltura player embed + audio URL for transcription
```

## Scripts

- `pnpm sync-videos` (`scripts/sync-videos.ts`) — scrapes past N days (default 7), upserts to Turso, resolves entry IDs. Contains its own inline copy of the Kaltura resolution logic.
- `pnpm fetch-video-metadata` (`scripts/fetch-video-metadata.ts`) — dumps Turso video records to `analysis/video-metadata.json`. Despite the name, does not fetch the rich per-video metadata.

## Limitations

- Search is `LIKE %query%` on `title` and `clean_title` only — no full-text search, no search on category/body/metadata.
- Rich per-video metadata (summary, topics, related documents, speakers) is never persisted.
- `getVideoById` falls back to day-by-day scraping if the video isn't in Turso, up to 30 days back.
- Status calculation (`scheduled`/`live`/`finished`) works around UN Web TV's broken timezone handling by stripping timezones and appending `Z`.
