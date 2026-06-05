import { NextRequest, NextResponse } from "next/server";
import { queryVideos, type VideosQueryParams } from "@/lib/db";
import {
  getCachedTranscriptedEntries,
  getCachedTranscriptedEntriesByLanguage,
} from "@/lib/cached-db";
import { recordToVideo } from "@/lib/un-api";

// Chunk size for infinite-scroll loading of the feed. Must match the initial
// chunk rendered server-side in app/page.tsx.
const CHUNK = 50;
const DAYS_BACK = 365;

const SORT_VALUES = ["date_desc", "date_asc", "title_asc", "title_desc"];

function multi(sp: URLSearchParams, key: string): string[] | undefined {
  const vals = sp.getAll(key).filter(Boolean);
  return vals.length ? vals : undefined;
}

// Unified feed endpoint — handles both browse (no `q`) and search (`q` set)
// with the same filter/sort surface. The DB layer (queryVideos) decides
// whether the text query goes through FTS or the trigram ILIKE fallback.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10) || 0);
  const page = Math.floor(offset / CHUNK) + 1;

  // Free-text query. Treated as another filter — when omitted, the request is
  // pure browse; when set, ranking + the FTS/ILIKE predicate kick in.
  const qRaw = sp.get("q")?.trim();
  const q = qRaw && qRaw.length >= 2 ? qRaw : undefined;

  // Sort: when `q` is set we default to relevance (undefined → rank DESC in
  // queryVideos). When no `q`, default to date_desc so the browse feed has a
  // deterministic order. An explicit sort param always wins.
  const sortRaw = sp.get("sort");
  const sortKey =
    sortRaw && SORT_VALUES.includes(sortRaw)
      ? sortRaw
      : q
        ? null
        : "date_desc";
  const sort = sortKey
    ? (() => {
        const [by, dir] = sortKey.split("_") as [
          "date" | "title",
          "asc" | "desc",
        ];
        return { by, dir };
      })()
    : undefined;

  const dateRaw = sp.get("date");
  const date =
    dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : undefined;
  const docs = multi(sp, "text")?.filter((d) =>
    ["transcript", "pv", "sr"].includes(d),
  );
  // Client-supplied active UI locale (drives both per-locale visibility and
  // the localized fields returned by recordToVideo).
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

  const params: VideosQueryParams = {
    q,
    daysBack: DAYS_BACK,
    date,
    bodies: multi(sp, "body"),
    categories: multi(sp, "category"),
    docs: docs?.length ? docs : undefined,
    sort,
    page,
    pageSize: CHUNK,
    transcriptedEntryIds: docs?.includes("transcript")
      ? transcriptedEntries
      : undefined,
    localeFilter: locale ? { locale, includeOther } : undefined,
  };

  const { records, total, totalIncludingOther } = await queryVideos(params);

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
  // Search responses (with `q`) need a shorter TTL than the steady-state
  // browse feed: the FTS index updates as new meetings come in and we don't
  // want a stale cache hiding fresh hits.
  response.headers.set(
    "Cache-Control",
    q
      ? "s-maxage=30, stale-while-revalidate=60"
      : "s-maxage=60, stale-while-revalidate=300",
  );
  return response;
}
