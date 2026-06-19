import { NextRequest, NextResponse } from "next/server";
import {
  getVideoByAssetId,
  getVideoByCitation,
  getTranscriptByKalturaId,
  queryVideos,
  type VideoRecord,
  type VideosQueryParams,
} from "@/lib/db";
import {
  getCachedTranscriptedEntries,
  getCachedTranscriptedEntriesByLanguage,
} from "@/lib/cached-db";
import { getVideoMetadata, recordToVideo } from "@/lib/un-api";
import {
  getSpeakerMapping,
  SpeakerInfo,
  formatSpeakerInfo,
} from "@/lib/speakers";
import { getCountryName } from "@/lib/country-lookup";
import { symbolFromSlug } from "@/lib/meeting-slug";
import { videoUrl } from "@/lib/video-url";
import { TRANSCRIPT_DISCLAIMER } from "@/lib/config";
import { routing } from "@/i18n/routing";
import {
  buildSpeakerSegments,
  formatTranscriptAsPlainText,
  formatSpeakerText,
  formatTimecode,
} from "@/lib/transcript-formatting";

// Unified data-API handler. The proxy (proxy.ts) rewrites
//   /{locale}/{slug}.json     → /api/data/{locale}/json/{slug}
//   /{locale}/{slug}.txt      → /api/data/{locale}/text/{slug}
//   /{locale}/meetings.json   → /api/data/{locale}/json/meetings
// so the public URL grammar mirrors page URLs ("append .json / .txt to any
// meeting page to get the same content as data"), while the implementation
// lives in one place. Format is encoded as a path segment rather than a
// query param because `NextResponse.rewrite` does not reliably surface
// added search params to the destination handler's `request.nextUrl`.

const SUPPORTED_LOCALES = routing.locales as readonly string[];
const SUPPORTED_FORMATS = ["json", "text"] as const;
type Format = (typeof SUPPORTED_FORMATS)[number];

// Page size for the public data API. Larger than the homepage feed's 100
// chunk (lib/cached-db) — the homepage is paginated for UI rendering, this
// surface is read by machines / LLMs that want fewer round-trips.
const LIST_PAGE_SIZE = 250;
const LIST_DAYS_BACK = 365;

