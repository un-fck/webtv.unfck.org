# UN Web TV & Kaltura: Video Fetching Pipeline

## Overview

UN Web TV (`webtv.un.org`) has no public API. All video data is obtained by scraping HTML pages. The videos themselves are not hosted by the UN — they live in the UN's account on **Kaltura** (partner ID `2503451`), a commercial video platform that the UN Web TV site embeds. This split is the source of nearly all the ID complexity below:

- To **discover** videos, we scrape UN Web TV's HTML (it has no API).
- To get the **actual audio** for transcription, we talk to the **Kaltura API** directly (the UN doesn't expose it).

The two worlds use different identifiers, and a single video carries **three** of them.

## The Three IDs (read this before touching anything)

Worked example — the video at `webtv.un.org/.../k1h/k1hrmtg9f4`:

```
asset_id            kaltura_id (player)        entry_id (canonical)
k1h/k1hrmtg9f4  ──►  1_hrmtg9f4          ──►   1_yuo0w3j6
   (regex, free)        (Kaltura API, follows redirect)
```

### 1. `asset_id` — UN Web TV's own identifier

The UN's ID for the video, found in the page URL (e.g. `k1h/k1hrmtg9f4`). It is the **primary key** of the `videos` table and means nothing to Kaltura. Free to obtain (it's in the URL).

### 2. `kaltura_id` — the "player ID" (the entry ID embedded in the page)

The Kaltura ID the embedded player uses, parsed straight out of the asset string by [`extractKalturaId()`](../lib/kaltura.ts) — **pure string parsing, no network**. It tries several regex shapes (parenthetical `(1_xxx)`, `/id/1_xxx` path segment, `k1`-prefixed, double-segment, or a bare `1_xxxxxxxx`). For the example, `k1h/k1hrmtg9f4` → `1_hrmtg9f4`. Kaltura entry IDs always look like `1_xxxxxxxx`.

Think of this as "the ID printed on the embed code." Stable and cheap — and therefore the **preferred** key for looking transcripts up.

### 3. `entry_id` — the *canonical* Kaltura entry

The player ID is **not necessarily the real, current entry**. Kaltura supports **redirects**: an entry can forward to another via a field literally named `redirectFromEntryId`. This happens when content is re-uploaded, replaced, merged, or re-published — the old ID keeps working but points at the new canonical entry, where the actual media (and its audio) lives.

For the example, `1_hrmtg9f4` **redirects to `1_yuo0w3j6`**. Resolving player → canonical **requires a Kaltura API call**, because only Kaltura knows about the redirect.

