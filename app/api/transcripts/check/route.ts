import { NextRequest, NextResponse } from "next/server";
import { getActiveTranscriptByKalturaId } from "@/lib/db";
import { getSpeakerMapping } from "@/lib/speakers";
import { apiError } from "@/lib/api-error";
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
      return NextResponse.json({ cached: false });
    }

    // Viewable as soon as content exists — independent of any later stage
    // (e.g. on-demand analysis) so the transcript never disappears for others.
    // Timestamps are already realignment-shifted by the display getter above.
    const statements = cached.content.statements;
    if (statements && statements.length > 0) {
      const speakerMappings = await getSpeakerMapping(cached.transcript_id);
      // Propositions ("analysis") are private — only return them to signed-in users.
      const user = await getCurrentUser();
      return NextResponse.json({
        statements,
        language: cached.language_code,
        cached: true,
        transcriptId: cached.transcript_id,
        stage: "completed",
        analysis_status: cached.analysis_status,
        topics: cached.content.topics || {},
        propositions: user ? cached.content.propositions || [] : [],
        speakerMappings: speakerMappings || {},
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
    return NextResponse.json({
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
