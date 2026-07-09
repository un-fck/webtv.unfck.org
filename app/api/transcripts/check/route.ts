// Checks for an existing transcript by Kaltura ID and language.
import { NextRequest } from "next/server";
import { getActiveTranscriptByKalturaId } from "@/lib/db";
import { buildTranscriptPayload } from "@/lib/transcript-payload";
import { apiError } from "@/lib/api-error";
import { compressedJson } from "@/lib/compressed-json";
import { getCurrentUser } from "@/lib/auth/service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const kalturaId = searchParams.get("kalturaId");
    const language = searchParams.get("language") || "en";

    if (!kalturaId) {
      return apiError(
        400,
        "missing_parameter",
        "kalturaId query parameter is required",
      );
    }

    // Latest non-error transcript (completed, in-progress, or scheduled) by the
    // stable player ID. Since migration 015 every transcript has a kaltura_id
    // matching videos.kaltura_id, so the legacy entry-id fallback is dead.
    const cached = await getActiveTranscriptByKalturaId(kalturaId, language);

    if (!cached || cached.transcription_status === "error") {
      return compressedJson(request, { cached: false });
    }

    // Viewable as soon as content exists — independent of any later stage
    // (e.g. on-demand analysis) so the transcript never disappears for others.
    // Timestamps are already realignment-shifted by the display getter above.
    const statements = cached.content.statements;
    if (statements && statements.length > 0) {
      // Propositions ("analysis") are private — only returned to signed-in
      // users (gated inside buildTranscriptPayload). Word-level timestamps are
      // stripped there too (63% of the raw payload — 3 MB of 4.4 MB on a
      // typical SC meeting); the panel fetches words separately via
      // /api/transcripts/[id]/words once the transcript is on screen.
      const user = await getCurrentUser();
      const payload = await buildTranscriptPayload(cached, {
        isLoggedIn: !!user,
      });
      return compressedJson(request, {
        ...payload,
        cached: true,
        stage: "completed",
      });
    }

    // Completed but no statements → legacy row. We deliberately do NOT auto-run
    // the analysis pipeline from this GET — that previously hid a paid pipeline
    // start behind a read-only endpoint that fires on every page load. Legacy
    // rows are recoverable via `pnpm retranscribe <entryId>`.
    if (cached.transcription_status === "completed") {
      return apiError(
        400,
        "old_format",
        "Transcript uses old format, please retranscribe",
      );
    }

    // In progress or scheduled — surface the stage so every viewer sees
    // progress (and doesn't start a duplicate); the client polls for content.
    return compressedJson(request, {
      cached: false,
      transcriptId: cached.transcript_id,
      stage: cached.transcription_status,
    });
  } catch (error) {
    console.error("Transcript check error:", error);
    return apiError(
      500,
      "internal_error",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
