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

Meeting pages have two URL families:

Citation URLs — derived from UN document symbols. Multi-part recordings of the same meeting (resumed, continued) take a trailing \`/N\` (e.g. \`/sc/10175/2\` for the resumed part). The unsuffixed form addresses part 1.

- Security Council: \`/sc/{n}[/{p}]\` (e.g. /sc/9748 for S/PV.9748)
- General Assembly: \`/ga/{session}/{meeting}[/{p}]\` (e.g. /ga/79/21)
- GA Committees: \`/ga/c{n}/{session}/{meeting}[/{p}]\`
- Human Rights Council: \`/hrc/{session}/{meeting}[/{p}]\`
- ECOSOC: \`/ecosoc/{year}/{meeting}[/{p}]\`

Permalink URLs — mirror UN Web TV's asset URLs, so swapping the host gets you the corresponding transcript.

- Any meeting by its asset id: \`/asset/{asset_id}\` (e.g. /asset/k1o/k1o43lgs4z mirrors webtv.un.org/en/asset/k1o/k1o43lgs4z)

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
