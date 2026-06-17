const DISCLAIMER =
  "Automatically generated transcript — may contain errors. Not an official United Nations record.";

const CONTENT = `# UN Transcripts — Full API Reference

> Automatically generated transcripts of public United Nations meetings — not official UN records.

UN Transcripts provides searchable, timestamped transcripts of public meetings from UN Web TV (webtv.un.org). Transcripts include speaker identification, topic analysis, and word-level timestamps synchronized to the video. Available in all six official UN languages: English, French, Spanish, Arabic, Chinese, Russian.

Disclaimer: "${DISCLAIMER}"

## Quick start

1. **Search** for meetings: \`GET /api/videos?q={query}&slim=1\`
2. **Read** a transcript: \`GET /json/{slug}?format=text\`

---

## Search & browse meetings

\`\`\`
GET /api/videos
\`\`\`

Returns a paginated list of UN meetings matching the given filters. This is the same endpoint that powers the website's homepage table.

### Query parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| \`q\`     | string | Search meeting titles and metadata (not transcript content). Min 2 characters. |
| \`body\`  | string (multi) | Filter by UN body. Repeat for multiple: \`?body=Security+Council&body=General+Assembly\` |
| \`category\` | string (multi) | Filter by meeting category. Repeat for multiple. |
| \`date\`  | YYYY-MM-DD | Filter to a specific date. |
| \`sort\`  | enum | \`date_desc\` (default), \`date_asc\`, \`title_asc\`, \`title_desc\` |
| \`offset\`| integer | Pagination offset. Results come in chunks of 100. |
| \`text\`  | string (multi) | Filter by available documents: \`transcript\`, \`pv\` (verbatim record), \`sr\` (summary record). |
| \`slim\`  | \`1\` | Compact response — returns only essential fields (recommended for LLM use). |

### Response shape (slim=1)

\`\`\`json
{
  "videos": [
    {
      "title": "...",
      "date": "YYYY-MM-DDT00:00:00.000Z",
      "body": "Security Council",
      "category": "...",
      "slug": "sc/{n}",
      "duration": "HH:MM:SS",
      "hasTranscript": true,
      "jsonUrl": "/json/sc/{n}"
    }
  ],
  "total": 42,
  "totalIncludingOther": 42,
  "hasMore": true
}
\`\`\`

### Notes

- Covers the last 365 days (same window as the website homepage).
- Without \`slim=1\`, each video object includes ~20 additional fields used by the frontend UI.
- Use \`hasMore\` + incrementing \`offset\` to paginate through all results.

---

## Read a transcript

### Plain text (recommended for LLMs)

\`\`\`
GET /json/{slug}?format=text
\`\`\`

Returns the transcript as plain text with speaker labels. Compact and easy to parse. No time limit — works for any meeting by its slug.

**Optional**: \`?language=fr\` to get a specific language track (default: English if available).

**Example response:**

\`\`\`
UN Transcripts — https://transcripts.un.org/en/{slug}
{title} — {body} — {date}
Language: en
Automatically generated transcript — may contain errors. Not an official United Nations record.

---

{Country} · {Function} · {Name} [{timestamp}]:

{transcript text...}
\`\`\`

### Structured JSON

\`\`\`
GET /json/{slug}
\`\`\`

Returns full structured data with timestamps, speaker mappings, topics, and word-level timing.

**Optional**: \`?language=fr\` to get a specific language track.

**Response shape:**

\`\`\`json
{
  "disclaimer": "Automatically generated transcript — ...",
  "video": {
    "id": "...",
    "kaltura_id": "...",
    "title": "...",
    "clean_title": "...",
    "url": "https://webtv.un.org/en/asset/...",
    "date": "YYYY-MM-DDT00:00:00.000Z",
    "duration": "HH:MM:SS",
    "category": "...",
    "body": "...",
    "slug": "..."
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
                  {
                    "key": "...",
                    "label": "...",
                    "description": "..."
                  }
                ],
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
\`\`\`

**Key fields:**

- \`data[]\` — speaker turns (statements). Each has \`paragraphs[].sentences[]\` with \`text\`, \`start\`/\`end\` (seconds, float), \`topics\`, and optional \`words[]\`.
- \`speaker\` — resolved speaker info. \`affiliation\` is ISO 3166-1 alpha-3. \`affiliation_full\` is the expanded country name.
- \`topics[]\` on each sentence — 0–3 topics this sentence relates to.
- \`words[]\` — word-level timing (omitted when the provider didn't supply it).

---

## Meeting URL scheme

Slugs are derived from UN document symbols:

| UN Body | Symbol | URL | Example |
|---------|--------|-----|---------|
| Security Council | S/PV.{n} | /sc/{n} | /sc/9748 |
| General Assembly | A/{s}/PV.{n} | /ga/{s}/{n} | /ga/79/21 |
| GA Emergency Session | A/ES-{s}/PV.{n} | /ga/es{s}/{n} | /ga/es11/23 |
| GA Committees | A/C.{c}/{s}/SR.{n} | /ga/c{c}/{s}/{n} | /ga/c1/79/7 |
| Human Rights Council | A/HRC/{s}/SR.{n} | /hrc/{s}/{n} | /hrc/58/59 |
| ECOSOC | E/{y}/SR.{n} | /ecosoc/{y}/{n} | /ecosoc/2024/10 |
| Other | — | /meeting/{asset_id} | /meeting/k1tofqtch6 |

Multi-part meetings append \`-part-{n}\`: \`/sc/9748-part-2\`.

---

## Coverage

Public meetings recorded on UN Web TV, including:

- Security Council
- General Assembly (plenary and all main committees)
- Human Rights Council
- Economic and Social Council
- Other inter-governmental bodies as available

Closed or confidential meetings are not covered (they are not recorded on Web TV).

---

## Known limitations

- **Search scope**: the \`/api/videos?q=\` search covers video titles and metadata, not transcript content. It cannot find meetings based on what was said — only what the meeting is titled/categorized as.
- **No speaker filtering**: to find what a specific speaker or country said, fetch the full transcript and search within it.
- **Time window**: search and browse cover the last 365 days, matching the website homepage.
- **Transcript accuracy**: these are automatic speech recognition outputs, not official records. Names, abbreviations, and document symbols may be misheard. Accuracy varies by speaker and microphone quality.
- **Languages**: six UN languages are supported (en, fr, es, ar, zh, ru). Not every meeting has transcripts in all languages — it depends on which audio tracks are available.
`;

export function GET() {
  return new Response(CONTENT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
