# Public API

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

## JSON API

### List all transcribed meetings

```
GET /json
```

Returns an array of video objects with metadata and links:

```json
[
  {
    "asset_id": "security-council/k1abc123",
    "title": "9748th meeting",
    "clean_title": "9748th meeting",
    "date": "2024-03-15",
    "duration": 5400,
    "category": "Security Council",
    "body": "Security Council",
    "slug": "sc/9748",
    "page_url": "/sc/9748",
    "json_url": "/json/sc/9748",
    "transcript": { ... }
  }
]
```

### Get a single meeting

```
GET /json/{meeting-slug}
```

Examples:
- `GET /json/sc/9748`
- `GET /json/ga/79/21`
- `GET /json/hrc/58/59`

Returns the video object with full transcript data including statements, speaker mappings, topics, and propositions.

**Response shape:**

```json
{
  "asset_id": "...",
  "entry_id": "1_xxxxxxxx",
  "title": "...",
  "clean_title": "...",
  "date": "YYYY-MM-DD",
  "duration": 5400,
  "category": "...",
  "body": "...",
  "slug": "sc/9748",
  "transcript": {
    "transcript_id": "...",
    "status": "completed",
    "language": "en",
    "statements": [
      {
        "start": 12000,
        "end": 45000,
        "paragraphs": [
          {
            "start": 12000,
            "end": 45000,
            "sentences": [
              {
                "text": "The meeting is called to order.",
                "start": 12000,
                "end": 15000,
                "topic_keys": ["procedural"]
              }
            ],
            "words": [
              { "text": "The", "start": 12000, "end": 12200 },
              { "text": "meeting", "start": 12200, "end": 12600 }
            ]
          }
        ],
        "words": [...]
      }
    ],
    "speakerMappings": {
      "0": {
        "name": "Speaker Name",
        "function": "President",
        "affiliation": "FRA",
        "group": null
      }
    },
    "topics": {
      "climate-action": {
        "key": "climate-action",
        "label": "Climate Action",
        "description": "Discussion of climate-related policy measures"
      }
    },
    "propositions": [
      {
        "key": "resolution-draft",
        "title": "Draft Resolution on...",
        "statement": "...",
        "positions": [
          {
            "stance": "support",
            "stakeholders": ["France", "Germany"],
            "summary": "...",
            "evidence": [
              {
                "quote": "...",
                "statementIndex": 3
              }
            ]
          }
        ]
      }
    ]
  }
}
```

**Key fields:**

- `statements[]` — speaker turns, each containing paragraphs with sentences and word-level timestamps (in milliseconds)
- `speakerMappings` — maps statement index (as string) to speaker info (name, function, affiliation as ISO 3166-1 alpha-3, group)
- `topics` — policy topics identified in the discussion, keyed by slug
- `propositions` — stakeholder position analysis (only present if analysis has been run)
- `topic_keys` on sentences — which topics each sentence relates to (0-3 per sentence)

## Authentication

The JSON API is public with no authentication required.
