import { NextRequest, NextResponse } from "next/server";
import { searchVideos, type SearchSort } from "@/lib/db";
import {
  getCachedTranscriptedEntries,
  getCachedTranscriptedEntriesByLanguage,
} from "@/lib/cached-db";
import { recordToVideo } from "@/lib/un-api";

const SORT_VALUES = ["date_desc", "date_asc", "title_asc", "title_desc"];

// Parses a sort param into a SearchSort, or undefined for relevance ordering.
function parseSort(raw: string | null): SearchSort | undefined {
  if (!raw || !SORT_VALUES.includes(raw)) return undefined;
  const [by, dir] = raw.split("_") as [SearchSort["by"], SearchSort["dir"]];
  return { by, dir };
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const offset = parseInt(
    request.nextUrl.searchParams.get("offset") || "0",
    10,
  );
  const sort = parseSort(request.nextUrl.searchParams.get("sort"));
  // The client passes its active UI locale so meeting titles come back in the
  // same language as the rest of the page. Unknown values silently fall back
  // to English at render time (recordToVideo treats no-match as English).
  const locale = request.nextUrl.searchParams.get("locale") ?? undefined;
  // ?xlang=1 turns off the per-locale visibility filter (the "Include
  // meetings in other languages" toggle on the home toolbar).
  const includeOther = request.nextUrl.searchParams.get("xlang") === "1";

  if (!q || q.length < 2) {
    return NextResponse.json({
      videos: [],
      hasMore: false,
      total: 0,
      totalIncludingOther: 0,
    });
  }

  const PAGE_SIZE = 50;
  const [searchResult, transcriptedEntries, transcriptedEntriesInLocale] =
    await Promise.all([
      searchVideos(q, {
        limit: PAGE_SIZE + 1, // fetch one extra to detect if more exist
        offset,
        sort,
        localeFilter: locale ? { locale, includeOther } : undefined,
      }),
      getCachedTranscriptedEntries(),
      locale
        ? getCachedTranscriptedEntriesByLanguage(locale)
        : Promise.resolve([] as string[]),
    ]);

  const { records, totalLocalized, totalAll } = searchResult;
  const hasMore = records.length > PAGE_SIZE;
  if (hasMore) records.pop(); // remove the extra sentinel

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

  const response = NextResponse.json({
    videos,
    hasMore,
    total: totalLocalized,
    totalIncludingOther: totalAll,
  });
  response.headers.set(
    "Cache-Control",
    "s-maxage=30, stale-while-revalidate=60",
  );
  return response;
}
