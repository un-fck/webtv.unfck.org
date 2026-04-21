import { NextRequest, NextResponse } from "next/server";
import { getTranscript } from "@/lib/turso";
import { getKalturaAudioUrl } from "@/lib/transcription";
import { getSpeakerMapping } from "@/lib/speakers";
import { bcp47ToKalturaName } from "@/lib/languages";
import { apiError } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const kalturaId = searchParams.get("kalturaId");
    const language = searchParams.get("language") || "en";

    if (!kalturaId) {
      return apiError(400, "missing_parameter", "kalturaId query parameter is required");
    }

    const kalturaLang = bcp47ToKalturaName(language);
    const { entryId } = await getKalturaAudioUrl(kalturaId, kalturaLang);

    const cached = await getTranscript(entryId, undefined, undefined, true, language);

    if (!cached || cached.status !== "completed") {
      return NextResponse.json({ cached: false });
    }

    if (!cached.content.statements) {
      return apiError(400, "old_format", "Transcript uses old format, please retranscribe");
    }

    // If statements array is empty, trigger speaker identification
    if (cached.content.statements.length === 0) {
      fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/identify-speakers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcriptId: cached.transcript_id }),
        },
      ).catch((err) => {
        console.error("Error triggering speaker identification:", err);
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
    return apiError(500, "internal_error", error instanceof Error ? error.message : "Unknown error");
  }
}
