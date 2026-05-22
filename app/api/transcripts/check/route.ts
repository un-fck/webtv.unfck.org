import { NextRequest, NextResponse, after } from "next/server";
import { getTranscript, getActiveTranscriptByKalturaId } from "@/lib/db";
import {
  getKalturaAudioUrl,
  runSpeakerIdentification,
} from "@/lib/transcription";
import { getSpeakerMapping } from "@/lib/speakers";
import { bcp47ToKalturaName } from "@/lib/languages";
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

    // Latest non-error transcript (completed, in-progress, or scheduled) — by
    // the stable player ID, with a legacy fallback via the resolved entry.
    let cached = await getActiveTranscriptByKalturaId(kalturaId, language);
    if (!cached) {
      const kalturaLang = bcp47ToKalturaName(language);
      const { entryId } = await getKalturaAudioUrl(kalturaId, kalturaLang);
      cached = await getTranscript(entryId, undefined, undefined, false, language);
    }

    if (!cached || cached.transcription_status === "error") {
      return NextResponse.json({ cached: false });
    }

    // Viewable as soon as content exists — independent of any later stage
    // (e.g. on-demand analysis) so the transcript never disappears for others.
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

    // Completed but no statements → legacy row; kick off speaker identification.
    if (cached.transcription_status === "completed") {
      if (!cached.content.statements) {
        return apiError(
          400,
          "old_format",
          "Transcript uses old format, please retranscribe",
        );
      }
      const transcriptId = cached.transcript_id;
      after(async () => {
        try {
          await runSpeakerIdentification(transcriptId);
        } catch (err) {
          console.error("Error running speaker identification:", err);
        }
      });
      return NextResponse.json({
        transcriptId: cached.transcript_id,
        stage: "identifying_speakers",
      });
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
