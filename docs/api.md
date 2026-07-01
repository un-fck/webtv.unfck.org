# Public API

All endpoints are public with no authentication required.

## URL Scheme

Every meeting page URL has matching data URLs — just append `.json` or `.txt`:

| Format          | Example             | Use for             |
| --------------- | ------------------- | ------------------- |
| HTML page       | `/en/sc/10175`      | Humans, browsers    |
| Structured JSON | `/en/sc/10175.json` | Programmatic access |
| Plain text      | `/en/sc/10175.txt`  | LLM context         |

The locale prefix selects the transcript language (`en`, `fr`, `es`, `ar`, `zh`, `ru`). Override with `?language=XX` if you want a language different from the URL locale.

Internally the rewrite is handled by `proxy.ts`, which maps `/{locale}/{...path}.{json|txt}` to `app/api/data/[locale]/[format]/[...path]/route.ts`, encoding the format as a **path segment** (`json`/`text`) rather than a query param — `NextResponse.rewrite` doesn't reliably surface added search params to the destination handler's `request.nextUrl`, but path segments survive via the route's params. The catch-all handler dispatches on the first path segment (`meetings` → list, `asset` → permalink, anything else → citation slug).

### Citation slugs

Slugs are derived from UN document symbols. Multi-part recordings of the same meeting take a trailing `/N` (the unsuffixed form addresses part 1).

| UN Body                      | Symbol Pattern             | URL Pattern                       | Example              |
| ---------------------------- | -------------------------- | --------------------------------- | -------------------- |
| Security Council             | `S/PV.{n}`                 | `/{locale}/sc/{n}[/{p}]`          | `/en/sc/10175`       |
| General Assembly plenary     | `A/{s}/PV.{n}`             | `/{locale}/ga/{s}/{n}[/{p}]`      | `/en/ga/79/21`       |
| GA Emergency Special Session | `A/ES-{s}/PV.{n}`          | `/{locale}/ga/es{s}/{n}[/{p}]`    | `/en/ga/es11/23`     |
| GA Committees                | `A/C.{c}/{s}/{PV\|SR}.{n}` | `/{locale}/ga/c{c}/{s}/{n}[/{p}]` | `/en/ga/c1/79/7`     |
| Human Rights Council         | `A/HRC/{s}/SR.{n}`         | `/{locale}/hrc/{s}/{n}[/{p}]`     | `/en/hrc/58/59`      |
| ECOSOC                       | `E/{y}/SR.{n}`             | `/{locale}/ecosoc/{y}/{n}[/{p}]`  | `/en/ecosoc/2024/10` |

GA committees use `PV` (verbatim) only for the 1st Committee; the 2nd–6th Committees use `SR` (summary) — see `docs/official-transcripts.md`. The `/ga/c{c}/…` page URL is identical either way; only the underlying document symbol suffix differs.

### Permalink (any meeting by asset id)

```
/{locale}/asset/{asset_id}
```

Mirrors UN Web TV's URL grammar exactly — swap the host `webtv.un.org` → `transcripts.un.org` to find the corresponding transcript page.

Slug logic lives in `lib/meeting-slug.ts`; the page-URL builder is `videoUrl()` in `lib/video-url.ts`.

## Search & browse meetings

```
GET /{locale}/meetings.json
```

Returns a paginated list of UN meetings matching the given filters. Covers the last 365 days.

### Query parameters

| Parameter  | Type           | Description                                                                                                      |
| ---------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `q`        | string         | Search meeting titles and metadata — not transcript content (FTS with trigram ILIKE fallback). Min 2 characters. |
| `category` | string         | Filter by meeting category.                                                                                      |
| `date`     | YYYY-MM-DD     | Filter to a specific date. Mutually exclusive with `from`/`to`.                                                  |
| `from`     | YYYY-MM-DD     | Inclusive start of a date range.                                                                                 |
| `to`       | YYYY-MM-DD     | Inclusive end of a date range.                                                                                   |
| `sort`     | enum           | `date_desc` (default), `date_asc`, `title_asc`, `title_desc`                                                     |
| `offset`   | integer        | Pagination offset. Results come in chunks of 250.                                                                |
| `text`     | string (multi) | Filter by available documents: `transcript`, `pv` (verbatim record), `sr` (summary record).                      |
| `xlang`    | `1`            | Include meetings not yet available in the URL locale (default: hide them).                                       |

### Response

```json
{
  "meetings": [
    {
      "title": "...",
      "date": "YYYY-MM-DDT00:00:00.000Z",
      "body": "Security Council",
      "category": "...",
      "slug": "sc/10175",
      "duration": "01:30:00",
      "hasTranscript": true,
      "pageUrl": "/en/sc/10175",
      "jsonUrl": "/en/sc/10175.json",
      "textUrl": "/en/sc/10175.txt"
    }
  ],
  "total": 42,
  "totalIncludingOther": 50,
  "hasMore": true,
  "offset": 0,
  "pageSize": 100
}
```

The `.txt` variant (`GET /{locale}/meetings.txt`) returns a one-line-per-meeting summary.

The internal homepage feed still lives at `/api/videos` and returns the full video shape used by the table component — it is not part of the public contract and may change.

## Get a single meeting

```
GET /{locale}/{slug}.json
```

Examples:

- `GET /en/sc/10175.json`
- `GET /fr/ga/79/21.json` (French transcript)
- `GET /en/sc/10175/2.json` (part 2)
- `GET /en/asset/k1o/k1o43lgs4z.json` (permalink form)

Returns the video object with full transcript data including statements, speaker mappings, and topics.

### Query parameters

| Parameter  | Type   | Description                                                                            |
| ---------- | ------ | -------------------------------------------------------------------------------------- |
| `language` | string | Language track to return (en, fr, es, ar, zh, ru). Overrides the URL locale's default. |

### Plain-text format

```
GET /{locale}/{slug}.txt
```

Returns the transcript as plain text with speaker labels, compact for LLM context:

```
UN Transcripts — https://transcripts.un.org/en/sc/10175
{title} — {body} — {date}
Language: en
Automatically generated transcript — may contain errors. Not an official United Nations record.

---

{Country} · {Function} · {Name} [{timestamp}]:

{transcript text...}
```

### JSON response shape

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
    "pv_symbol": "S/PV.10175",
    "pv_part": 1,
    "slug": "sc/10175"
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
                "topics": [
                  { "key": "...", "label": "...", "description": "..." }
                ],
                "words": [{ "text": "...", "start": 12.0, "end": 12.2 }]
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
