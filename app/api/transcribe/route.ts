import { NextRequest, NextResponse } from "next/server";
import {
  getTranscript,
  deleteTranscriptsForEntry,
  scheduleTranscript,
} from "@/lib/turso";
import { getKalturaAudioUrl, submitGeminiTranscription } from "@/lib/transcription";
import { getSpeakerMapping } from "@/lib/speakers";
import { bcp47ToKalturaName } from "@/lib/languages";

export async function POST(request: NextRequest) {
  try {
    const { kalturaId, checkOnly, force, startTime, endTime, action, assetId, withThinking, language } =
      await request.json();

    if (!kalturaId) {
      return NextResponse.json(
        { error: "Kaltura ID is required" },
        { status: 400 },
      );
    }

    const lang = language || "en";

    // Schedule action: queue transcript for later processing (video still live/upcoming)
    if (action === "schedule") {
      const transcriptId = await scheduleTranscript(
        assetId || kalturaId,
        kalturaId,
        startTime ?? null,
        endTime ?? null,
      );
      return NextResponse.json({ transcriptId, stage: "scheduled" });
    }

    const isSegmentRequest = startTime !== undefined && endTime !== undefined;

    // Get audio download URL from Kaltura
    const kalturaLang = bcp47ToKalturaName(lang);
    const { entryId } = await getKalturaAudioUrl(kalturaId, kalturaLang);

    // Check Turso for existing transcript (unless force=true)
    if (!force) {
      const cached = await getTranscript(
        entryId,
        isSegmentRequest ? startTime : undefined,
        isSegmentRequest ? endTime : undefined,
        true,
        lang,
      );

      console.log(
        "Turso check for entryId:",
        entryId,
        "cached:",
        cached
          ? `found (${cached.status}, ${cached.content.statements?.length || 0} statements)`
          : "not found",
      );

      if (cached && cached.status === "completed") {
        console.log("✓ Using cached transcript:", cached.transcript_id);

        if (!cached.content.statements) {
          return NextResponse.json(
            { error: "Transcript uses old format, please retranscribe" },
            { status: 400 },
          );
        }

        // If statements array is empty, trigger speaker identification and tell frontend to poll
        if (cached.content.statements.length === 0) {
          console.log(
            "Cached transcript has 0 statements, triggering speaker identification",
          );

          // Trigger speaker identification in background (fire and forget)
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

    if (checkOnly) {
      return NextResponse.json({ cached: false, text: null });
    }

    const { entryId: geminiEntryId, transcriptId: geminiTranscriptId } =
      await submitGeminiTranscription(kalturaId, {
        force,
        withThinking: withThinking === true,
        language: lang,
      });
    console.log(
      "✓ Gemini transcription started:",
      geminiTranscriptId,
      "for entryId:",
      geminiEntryId,
    );
    return NextResponse.json({
      transcriptId: geminiTranscriptId,
      stage: "transcribing",
      provider: "gemini",
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