> **Most videos have no redirect**, so `kaltura_id == entry_id` and the distinction never matters. The painful cases are the ones where they differ — those are where lookups get slow and legacy data gets inconsistent (see [Gotchas](#legacy-data-gotchas-the-redirect-case)).

### Resolving player ID → canonical entry ID

Two code paths do this, both POSTing to `https://cdnapisec.kaltura.com/api_v3/service/multirequest`:

- [`resolveEntryIdFromKaltura()`](../lib/kaltura-helpers.ts) — minimal: `session.startWidgetSession` (widget `_2503451`) to get a token, then `baseEntry.list` filtered by `redirectFromEntryId` to get the canonical `id`. Wrapped by [`resolveEntryId()`](../lib/kaltura-helpers.ts), which **returns the cached `videos.entry_id` immediately if present** and only calls Kaltura on a miss, writing the result back via `updateVideoEntryId`.
- [`getKalturaAudioUrl()`](../lib/transcription.ts) — same session + lookup, but also pulls the **flavor list** (next section) so it can return both the canonical `entryId` and a downloadable `audioUrl` in one round trip.

## Flavors — getting the actual audio

A Kaltura entry is **not one file**; it's a bundle of **flavors** (renditions of the same content):

- video at various resolutions (1080p, 720p, …);
- **audio-only** tracks — and the UN provides a **separate audio-only flavor per interpreted language** (the floor/original plus the other official UN languages).

Each flavor carries:

- `flavorParamsId` — which rendition/profile it is (e.g. "English audio-only");
- `status` — **`2` = READY/transcodable**; other values mean queued, converting, or errored;
- `tags` (e.g. `audio_only`) and a `language`.

[`getKalturaAudioUrl()`](../lib/transcription.ts) filters the flavor list to `audio_only` + the requested language + `status === 2`, picks one (preferring the default), and builds a Kaltura `playManifest` download URL with `buildAudioUrl(entryId, flavorParamId)`. That URL is handed to the transcription provider. [`getAvailableAudioLanguages()`](../lib/transcription.ts) uses the same list to enumerate which languages have ready audio.

> **Flavors are time-varying.** Right after a meeting ends, often only the floor audio exists; the interpreted-language flavors are transcoded and flip to `status 2` over the following minutes-to-hours. This is *not* something we cache — `/api/cron/process-scheduled` polls this very list to decide "is the recording ready to transcribe yet?" (and skips live streams via the returned `isLiveStream`). See `docs/ai.md` for the scheduled-transcription flow.

## How the IDs map to the database

| Table | `asset_id` | `kaltura_id` | `entry_id` |
|---|---|---|---|
| `videos` | **PK** | player ID (from `extractKalturaId`) | canonical, resolved & cached |
| `transcripts` | — | player ID (newer rows) | **NOT NULL** — the entry the transcript was produced from |

There are **no foreign keys**. A transcript is linked to a video purely by matching IDs. Lookups try the IDs in order of cost:

1. **By `kaltura_id`** — cheap, no Kaltura call. Preferred (`getActiveTranscriptByKalturaId`, `getTranscriptByKalturaId`).
2. **Fall back to resolving `entry_id`** (one Kaltura API call) and looking up by that (`getActiveTranscriptByEntryId`, `getTranscript`).

"Active" lookups return the **latest non-`error`** full-meeting row (`start_time`/`end_time` NULL), so a failed re-transcription can't mask an older good one. (Both the kaltura-id and entry-id variants enforce this; the entry-id variant was added after a bug where it didn't — see below.)

## Legacy-data gotchas (the redirect case)

When `kaltura_id != entry_id` **and** the rows are old, three independent problems can stack up. The example video hit all three:

1. **Transcript rows with `kaltura_id = NULL`.** Older rows predate the `kaltura_id` column being populated. The cheap step-1 lookup misses entirely, forcing the **Kaltura-resolution fallback on every page load** → the "Checking for existing transcript…" spinner can take several seconds (cold DB connection + extra Kaltura round trip + large JSONB payload), even though the per-call Kaltura latency itself is only ~200 ms.
2. **Stale `videos.entry_id`.** For redirected videos, `videos.entry_id` may hold the **pre-redirect player ID** (`1_hrmtg9f4`) rather than the true canonical (`1_yuo0w3j6`). The `resolveEntryId` cache would then hand back the wrong entry — so we can't blindly trust it to skip the Kaltura call for these rows.
3. **Newer `error` row masking an older `completed` one.** A meeting transcribed successfully and later re-transcribed unsuccessfully has both a `completed` and a newer `error` row under the same `entry_id`. A naive "latest row, any status" lookup returns the error and reports "no transcript." This is exactly why the entry-id fallback must use the **non-error** `getActiveTranscriptByEntryId` rather than plain `getTranscript`.

> **Normalizing fix (not yet applied):** a one-off backfill that, for affected rows, sets `transcripts.kaltura_id` to the player ID and corrects `videos.entry_id` to the true canonical entry would let the fast path hit and remove the redirect fragility. It must resolve the canonical ID per video, so it's a deliberate migration.

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

**None of these are stored in the database.** They are fetched on demand only.

## What Gets Stored (`videos` table)

| Column | Source | Notes |
|---|---|---|
| `asset_id` | Schedule page URL | Primary key |
| `kaltura_id` | `extractKalturaId(asset_id)` | Player ID, parsed from the asset (no network) |
| `entry_id` | Kaltura API | Canonical entry; resolved asynchronously and cached. Equals `kaltura_id` unless the entry redirects |
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
| `slug` | Derived from `pv_symbol` or `asset_id` | Human-readable URL slug (e.g. `sc/9748`, `ga/79/21`) |
| `last_seen` | Sync date | Used for recency filtering |

The `saveVideo` upsert uses `COALESCE` for `entry_id` and `pv_symbol` to never overwrite resolved values with null.

## Data Flow Summary

```
Schedule page HTML
  ├─ scrapeVideos() → Video[] (in-memory)
  ├─ saveVideo() → `videos` table (upsert; COALESCE preserves resolved entry_id / pv_symbol)
  └─ resolveEntryId() → Kaltura API → updates `entry_id`

App page load
  └─ getRecentVideos(14 days) → VideoTable (with cached helpers in lib/cached-db.ts)

Search
  └─ /api/search?q=... → tsvector FTS over clean_title/title, with trigram-accelerated ILIKE fallback

Video page
  ├─ Video record from DB (lookup by slug, fall back to asset_id)
  ├─ getVideoMetadata() → on-demand scrape of asset page (not stored)
  └─ entry_id → Kaltura player embed + audio URL for transcription
```

## Scripts

- `pnpm sync-videos` (`scripts/sync-videos.ts`) — scrapes past N days (default 7), upserts to the database, resolves entry IDs. Contains its own inline copy of the Kaltura resolution logic.
- `pnpm fetch-video-metadata` (`scripts/fetch-video-metadata.ts`) — dumps stored video records to `analysis/video-metadata.json`. Despite the name, does **not** call the per-video metadata scraper.
- `pnpm backfill-slugs` / `pnpm fix-slugs` — populate or repair the `slug` column when the meeting-slug logic changes.
- `/api/cron/sync-videos` — Vercel cron (every 15 min) calls the same scraper logic against the live DB, so the script is mostly used for ad-hoc backfills.

## Limitations & Gotchas

- Search uses Postgres FTS + trigram fallback only on `title` / `clean_title`. There is no search across category/body/metadata.
- Rich per-video metadata (summary, topics, related documents, speakers) is fetched on demand and never persisted.
- `getVideoBySlug` falls back to looking up by `asset_id` if no slug match — useful during the slug-migration window.
- Status calculation (`scheduled`/`live`/`finished`) works around UN Web TV's broken timezone handling by stripping timezones and appending `Z` — see `lib/timezone.ts`.
