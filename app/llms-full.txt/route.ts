const DISCLAIMER =
  "Automatically generated transcript — may contain errors. Not an official United Nations record.";

const CONTENT = `# UN Transcripts — Full API Reference

> Automatically generated transcripts of public United Nations meetings — not official UN records.

UN Transcripts provides searchable, timestamped transcripts of public meetings from UN Web TV (webtv.un.org). Transcripts include speaker identification, topic analysis, and word-level timestamps synchronized to the video. Available in all six official UN languages: English, French, Spanish, Arabic, Chinese, Russian.

Disclaimer: "${DISCLAIMER}"

## The "append .json / .txt" rule

Every meeting page URL has matching data URLs — just append \`.json\` or \`.txt\` to the page path. Three shapes of the same content:

| Format | URL example | Use for |
|--------|-------------|---------|
| HTML page | \`/en/sc/10175\` | Humans, browsers |
| Structured JSON | \`/en/sc/10175.json\` | Programmatic access, downstream processing |
| Plain text | \`/en/sc/10175.txt\` | LLM context (compact, easy to parse) |

The locale prefix (\`/en\`, \`/fr\`, \`/es\`, \`/ar\`, \`/zh\`, \`/ru\`) selects the transcript language. Override with \`?language=XX\` if you want a language different from the URL locale.

The collection endpoint follows the same rule: \`/en/meetings.json\` is the JSON form of "the meetings list page."

## Quick start

1. **Search** for meetings: \`GET /en/meetings.json?q={query}\`
2. **Read** a transcript: \`GET /en/sc/10175.txt\`

---

## Search & browse meetings

\`\`\`
GET /{locale}/meetings.json
\`\`\`

Returns a paginated list of UN meetings matching the given filters. Covers the last 365 days.

### Query parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| \`q\`     | string | Search meeting titles and metadata (not transcript content). Min 2 characters. |
| \`category\` | string | Filter by meeting category. |
| \`date\`  | YYYY-MM-DD | Filter to a specific date. |
| \`sort\`  | enum | \`date_desc\` (default), \`date_asc\`, \`title_asc\`, \`title_desc\` |
| \`offset\`| integer | Pagination offset. Results come in chunks of 100. |
| \`text\`  | string (multi) | Filter by available documents: \`transcript\`, \`pv\` (verbatim record), \`sr\` (summary record). |
| \`xlang\` | \`1\` | Include meetings not yet available in the URL locale (default: hide them). |

### Response shape

\`\`\`json
{
  "meetings": [
    {
      "title": "...",
      "date": "YYYY-MM-DDT00:00:00.000Z",
      "body": "Security Council",
      "category": "...",
      "slug": "sc/{n}",
      "duration": "HH:MM:SS",
      "hasTranscript": true,
      "pageUrl": "/en/sc/{n}",
      "jsonUrl": "/en/sc/{n}.json",
      "textUrl": "/en/sc/{n}.txt"
    }
  ],
  "total": 42,
  "totalIncludingOther": 42,
  "hasMore": true,
  "offset": 0,
  "pageSize": 100
}
\`\`\`

### Notes

- Covers the last 365 days (same window as the website homepage).
- Use \`hasMore\` + incrementing \`offset\` to paginate through all results.
- The \`.txt\` variant (\`GET /{locale}/meetings.txt\`) returns a one-line-per-meeting summary, useful for quickly listing meetings into an LLM prompt.

---

## Read a transcript

### Plain text (recommended for LLMs)

\`\`\`
GET /{locale}/{slug}.txt
\`\`\`

Returns the transcript as plain text with speaker labels. Compact and easy to parse.

The locale selects the transcript language. Override with \`?language=XX\` (en, fr, es, ar, zh, ru).

**Example response:**

\`\`\`
UN Transcripts — https://transcripts.un.org/en/sc/10175
{title} — {body} — {date}
Language: en
Automatically generated transcript — may contain errors. Not an official United Nations record.

---

{Country} · {Function} · {Name} [{timestamp}]:

{transcript text...}
\`\`\`

### Structured JSON

\`\`\`
GET /{locale}/{slug}.json
\`\`\`

Returns full structured data with timestamps, speaker mappings, topics, and word-level timing.

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
    "pv_symbol": "S/PV.10175",
    "pv_part": 1,
    "slug": "sc/10175"
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

Slugs are derived from UN document symbols. Multi-part recordings of the same meeting take a trailing \`/N\` (the unsuffixed form addresses part 1).

| UN Body | Symbol | URL | Example |
|---------|--------|-----|---------|
| Security Council | S/PV.{n} | /{locale}/sc/{n}[/{p}] | /en/sc/10175 |
| General Assembly | A/{s}/PV.{n} | /{locale}/ga/{s}/{n}[/{p}] | /en/ga/79/21 |
| GA Emergency Session | A/ES-{s}/PV.{n} | /{locale}/ga/es{s}/{n}[/{p}] | /en/ga/es11/23 |
| GA Committees | A/C.{c}/{s}/PV.{n} | /{locale}/ga/c{c}/{s}/{n}[/{p}] | /en/ga/c1/79/7 |
| Human Rights Council | A/HRC/{s}/SR.{n} | /{locale}/hrc/{s}/{n}[/{p}] | /en/hrc/58/59 |
| ECOSOC | E/{y}/SR.{n} | /{locale}/ecosoc/{y}/{n}[/{p}] | /en/ecosoc/2024/10 |
| Permalink (any meeting) | — | /{locale}/asset/{asset_id} | /en/asset/k1o/k1o43lgs4z |

The \`asset/...\` form mirrors UN Web TV's URL grammar exactly — swap the host \`webtv.un.org\` → \`transcripts.un.org\` to find the corresponding transcript page.

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

- **Search scope**: \`GET /{locale}/meetings.json?q=\` searches video titles and metadata, not transcript content. It cannot find meetings based on what was said — only what the meeting is titled/categorized as.
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
