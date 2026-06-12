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
import { parseScheduleParams } from "@/lib/schedule-params";

export const dynamic = "force-dynamic";

const DAYS_BACK = 365;

// Parsing and the ServerParams shape live in lib/schedule-params.ts — the
// client table runs the same parser over window.location to detect dropped
// navigations, so the two sides must never diverge.
export type { ServerParams } from "@/lib/schedule-params";

export default async function Home({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, raw] = await Promise.all([routeParams, searchParams]);
  const params = parseScheduleParams(raw);

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
