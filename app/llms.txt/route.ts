const CONTENT = `# UN Transcripts

> Automatically generated transcripts of public United Nations meetings — not official UN records.

UN Transcripts provides searchable, timestamped transcripts of public meetings from UN Web TV (webtv.un.org), covering the Security Council, General Assembly, Human Rights Council, ECOSOC, and other inter-governmental bodies. Transcripts include speaker identification, topic analysis, and word-level timestamps synchronized to the video.

Available in all six official UN languages: English, French, Spanish, Arabic, Chinese, Russian.

## How to use (search → read)

- Search meetings: \`GET /api/videos?q={query}&slim=1\` — search meeting titles and metadata with filters for body, category, date, and document type. Paginated (100 per page). Covers the last 365 days. Use \`slim=1\` for compact responses. Note: searches titles/metadata only, not transcript content.
- Read transcript (text): \`GET /json/{slug}?format=text\` — plain-text transcript with speaker labels, compact for LLM context. No time limit — works for any meeting by slug.
- Read transcript (JSON): \`GET /json/{slug}\` — structured JSON with timestamps, speakers, topics, and optional word-level timing.
- [Full API reference](/llms-full.txt): detailed query parameters, response shapes, and known limitations.

## Meeting URL scheme

Meeting pages use human-readable slugs derived from UN document symbols:

- Security Council: \`/sc/{n}\` (e.g. /sc/9748 for S/PV.9748)
- General Assembly: \`/ga/{session}/{meeting}\` (e.g. /ga/79/21)
- GA Committees: \`/ga/c{n}/{session}/{meeting}\`
- Human Rights Council: \`/hrc/{session}/{meeting}\`
- ECOSOC: \`/ecosoc/{year}/{meeting}\`
- Other meetings: \`/meeting/{asset_id}\`

## Pages

- [Home](/)
- [About](/en/about)
`;

export function GET() {
  return new Response(CONTENT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
