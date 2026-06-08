import { Suspense } from "react";
import { recordToVideo } from "@/lib/un-api";
import { queryVideos, type VideosQueryParams } from "@/lib/db";
import {
  getCachedTranscriptedEntries,
  getCachedTranscriptedEntriesByLanguage,
  getCachedAvailableDates,
  getCachedFilterOptions,
} from "@/lib/cached-db";
import { VideoTable } from "@/components/transcript-table";
import { SiteHeader } from "@/components/site-header";
import { HomeHero } from "@/components/home-hero";
import { pageWidth } from "@/lib/layout";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DAYS_BACK = 365;

export interface ServerParams {
  page: number;
  pageSize: number;
  sort?: string; // undefined = default date desc (browse and search both)
  date?: string;
  body?: string[];
  category?: string[];
  text?: string[]; // "transcript" | "pv" | "sr"
  q?: string;
  // "Include meetings in other languages" toggle, default off. When off and
  // the active locale is non-English, the schedule hides meetings without a
  // harvested i18n entry for that locale.
  includeOtherLangs?: boolean;
  // Schedule view mode: undefined / "recent" (default) shows today + past in
  // descending order; "upcoming" shows strictly future days in ascending
  // order. Ignored in search mode.
  view?: "upcoming";
}

function parseSearchParams(
  raw: Record<string, string | string[] | undefined>,
): ServerParams {
  const page = Math.max(1, parseInt(String(raw.page ?? "1"), 10) || 1);
  const pageSize = [25, 50, 100, 200].includes(Number(raw.pageSize))
    ? Number(raw.pageSize)
    : 50;
  const sort = ["date_desc", "date_asc", "title_asc", "title_desc"].includes(
    String(raw.sort ?? ""),
  )
    ? String(raw.sort)
    : undefined; // auto: date desc (default for browse and search)
  const date =
    typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
      ? raw.date
      : undefined;
  const body = Array.isArray(raw.body)
    ? raw.body.filter(Boolean)
    : typeof raw.body === "string" && raw.body
      ? [raw.body]
      : undefined;
  const category = Array.isArray(raw.category)
    ? raw.category.filter(Boolean)
    : typeof raw.category === "string" && raw.category
      ? [raw.category]
      : undefined;
  const textRaw = Array.isArray(raw.text)
    ? raw.text
    : typeof raw.text === "string" && raw.text
      ? [raw.text]
      : [];
  const text = textRaw.filter((d) => ["transcript", "pv", "sr"].includes(d));
  const q =
    typeof raw.q === "string" && raw.q.trim().length >= 2
      ? raw.q.trim()
      : undefined;
  const includeOtherLangs = raw.xlang === "1";
  const view = raw.view === "upcoming" ? "upcoming" : undefined;

  return {
    page,
    pageSize,
    sort,
    date,
    body: body?.length ? body : undefined,
    category: category?.length ? category : undefined,
    text: text.length ? text : undefined,
    q,
    includeOtherLangs,
    view,
  };
}

export default async function Home({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, raw] = await Promise.all([routeParams, searchParams]);
  const params = parseSearchParams(raw);

  // Sort: explicit param wins. Otherwise default to relevance (undefined →
  // rank DESC inside queryVideos) when there's a free-text query, else
  // date_desc for plain browsing.
  const sort = (() => {
    if (params.sort) {
      const [by, dir] = params.sort.split("_") as [
        "date" | "title",
        "asc" | "desc",
      ];
      return { by, dir };
    }
    if (params.q) return undefined;
    return { by: "date" as const, dir: "desc" as const };
  })();

  // Fetch transcript IDs (needed for hasTranscript filter AND for enriching
  // video records). We fetch both the union ("any language") and the
  // active-locale subset so the two-tier T badge can render correctly.
  const [transcriptedEntries, transcriptedEntriesInLocale] = await Promise.all([
    getCachedTranscriptedEntries(),
    getCachedTranscriptedEntriesByLanguage(locale),
  ]);

  const pageParams: VideosQueryParams = {
    q: params.q,
    daysBack: DAYS_BACK,
    date: params.date,
    bodies: params.body,
    categories: params.category,
    docs: params.text,
    sort,
    // Initial chunk only; further rows load client-side via /api/videos
    // (infinite scroll). Keep in sync with CHUNK in app/api/videos/route.ts.
    page: 1,
    pageSize: 50,
    transcriptedEntryIds: params.text?.includes("transcript")
      ? transcriptedEntries
      : undefined,
    localeFilter: {
      locale,
      includeOther: params.includeOtherLangs === true,
    },
  };

  const [
    { records, total, totalIncludingOther },
    availableDates,
    filterOptions,
  ] = await Promise.all([
    queryVideos(pageParams),
    getCachedAvailableDates(DAYS_BACK),
    getCachedFilterOptions(DAYS_BACK),
  ]);

  const transcriptedSet = new Set(transcriptedEntries);
  const transcriptedInLocaleSet = new Set(transcriptedEntriesInLocale);
  const videos = records.map((r) =>
    recordToVideo(
      r,
      r.entry_id ? transcriptedSet.has(r.entry_id) : false,
      locale,
      r.entry_id ? transcriptedInLocaleSet.has(r.entry_id) : false,
    ),
  );

  return (
    <PageShell>
      <VideoTable
        videos={videos}
        totalCount={total}
        totalCountIncludingOther={totalIncludingOther}
        serverParams={params}
        availableDates={availableDates}
        filterOptions={filterOptions}
      />
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="min-h-screen bg-background">
      <SiteHeader />
      <div className={cn("mx-auto px-4 sm:px-8", pageWidth)}>
        <HomeHero />
        <div className="pb-24">
          <Suspense fallback={null}>{children}</Suspense>
        </div>
      </div>
    </main>
  );
}
