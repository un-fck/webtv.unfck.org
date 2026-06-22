/**
 * Suspense fallback for <ServerTranscript>. Renders in the initial HTML
 * payload at ~TTFB; React swaps it for the resolved transcript when the
 * late chunk arrives. Mimics the panel's layout (toolbar row + disclaimer
 * pill + multiple paragraphs) so the swap to the real markup doesn't shift
 * the layout or read as a different UI state.
 */
export function TranscriptSkeleton() {
  return (
    <div aria-busy aria-live="polite">
      {/* Toolbar row: "Transcript" h2 + language pill + share/download */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-7 w-32 animate-pulse rounded bg-muted" />
          <div className="h-7 w-24 animate-pulse rounded bg-muted/70" />
        </div>
        <div className="flex gap-2">
          <div className="h-7 w-16 animate-pulse rounded bg-muted/70" />
          <div className="h-7 w-20 animate-pulse rounded bg-muted/70" />
        </div>
      </div>

      {/* Disclaimer pill */}
      <div className="mb-4 h-9 w-full animate-pulse rounded-md bg-muted/40" />

      {/* Speaker turns */}
      <SpeakerTurn />
      <SpeakerTurn />
      <SpeakerTurn />
    </div>
  );
}

function SpeakerTurn() {
  return (
    <div className="mt-5 space-y-2">
      {/* Speaker label + timestamp */}
      <div className="flex items-center gap-2">
        <div className="h-5 w-20 animate-pulse rounded bg-muted/70" />
        <div className="h-4 w-32 animate-pulse rounded bg-muted/60" />
        <div className="h-3 w-8 animate-pulse rounded bg-muted/50" />
      </div>
      {/* Paragraph lines */}
      <div className="space-y-1.5">
        <div className="h-3 w-full animate-pulse rounded bg-muted/60" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-muted/60" />
        <div className="h-3 w-10/12 animate-pulse rounded bg-muted/60" />
        <div className="h-3 w-9/12 animate-pulse rounded bg-muted/60" />
      </div>
    </div>
  );
}
