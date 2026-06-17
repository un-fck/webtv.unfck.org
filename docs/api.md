# Public API

All endpoints are public with no authentication required.

## URL Scheme

Meeting pages use human-readable slugs derived from UN document symbols:

| UN Body | Symbol Pattern | URL Pattern | Example |
|---|---|---|---|
| Security Council | `S/PV.{n}` | `/sc/{n}` | `/sc/9748` |
| General Assembly plenary | `A/{s}/PV.{n}` | `/ga/{s}/{n}` | `/ga/79/21` |
| GA Emergency Special Session | `A/ES-{s}/PV.{n}` | `/ga/es{s}/{n}` | `/ga/es11/23` |
| GA Committees | `A/C.{c}/{s}/SR.{n}` | `/ga/c{c}/{s}/{n}` | `/ga/c1/79/7` |
| Human Rights Council | `A/HRC/{s}/SR.{n}` | `/hrc/{s}/{n}` | `/hrc/58/59` |
| ECOSOC | `E/{y}/SR.{n}` | `/ecosoc/{y}/{n}` | `/ecosoc/2024/10` |
| Other / no symbol | — | `/meeting/{asset_id}` | `/meeting/k1tofqtch6` |

Multi-part meetings append `-part-{n}`: `/sc/9748-part-2`.

The slug is stored in the `videos.slug` column and computed from the video's `pv_symbol` field via `lib/meeting-slug.ts`.

## Search & browse meetings

```
GET /api/videos
```

Unified endpoint for both browsing and searching the meeting archive. This is the same endpoint that powers the homepage table. Covers the last 365 days (`last_seen`-based).

### Query parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search meeting titles and metadata — not transcript content (FTS with trigram ILIKE fallback). Min 2 characters. |
| `body` | string (multi) | Filter by UN body. Repeat for multiple: `?body=Security+Council&body=General+Assembly` |
| `category` | string (multi) | Filter by meeting category. Repeat for multiple. |
| `date` | YYYY-MM-DD | Filter to a specific date. |
| `sort` | enum | `date_desc` (default), `date_asc`, `title_asc`, `title_desc` |
| `offset` | integer | Pagination offset. Results come in chunks of 100. |
| `text` | string (multi) | Filter by available documents: `transcript`, `pv` (verbatim record), `sr` (summary record). |
| `locale` | string | UI locale for localized fields (en, fr, es, ar, zh, ru). |
| `xlang` | `1` | Include meetings in other languages (disables per-locale visibility filter). |
| `slim` | `1` | Compact response — returns only essential fields (recommended for machine consumers / LLM context). |

### Response

```json
{
  "videos": [ ... ],
  "total": 42,
  "totalIncludingOther": 50,
  "hasMore": true
}
```

**Default video object fields**: `id`, `url`, `title`, `cleanTitle`, `category`, `duration`, `date`, `scheduledTime`, `status`, `eventCode`, `eventType`, `body`, `sessionNumber`, `partNumber`, `pvSymbol`, `pvAvailable`, `slug`, `hasTranscript`, `hasTranscriptInLocale`, `removed`, `i18n`.

**With `slim=1`**: `title`, `date`, `body`, `category`, `slug`, `duration`, `hasTranscript`, `jsonUrl`.

## JSON API

### List recent transcribed meetings

```
GET /json
```

Returns transcribed meetings from the last 14 days with metadata and links:

```json
{
  "disclaimer": "Automatically generated transcript — ...",
  "count": 12,
  "videos": [
    {
      "id": "security-council/k1abc123",
      "slug": "sc/9748",
      "title": "9748th meeting",
      "clean_title": "9748th meeting",
      "url": "https://webtv.un.org/en/asset/k1abc123",
      "page_url": "/sc/9748",
      "json_url": "/json/sc/9748",
      "date": "2024-03-15",
      "duration": "01:30:00",
      "category": "Security Council",
      "body": "Security Council"
    }
  ]
}
```

### Get a single meeting

```
GET /json/{meeting-slug}
```

Examples:
- `GET /json/sc/9748`
- `GET /json/ga/79/21`
- `GET /json/hrc/58/59`

Returns the video object with full transcript data including statements, speaker mappings, and topics.

#### Query parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `language` | string | Language track to return (en, fr, es, ar, zh, ru). Defaults to the first available. |
| `format` | `text` | Return a plain-text transcript instead of JSON. Speaker-labeled, compact for LLM context. |

#### Plain-text format (`?format=text`)

```
UN Transcripts — https://transcripts.un.org/en/{slug}
{title} — {body} — {date}
Language: en
Automatically generated transcript — may contain errors. Not an official United Nations record.

---

{Country} · {Function} · {Name} [{timestamp}]:

{transcript text...}
```

#### JSON response shape

```json
{
  "disclaimer": "Automatically generated transcript — ...",
  "video": {
    "id": "...",
    "kaltura_id": "...",
    "title": "...",
    "clean_title": "...",
    "url": "https://webtv.un.org/...",
    "date": "YYYY-MM-DDT00:00:00.000Z",
    "duration": "HH:MM:SS",
    "category": "...",
    "body": "...",
    "slug": "..."
  },
  "metadata": {
    "summary": "...",
    "description": "...",
    "categories": ["..."],
    "geographic_subject": "...",
    "related_documents": ["..."]
  },
  "transcript": {
    "transcript_id": "...",
    "language": "en",
    "data": [
      {
        "statement_number": 1,
        "speaker": {
          "name": "...",
          "affiliation": "XXX",
          "affiliation_full": "...",
          "group": null,
          "function": "..."
        },
        "paragraphs": [
          {
            "sentences": [
              {
                "text": "...",
                "start": 12.0,
                "end": 15.0,
                "topics": [{ "key": "...", "label": "...", "description": "..." }],
                "words": [
                  { "text": "...", "start": 12.0, "end": 12.2 }
                ]
              }
            ]
          }
        ]
      }
    ],
    "topics": [
      {
        "key": "...",
        "label": "...",
        "description": "..."
      }
    ]
  }
}
```

**Key fields:**

- `data[]` — speaker turns (statements); each has `paragraphs[].sentences[]` with `text`, `start`/`end` (**seconds**, floating point), `topics`, and an optional per-sentence `words[]` array with `text` + `start`/`end` in seconds. `words` is omitted when the underlying STT provider didn't supply word-level timing.
- `speaker` on each statement — resolved speaker info (name, function, affiliation as ISO 3166-1 alpha-3, affiliation_full as country name, group).
- `topics[]` on each sentence — 0–3 topics this sentence relates to (key + label + description, denormalized for convenience).

## LLM discovery

- `/llms.txt` — concise site overview for LLM context (llms.txt spec)
- `/llms-full.txt` — detailed API reference for LLM use