const SORT_VALUES = ["date_desc", "date_asc", "title_asc", "title_desc"];

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function jsonHeaders(res: NextResponse) {
  res.headers.set("Content-Type", "application/json; charset=utf-8");
  res.headers.set("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  return res;
}

function textResponse(body: string, cacheable = true): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...(cacheable
        ? { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" }
        : {}),
    },
  });
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ locale: string; format: string; path: string[] }>;
  },
) {
  try {
    const { locale, format: formatRaw, path } = await context.params;
    if (!SUPPORTED_LOCALES.includes(locale)) {
      return NextResponse.json({ error: "Unknown locale" }, { status: 404 });
    }
    if (!SUPPORTED_FORMATS.includes(formatRaw as Format)) {
      return badRequest(
        `format must be one of: ${SUPPORTED_FORMATS.join(", ")}`,
      );
    }
    const format = formatRaw as Format;

    // Decode each segment (proxy.ts passes them through unchanged).
    const segs = path.map(decodeURIComponent);

    // List / search endpoint: /{locale}/meetings.{json|txt}
    if (segs.length === 1 && segs[0] === "meetings") {
      return handleList(request, locale, format);
    }

    // Asset permalink: /{locale}/asset/{id...}.{json|txt}
    if (segs[0] === "asset" && segs.length >= 2) {
      const assetId = segs.slice(1).join("/");
      const record = await getVideoByAssetId(assetId);
      if (!record) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
      }
      return handleMeeting(request, locale, record, format);
    }

    // Citation slug: /{locale}/sc/10175(/N).{json|txt}, etc.
    const slug = segs.join("/");
    const parsed = symbolFromSlug(slug);
    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid meeting path" },
        { status: 404 },
      );
    }
    const record = await getVideoByCitation(parsed);
    if (!record) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    return handleMeeting(request, locale, record, format);
  } catch (error) {
    console.error("Data API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// -- meeting detail --------------------------------------------------------

async function handleMeeting(
  request: NextRequest,
  locale: string,
  record: VideoRecord,
  format: Format,
) {
  const video = recordToVideo(record, false, locale);
  // ?language=XX wins; otherwise default to the URL locale's transcript when
  // one exists, falling back to the most-recent transcript in any language.
  const requestedLanguage =
    request.nextUrl.searchParams.get("language") || undefined;
  const transcript =
    (await getTranscriptByKalturaId(
      record.kaltura_id,
      requestedLanguage ?? locale,
    )) ??
    (requestedLanguage
      ? null
      : await getTranscriptByKalturaId(record.kaltura_id));

  // No transcript at all.
  if (!transcript) {
    if (format === "text") {
      return textResponse(
        buildHeader(locale, video, record, null) +
          "No transcript available.\n",
      );
    }
    const metadata = await getVideoMetadata(record.asset_id);
    return jsonHeaders(
      NextResponse.json({
        disclaimer: TRANSCRIPT_DISCLAIMER,
        video: serializeVideo(video, record),
        metadata: serializeMetadata(metadata),
        transcript: null,
        message: "No transcript available",
      }),
    );
  }

  // In progress.
  if (transcript.transcription_status !== "completed") {
    if (format === "text") {
      return textResponse(
        buildHeader(locale, video, record, transcript.language_code) +
          `Transcript not yet available (status: ${transcript.transcription_status}).\n`,
      );
    }
    const metadata = await getVideoMetadata(record.asset_id);
    return jsonHeaders(
      NextResponse.json({
        disclaimer: TRANSCRIPT_DISCLAIMER,
        video: serializeVideo(video, record),
        metadata: serializeMetadata(metadata),
        transcript: {
          status: transcript.transcription_status,
          transcriptId: transcript.transcript_id,
        },
        message: "Transcript not completed",
      }),
    );
  }

  const speakerMappings =
    (await getSpeakerMapping(transcript.transcript_id)) || {};

  const countryNames = new Map<string, string>();
  const iso3Codes = new Set<string>();
  Object.values(speakerMappings).forEach((info: SpeakerInfo) => {
    if (info.affiliation && info.affiliation.length === 3) {
      iso3Codes.add(info.affiliation);
    }
  });
  for (const code of iso3Codes) {
    const name = getCountryName(code);
    if (name) countryNames.set(code, name);
  }

  const topics = transcript.content.topics || {};

  if (format === "text") {
    const segments = buildSpeakerSegments(
      transcript.content.statements,
      speakerMappings,
    );
    const body = formatTranscriptAsPlainText(
      segments,
      transcript.content.statements,
      (idx) => formatSpeakerText(idx, speakerMappings, countryNames),
      formatTimecode,
    );
    return textResponse(
      buildHeader(locale, video, record, transcript.language_code) + body,
    );
  }

  // Timestamps are already realignment-shifted by the display getter
  // (getTranscriptByKalturaId).
  const transcriptData = transcript.content.statements.map((stmt, index) => {
    const info = speakerMappings[index.toString()];
    return {
      statement_number: index + 1,
      paragraphs: stmt.paragraphs.map((para) => ({
        sentences: para.sentences.map((sent) => ({
          text: sent.text,
          start: sent.start / 1000,
          end: sent.end / 1000,
          topics:
            sent.topic_keys?.map((key) => ({
              key,
              label: topics[key]?.label || key,
              description: topics[key]?.description || "",
            })) || [],
          ...(sent.words && sent.words.length > 0
            ? {
                words: sent.words.map((w) => ({
                  text: w.text,
                  start: w.start / 1000,
                  end: w.end / 1000,
                })),
              }
            : {}),
        })),
      })),
      speaker: formatSpeakerInfo(info, countryNames),
    };
  });

  const metadata = await getVideoMetadata(record.asset_id);
  return jsonHeaders(
    NextResponse.json({
      disclaimer: TRANSCRIPT_DISCLAIMER,
      video: serializeVideo(video, record),
      metadata: serializeMetadata(metadata),
      transcript: {
        transcript_id: transcript.transcript_id,
        language: transcript.language_code,
        data: transcriptData,
        topics: Object.values(topics).map((t) => ({
          key: t.key,
          label: t.label,
          description: t.description,
        })),
      },
    }),
  );
}

function serializeVideo(
  video: ReturnType<typeof recordToVideo>,
  record: VideoRecord,
) {
  const url = videoUrl(record);
  return {
    id: record.asset_id,
    kaltura_id: record.kaltura_id,
    title: video.title,
    clean_title: video.cleanTitle,
    url: video.url,
    date: video.date,
    scheduled_time: video.scheduledTime,
    status: video.status,
    duration: video.duration,
    category: video.category,
    body: video.body,
    event_code: video.eventCode,
    event_type: video.eventType,
    session_number: video.sessionNumber,
    pv_symbol: record.pv_symbol,
    pv_part: record.pv_part,
    slug: url,
  };
}

function serializeMetadata(
  metadata: Awaited<ReturnType<typeof getVideoMetadata>>,
) {
  return {
    summary: metadata.summary,
    description: metadata.description,
    categories: metadata.categories,
    geographic_subject: metadata.geographicSubject,
    subject_topical: metadata.subjectTopical,
    corporate_name: metadata.corporateName,
    speaker_affiliation: metadata.speakerAffiliation,
    related_documents: metadata.relatedDocuments,
  };
}

function buildHeader(
  locale: string,
  video: ReturnType<typeof recordToVideo>,
  record: VideoRecord,
  language: string | null,
) {
  const title = video.cleanTitle || video.title;
  const date = video.date
    ? new Date(video.date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  return [
    `UN Transcripts — https://transcripts.un.org/${locale}/${videoUrl(record)}`,
    [title, video.body, date].filter(Boolean).join(" — "),
    language ? `Language: ${language}` : null,
    TRANSCRIPT_DISCLAIMER,
    "",
    "---",
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

// -- meeting list / search -------------------------------------------------

async function handleList(
  request: NextRequest,
  locale: string,
  format: Format,
) {
  const sp = request.nextUrl.searchParams;
  const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10) || 0);
  const page = Math.floor(offset / LIST_PAGE_SIZE) + 1;

  const qRaw = sp.get("q")?.trim();
  const q = qRaw && qRaw.length >= 2 ? qRaw : undefined;

  const sortRaw = sp.get("sort");
  const sortKey =
    sortRaw && SORT_VALUES.includes(sortRaw) ? sortRaw : "date_desc";
  const [by, dir] = sortKey.split("_") as ["date" | "title", "asc" | "desc"];

  const dateRaw = sp.get("date");
  const date =
    dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : undefined;
  const docs = sp
    .getAll("text")
    .filter((d) => ["transcript", "pv", "sr"].includes(d));

  const includeOther = sp.get("xlang") === "1";

  const [transcriptedEntries, transcriptedEntriesInLocale] = await Promise.all([
    getCachedTranscriptedEntries(),
    locale !== "en"
      ? getCachedTranscriptedEntriesByLanguage(locale)
      : Promise.resolve([] as string[]),
  ]);

  const params: VideosQueryParams = {
    q,
    daysBack: LIST_DAYS_BACK,
    date,
    category: sp.get("category") || undefined,
    docs: docs.length ? docs : undefined,
    sort: { by, dir },
    page,
    pageSize: LIST_PAGE_SIZE,
    transcriptedEntryIds: docs.includes("transcript")
      ? transcriptedEntries
      : undefined,
    localeFilter: { locale, includeOther },
  };

  const { records, total, totalIncludingOther } = await queryVideos(params);
  const transcriptedSet = new Set(transcriptedEntries);
  const transcriptedInLocaleSet = new Set(transcriptedEntriesInLocale);

  const items = records.map((record) => {
    const v = recordToVideo(
      record,
      record.entry_id ? transcriptedSet.has(record.entry_id) : false,
      locale,
      record.entry_id
        ? transcriptedInLocaleSet.has(record.entry_id) ||
            transcriptedSet.has(record.entry_id)
        : false,
    );
    const url = videoUrl(record);
    return {
      title: v.title,
      date: v.date,
      body: v.body,
      category: v.category,
      slug: url,
      duration: v.duration,
      hasTranscript: v.hasTranscript,
      pageUrl: `/${locale}/${url}`,
      jsonUrl: `/${locale}/${url}.json`,
      textUrl: v.hasTranscript ? `/${locale}/${url}.txt` : null,
    };
  });

  const hasMore = offset + items.length < total;

  if (format === "text") {
    const header = `# date        slug                  has_transcript  body — title
# [T] = transcript available at /${locale}/{slug}.txt and .json
\n`;
    const lines = items.map((m) => {
      const d = m.date ? new Date(m.date).toISOString().slice(0, 10) : "?";
      const t = m.hasTranscript ? "[T]" : "[ ]";
      return `${d}  ${m.slug.padEnd(20)}  ${t}  ${m.body ?? ""} — ${m.title}`;
    });
    const tail = hasMore
      ? `\n... ${total - (offset + items.length)} more. Append ?offset=${offset + items.length} for the next page.\n`
      : "";
    return textResponse(header + lines.join("\n") + tail + "\n");
  }

  return jsonHeaders(
    NextResponse.json({
      meetings: items,
      total,
      totalIncludingOther,
      hasMore,
      offset,
      pageSize: LIST_PAGE_SIZE,
    }),
  );
}
