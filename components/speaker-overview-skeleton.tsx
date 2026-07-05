import { pageWidth } from "@/lib/layout";
import { cn } from "@/lib/utils";

/**
 * Loading skeleton for /speakers — search input + three-column grid of
 * sections (Countries / Groups / UN organs), each a list of entity rows
 * with chevron + label + count.
 */
export function SpeakerOverviewSkeleton() {
  return (
    <main id="main" tabIndex={-1} className="min-h-screen bg-background">
      <div className={cn("mx-auto px-4 pt-8 pb-16 sm:px-8", pageWidth)}>
        {/* Page heading */}
        <div className="mb-3 h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="mb-8 h-4 w-2/3 animate-pulse rounded bg-muted/70" />

        {/* Search input */}
        <div className="mb-8 h-10 w-full max-w-md animate-pulse rounded-md bg-muted/70" />

        {/* Three-column grid of sections */}
        <div className="grid gap-10 lg:grid-cols-3">
          <SectionSkeleton rowCount={8} />
          <SectionSkeleton rowCount={6} />
          <SectionSkeleton rowCount={5} />
        </div>
      </div>
    </main>
  );
}

function SectionSkeleton({ rowCount }: { rowCount: number }) {
  return (
    <section>
      {/* Section header */}
      <div className="mb-3 h-6 w-32 animate-pulse rounded bg-muted" />
      <ul className="space-y-0">
        {Array.from({ length: rowCount }).map((_, i) => (
          <li
            key={i}
            className="flex items-center gap-2 border-b border-border/60 py-2"
          >
            <div className="h-4 w-4 animate-pulse rounded bg-muted/60" />
            <div className="h-4 flex-1 animate-pulse rounded bg-muted/70" />
            <div className="h-3 w-8 animate-pulse rounded bg-muted/50" />
          </li>
        ))}
      </ul>
    </section>
  );
}
