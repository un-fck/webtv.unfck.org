/**
 * Suspense fallback for <ServerTranscript>. Renders in the initial HTML
 * payload at ~TTFB; React swaps it for the resolved transcript when the
 * late chunk arrives. Mimics the panel's "checking" stub shape so the
 * layout doesn't shift when the real markup lands.
 */
export function TranscriptSkeleton() {
  return (
    <div
      aria-busy
      aria-live="polite"
      className="space-y-3 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground"
    >
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
  );
}
