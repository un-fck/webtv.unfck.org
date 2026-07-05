import { pageWidth } from "@/lib/layout";
import { cn } from "@/lib/utils";

/**
 * Loading skeleton for /speakers/[...path] — Twitter-style header
 * (round avatar + name + affiliation + stats) and a list of statement
 * bubbles below.
 */
export function SpeakerProfileSkeleton() {
  return (
    <main id="main" tabIndex={-1} className="min-h-screen bg-background">
      <div className={cn("mx-auto px-4 pt-8 pb-16 sm:px-8", pageWidth)}>
        <div className="mx-auto max-w-xl">
          {/* Profile header */}
          <header className="flex flex-col items-center pt-2 pb-8">
            <div className="h-24 w-24 animate-pulse rounded-full bg-muted" />
            <div className="mt-4 h-8 w-56 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted/70" />
            <div className="mt-3 h-3 w-44 animate-pulse rounded bg-muted/60" />
          </header>

          {/* Person chips (only for entity-level profiles, but harmless filler) */}
          <div className="mb-8 flex flex-wrap justify-center gap-2">
            <div className="h-7 w-28 animate-pulse rounded-full bg-muted/70" />
            <div className="h-7 w-32 animate-pulse rounded-full bg-muted/70" />
            <div className="h-7 w-24 animate-pulse rounded-full bg-muted/70" />
            <div className="h-7 w-36 animate-pulse rounded-full bg-muted/70" />
          </div>

          {/* Statement feed */}
          <div className="space-y-4">
            <StatementBubbleSkeleton lineCount={3} />
            <StatementBubbleSkeleton lineCount={5} />
            <StatementBubbleSkeleton lineCount={2} />
            <StatementBubbleSkeleton lineCount={4} />
          </div>
        </div>
      </div>
    </main>
  );
}

function StatementBubbleSkeleton({ lineCount }: { lineCount: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {/* Meta line: meeting title + date */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted/70" />
        <div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
      </div>
      {/* Body lines */}
      <div className="space-y-1.5">
        {Array.from({ length: lineCount }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-3 animate-pulse rounded bg-muted/60",
              i === lineCount - 1 ? "w-3/5" : "w-full",
            )}
          />
        ))}
      </div>
    </div>
  );
}
