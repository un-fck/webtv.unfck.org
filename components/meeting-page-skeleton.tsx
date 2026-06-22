import { widePageWidth } from "@/lib/layout";
import { cn } from "@/lib/utils";

/**
 * Page-shape skeleton for a meeting page. Shown by the route segment's
 * loading.tsx during a client-side navigation (before the server response
 * starts arriving). Mirrors the real page silhouette so the swap into the
 * streamed page doesn't shift the layout.
 *
 * Layout (measured on the real page, 1189 px main area):
 *   row 1: video player 661×372 (flex-3) | title + meta 440×… (flex-2)
 *   row 2: transcript     661×…    (flex-3) | topics sidebar 440×… (flex-2)
 *
 * Used from:
 *   - app/[locale]/[...meeting]/loading.tsx  (citation URLs)
 *   - app/[locale]/asset/[...assetPath]/loading.tsx  (permalink URLs)
 */
export function MeetingPageSkeleton() {
  return (
    <main id="main" tabIndex={-1} className="min-h-screen bg-background">
      <div className={cn("mx-auto px-4 pt-6 pb-16 sm:px-8", widePageWidth)}>
        {/* Back to homepage placeholder */}
        <div className="mb-4 h-4 w-32 animate-pulse rounded bg-muted/70" />

        {/* Row 1: player (3/5) + meta (2/5) */}
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="aspect-video w-full animate-pulse rounded bg-muted lg:flex-[3]" />
          <div className="space-y-3 lg:flex-[2]">
            <div className="h-7 w-11/12 animate-pulse rounded bg-muted" />
            <div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
            <div className="flex items-center gap-3 pt-2">
              <div className="h-4 w-16 animate-pulse rounded bg-muted/70" />
              <div className="h-4 w-12 animate-pulse rounded bg-muted/70" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted/70" />
              <div className="h-5 w-32 animate-pulse rounded-full bg-muted/70" />
            </div>
            <div className="h-4 w-28 animate-pulse rounded bg-muted/70" />
            <div className="space-y-2 pt-3">
              <div className="h-3 w-full animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-11/12 animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-9/12 animate-pulse rounded bg-muted/60" />
            </div>
          </div>
        </div>

        {/* Row 2: transcript (3/5) + topics sidebar (2/5) */}
        <div className="mt-8 flex flex-col gap-6 lg:flex-row">
          <div className="lg:flex-[3]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="h-7 w-32 animate-pulse rounded bg-muted" />
              <div className="flex gap-2">
                <div className="h-7 w-16 animate-pulse rounded bg-muted/70" />
                <div className="h-7 w-20 animate-pulse rounded bg-muted/70" />
              </div>
            </div>
            <div className="space-y-3 rounded-lg border border-border bg-card p-6">
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
              <div className="space-y-2">
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
                <div className="h-3 w-10/12 animate-pulse rounded bg-muted" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-9/12 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </div>
          <div className="hidden lg:block lg:flex-[2]">
            <div className="space-y-3">
              <div className="h-5 w-20 animate-pulse rounded bg-muted" />
              <div className="flex flex-wrap gap-2">
                <div className="h-7 w-40 animate-pulse rounded-full bg-muted/70" />
                <div className="h-7 w-32 animate-pulse rounded-full bg-muted/70" />
                <div className="h-7 w-44 animate-pulse rounded-full bg-muted/70" />
                <div className="h-7 w-36 animate-pulse rounded-full bg-muted/70" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
