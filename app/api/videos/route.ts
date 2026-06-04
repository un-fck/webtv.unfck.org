import { NextRequest, NextResponse } from "next/server";
import { getVideosPage, type VideosPageParams } from "@/lib/db";
import {
  getCachedTranscriptedEntries,
  getCachedTranscriptedEntriesByLanguage,
} from "@/lib/cached-db";
import { recordToVideo } from "@/lib/un-api";

// Chunk size for infinite-scroll loading of the browse (non-search) feed.
// Must match the initial chunk rendered server-side in app/page.tsx.
const CHUNK = 50;
const DAYS_BACK = 365;

const SORT_VALUES = ["date_desc", "date_asc", "title_asc", "title_desc"];

function multi(sp: URLSearchParams, key: string): string[] | undefined {
  const vals = sp.getAll(key).filter(Boolean);
  return vals.length ? vals : undefined;
}

// Browse feed as JSON, offset-paged — used to append rows on infinite scroll.
// Mirrors the filter parsing and record enrichment in app/page.tsx.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10) || 0);
  const page = Math.floor(offset / CHUNK) + 1;

  const sortRaw = sp.get("sort");
  const [sortBy, sortDir] = (
    sortRaw && SORT_VALUES.includes(sortRaw) ? sortRaw : "date_desc"
  ).split("_") as ["date" | "title", "asc" | "desc"];

  const dateRaw = sp.get("date");
  const date =
    dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : undefined;
  const docs = multi(sp, "text")?.filter((d) =>
    ["transcript", "pv", "sr"].includes(d),
  );
  // Client-supplied active UI locale (see app/api/search/route.ts).
  const locale = sp.get("locale") ?? undefined;
  // ?xlang=1 turns off the per-locale visibility filter (the "Include
  // meetings in other languages" toggle on the home toolbar).
  const includeOther = sp.get("xlang") === "1";

  const [transcriptedEntries, transcriptedEntriesInLocale] = await Promise.all([
    getCachedTranscriptedEntries(),
    locale
      ? getCachedTranscriptedEntriesByLanguage(locale)
      : Promise.resolve([] as string[]),
  ]);

  const params: VideosPageParams = {
    daysBack: DAYS_BACK,
    date,
    bodies: multi(sp, "body"),
    categories: multi(sp, "category"),
    docs: docs?.length ? docs : undefined,
    sortBy,
    sortDir,
    page,
    pageSize: CHUNK,
    transcriptedEntryIds: docs?.includes("transcript")
      ? transcriptedEntries
      : undefined,
    localeFilter: locale ? { locale, includeOther } : undefined,
  };

  const { records, total, totalIncludingOther } = await getVideosPage(params);

  const transcriptedSet = new Set(transcriptedEntries);
  const transcriptedInLocaleSet = new Set(transcriptedEntriesInLocale);
  const videos = records.map((record) =>
    recordToVideo(
      record,
      record.entry_id ? transcriptedSet.has(record.entry_id) : false,
      locale,
      record.entry_id ? transcriptedInLocaleSet.has(record.entry_id) : false,
    ),
  );

  const hasMore = offset + videos.length < total;

  const response = NextResponse.json({
    videos,
    total,
    totalIncludingOther,
    hasMore,
  });
  response.headers.set(
    "Cache-Control",
    "s-maxage=30, stale-while-revalidate=60",
  );
  return response;
}
