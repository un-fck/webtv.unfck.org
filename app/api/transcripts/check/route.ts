import { NextRequest, NextResponse, after } from "next/server";
import { getTranscript, getTranscriptByKalturaId } from "@/lib/db";
import {
  getKalturaAudioUrl,
  runSpeakerIdentification,
} from "@/lib/transcription";
import { getSpeakerMapping } from "@/lib/speakers";
import { bcp47ToKalturaName } from "@/lib/languages";
import { apiError } from "@/lib/api-error";

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

    // Fast path: look up by the stable player ID (no external API call).
    // Falls back to resolving via Kaltura only for legacy rows that
    // pre-date the `kaltura_id` column.
    let cached = await getTranscriptByKalturaId(kalturaId, language);
    if (!cached) {
      const kalturaLang = bcp47ToKalturaName(language);
      const { entryId } = await getKalturaAudioUrl(kalturaId, kalturaLang);
      cached = await getTranscript(
        entryId,
        undefined,
        undefined,
        true,
        language,
      );
    }

    if (!cached || cached.status !== "completed") {
      return NextResponse.json({ cached: false });
    }

    if (!cached.content.statements) {
      return apiError(
        400,
        "old_format",
        "Transcript uses old format, please retranscribe",
      );
    }

    // If statements array is empty, trigger speaker identification in-process
    // after the response is sent (no HTTP self-call to localhost).
    if (cached.content.statements.length === 0) {
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

    const speakerMappings = await getSpeakerMapping(cached.transcript_id);
    return NextResponse.json({
      statements: cached.content.statements,
      language: cached.language_code,
      cached: true,
      transcriptId: cached.transcript_id,
      topics: cached.content.topics || {},
      propositions: cached.content.propositions || [],
      speakerMappings: speakerMappings || {},
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
