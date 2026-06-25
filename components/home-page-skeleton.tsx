import { pageWidth } from "@/lib/layout";
import { cn } from "@/lib/utils";

/**
 * Page-shape skeleton for the homepage and any other locale-prefixed route
 * that doesn't have its own loading.tsx (about, login, verify, subscriptions).
 *
 * Homepage is the highest-traffic landing for this loader, so the silhouette
 * matches it: hero block on top, filter bar, then a few day-grouped table
 * rows. The other pages either render too fast to show this for long, or
 * have their own loading.tsx (speakers/meeting/asset).
 *
 * The site header lives in app/[locale]/layout.tsx, so it stays visible
 * across navigation transitions — no need to skeleton it.
 */
export function HomePageSkeleton() {
  return (
    <main id="main" tabIndex={-1} className="min-h-screen bg-background">
      <div className={cn("mx-auto px-4 sm:px-8", pageWidth)}>
        {/* Hero: heading + lead */}
        <div className="space-y-2 pt-8 pb-6">
          <div className="h-9 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-5 w-3/4 animate-pulse rounded bg-muted/70" />
          <div className="h-5 w-2/3 animate-pulse rounded bg-muted/70" />
        </div>

        {/* Filter bar: search + tabs/filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="h-9 w-64 animate-pulse rounded-md bg-muted/70" />
          <div className="h-9 w-24 animate-pulse rounded-md bg-muted/70" />
          <div className="h-9 w-28 animate-pulse rounded-md bg-muted/70" />
          <div className="h-9 w-24 animate-pulse rounded-md bg-muted/70" />
          <div className="ml-auto h-9 w-32 animate-pulse rounded-md bg-muted/70" />
        </div>

        {/* Two day groups, each with a heading + table rows */}
        <DayGroupSkeleton rowCount={5} />
        <DayGroupSkeleton rowCount={4} />
      </div>
    </main>
  );
}

function DayGroupSkeleton({ rowCount }: { rowCount: number }) {
  return (
    <div className="mt-6">
      {/* Day heading */}
      <div className="mb-2 h-5 w-40 animate-pulse rounded bg-muted/70" />
      {/* Table rows */}
      <div className="overflow-hidden rounded-md border border-border">
        {Array.from({ length: rowCount }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[60px_60px_1fr_140px] items-center gap-4 border-b border-border/50 px-4 py-3 last:border-0"
          >
            {/* time */}
            <div className="h-4 w-12 animate-pulse rounded bg-muted/60" />
            {/* status badges */}
            <div className="flex items-center justify-center gap-1">
              <div className="h-4 w-4 animate-pulse rounded bg-muted/60" />
              <div className="h-4 w-4 animate-pulse rounded bg-muted/60" />
            </div>
            {/* title */}
            <div className="space-y-1.5">
              <div className="h-3.5 w-11/12 animate-pulse rounded bg-muted" />
              <div className="h-3.5 w-7/12 animate-pulse rounded bg-muted/70" />
            </div>
            {/* category pill */}
            <div className="h-5 w-28 animate-pulse rounded-full bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
