import { Suspense } from "react";
import { recordToVideo } from "@/lib/un-api";
import {
  getVideosPage,
  getAvailableDates,
  getFilterOptions,
  getAllTranscriptedEntries,
  type VideosPageParams,
} from "@/lib/turso";
import { VideoTable } from "@/components/video-table";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";

const DAYS_BACK = 365;

export interface ServerParams {
  page: number;
  pageSize: number;
  sort: string;
  status: "past" | "scheduled";
  date?: string;
  body?: string[];
  category?: string[];
  text?: string[]; // "transcript" | "pv" | "sr"
  q?: string;
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
    : "date_desc";
  const status =
    String(raw.status ?? "") === "scheduled" ? "scheduled" : "past";
  const date =
    typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
      ? raw.date
      : undefined;
  const body =
    typeof raw.body === "string" && raw.body
      ? raw.body.split(",").filter(Boolean)
      : undefined;
  const category =
    typeof raw.category === "string" && raw.category
      ? raw.category.split(",").filter(Boolean)
      : undefined;
  const text =
    typeof raw.text === "string" && raw.text
      ? raw.text.split(",").filter((d) => ["transcript", "pv", "sr"].includes(d))
      : undefined;
  const q =
    typeof raw.q === "string" && raw.q.trim().length >= 2
      ? raw.q.trim()
      : undefined;

  return { page, pageSize, sort, status, date, body, category, text: text?.length ? text : undefined, q };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = parseSearchParams(raw);

  // When search query is active, pass empty data — client handles via /api/search
  if (params.q) {
    const [availableDates, filterOptions] = await Promise.all([
      getAvailableDates(DAYS_BACK),
      getFilterOptions(DAYS_BACK),
    ]);

    return (
      <PageShell>
        <VideoTable
          videos={[]}
          totalCount={0}
          serverParams={params}
          availableDates={availableDates}
          filterOptions={filterOptions}
        />
      </PageShell>
    );
  }

  const [sortBy, sortDir] = params.sort.split("_") as [
    "date" | "title",
    "asc" | "desc",
  ];

  // Fetch transcript IDs (needed for hasTranscript filter AND for enriching video records)
  const transcriptedEntries = await getAllTranscriptedEntries();

  const pageParams: VideosPageParams = {
    daysBack: DAYS_BACK,
    date: params.date,
    bodies: params.body,
    categories: params.category,
    status: params.status,
    docs: params.text,
    sortBy,
    sortDir,
    page: params.page,
    pageSize: params.pageSize,
    transcriptedEntryIds: params.text?.includes("transcript") ? transcriptedEntries : undefined,
  };

  const [{ records, total }, availableDates, filterOptions] = await Promise.all(
    [
      getVideosPage(pageParams),
      getAvailableDates(DAYS_BACK),
      getFilterOptions(DAYS_BACK),
    ],
  );

  const transcriptedSet = new Set(transcriptedEntries);
  const videos = records.map((r) =>
    recordToVideo(
      r,
      r.entry_id ? transcriptedSet.has(r.entry_id) : false,
    ),
  );

  return (
    <PageShell>
      <VideoTable
        videos={videos}
        totalCount={total}
        serverParams={params}
        availableDates={availableDates}
        filterOptions={filterOptions}
      />
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        <div className="py-6 pb-24">
          <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
        </div>
      </div>
    </main>
  );
}
