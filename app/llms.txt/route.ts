const CONTENT = `# UN Transcripts

> Automatically generated transcripts of public United Nations meetings — not official UN records.

UN Transcripts provides searchable, timestamped transcripts of public meetings from UN Web TV (webtv.un.org), covering the Security Council, General Assembly, Human Rights Council, ECOSOC, and other inter-governmental bodies. Transcripts include speaker identification, topic analysis, and word-level timestamps synchronized to the video.

Available in all six official UN languages: English, French, Spanish, Arabic, Chinese, Russian.

## The "append .json / .txt" rule

Every meeting page URL has matching data URLs — just append \`.json\` or \`.txt\`:

- Page (HTML): \`/en/sc/10175\`
- Same content as JSON: \`/en/sc/10175.json\`
- Same content as plain text: \`/en/sc/10175.txt\` (recommended for LLM context)

The locale prefix in the URL (\`/en\`, \`/fr\`, \`/ar\`, \`/zh\`, \`/ru\`, \`/es\`) selects the transcript language; override with \`?language=XX\` if needed.

## How to use (search → read)

- Search meetings: \`GET /en/meetings.json?q={query}\` — search meeting titles and metadata with filters for body, category, date, and document type. Paginated (250 per page). Covers the last 365 days. Note: searches titles/metadata only, not transcript content.
- Read transcript (text): \`GET /en/{slug}.txt\` — plain-text transcript with speaker labels, compact for LLM context.
- Read transcript (JSON): \`GET /en/{slug}.json\` — structured JSON with timestamps, speakers, topics, and optional word-level timing.
- [Full API reference](/llms-full.txt): detailed query parameters, response shapes, and known limitations.
- [OpenAPI spec](/openapi.json): machine-readable OpenAPI 3.0 spec (interactive UI at /openapi).

## Meeting URL scheme

Meeting pages have two URL families:

Citation URLs — derived from UN document symbols. Multi-part recordings of the same meeting (resumed, continued) take a trailing \`/N\` (e.g. \`/en/sc/10175/2\` for the resumed part). The unsuffixed form addresses part 1.

- Security Council: \`/{locale}/sc/{n}[/{p}]\` (e.g. /en/sc/9748 for S/PV.9748)
- General Assembly: \`/{locale}/ga/{session}/{meeting}[/{p}]\` (e.g. /en/ga/79/21)
- GA Committees: \`/{locale}/ga/c{n}/{session}/{meeting}[/{p}]\`
- Human Rights Council: \`/{locale}/hrc/{session}/{meeting}[/{p}]\`
- ECOSOC: \`/{locale}/ecosoc/{year}/{meeting}[/{p}]\`
- Human rights treaty bodies (cumulative SR numbering): \`/{locale}/cat/{n}[/{p}]\`, \`/{locale}/cerd/{n}\`, \`/{locale}/ccpr/{n}\`, \`/{locale}/cedaw/{n}\`, \`/{locale}/crc/{n}\`, \`/{locale}/crpd/{n}\`, \`/{locale}/cescr/{n}\`, \`/{locale}/cmw/{n}\`, \`/{locale}/ced/{n}\`, \`/{locale}/spt/{n}\`
- Daily press briefings (host + date): \`/{locale}/briefing/sg/{YYYY-MM-DD}[/{p}]\`, \`/{locale}/briefing/pga/{YYYY-MM-DD}\`, \`/{locale}/briefing/geneva/{YYYY-MM-DD}\`

Permalink URLs — mirror UN Web TV's asset URLs, so swapping the host gets you the corresponding transcript.

- Any meeting by its asset id: \`/{locale}/asset/{asset_id}\` (e.g. /en/asset/k1o/k1o43lgs4z mirrors webtv.un.org/en/asset/k1o/k1o43lgs4z)

## Pages

- [Home](/en)
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
