import { TranscriptSkeleton } from "@/components/transcript-skeleton";
import { widePageWidth } from "@/lib/layout";
import { cn } from "@/lib/utils";

/**
 * Loading UI shown during a navigation transition to a meeting page, before
 * the server has finished assembling the response. Replaces the previous
 * "Loading meeting…" spinner — the meeting page itself streams the chrome
 * at ~TTFB and the transcript section in a Suspense boundary, but during
 * the initial navigation tick before any bytes have arrived this is what
 * the user sees. Mirror the page's shape (wide layout, title bar, player
 * box, transcript on the left) so the transition into the real page lands
 * on the same skeleton silhouette and there's no layout shift.
 */
export default function Loading() {
  return (
    <main id="main" tabIndex={-1} className="min-h-screen bg-background">
      <div
        className={cn(
          "mx-auto px-4 pt-6 pb-16 sm:px-8",
          widePageWidth,
        )}
      >
        {/* Title bar */}
        <div className="space-y-3">
          <div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted/70" />
        </div>

        {/* Two-column: transcript left, player+sidebar right */}
        <div className="mt-6 flex flex-col gap-6 lg:flex-row">
          {/* LEFT — transcript area */}
          <div className="min-w-0 lg:flex-[3]">
            <TranscriptSkeleton />
          </div>

          {/* RIGHT — sticky sidebar with player aspect-ratio block */}
          <div className="hidden lg:block lg:flex-[2]">
            <div className="space-y-4">
              <div className="aspect-video w-full animate-pulse rounded bg-muted" />
              <div className="space-y-2">
                <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
                <div className="h-3 w-4/6 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
