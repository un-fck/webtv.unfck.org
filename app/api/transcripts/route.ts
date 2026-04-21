import { NextRequest, NextResponse } from "next/server";
import {
  getTranscript,
  deleteTranscriptsForEntry,
  scheduleTranscript,
} from "@/lib/turso";
import { getKalturaAudioUrl, submitTranscription } from "@/lib/transcription";
import { getSpeakerMapping } from "@/lib/speakers";
import { bcp47ToKalturaName } from "@/lib/languages";
import { apiError } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  try {
    const { kalturaId, force, assetId, language, schedule } =
      await request.json();

    if (!kalturaId) {
      return apiError(400, "missing_parameter", "kalturaId is required");
    }

    const lang = language || "en";

    // Schedule action: queue transcript for later processing (video still live/upcoming)
    if (schedule) {
      const transcriptId = await scheduleTranscript(
        assetId || kalturaId,
        kalturaId,
        null,
        null,
      );
      return NextResponse.json({ transcriptId, stage: "scheduled" });
    }

    // Get audio download URL from Kaltura
    const kalturaLang = bcp47ToKalturaName(lang);
    const { entryId } = await getKalturaAudioUrl(kalturaId, kalturaLang);

    // Check Turso for existing transcript (unless force=true)
    if (!force) {
      const cached = await getTranscript(entryId, undefined, undefined, true, lang);

      if (cached && cached.status === "completed") {
        if (!cached.content.statements) {
          return apiError(400, "old_format", "Transcript uses old format, please retranscribe");
        }

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
      }
    } else {
      await deleteTranscriptsForEntry(entryId, lang);
    }

    const { transcriptId } = await submitTranscription(kalturaId, {
      force,
      language: lang,
    });
    console.log("Transcription started:", transcriptId, "for entryId:", entryId);
    return NextResponse.json({
      transcriptId,
      stage: "transcribing",
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return apiError(500, "internal_error", error instanceof Error ? error.message : "Unknown error");
  }
}
