import { NextRequest, NextResponse } from "next/server";
import {
  getTranscript,
  getTranscriptByKalturaId,
  deleteTranscriptsForEntry,
  scheduleTranscript,
} from "@/lib/db";
import {
  getKalturaAudioUrl,
  submitTranscription,
  runSpeakerIdentification,
} from "@/lib/transcription";
import { after } from "next/server";
import { getSpeakerMapping } from "@/lib/speakers";
import { bcp47ToKalturaName } from "@/lib/languages";
import { apiError } from "@/lib/api-error";
import type { Transcript } from "@/lib/db";

async function respondWithCached(cached: Transcript) {
  if (!cached.content.statements) {
    return apiError(
      400,
      "old_format",
      "Transcript uses old format, please retranscribe",
    );
  }

  if (cached.content.statements.length === 0) {
    // Run speaker identification in-process after the response is sent — no
    // HTTP self-call, so it can't silently misfire to localhost in production.
    after(async () => {
      try {
        await runSpeakerIdentification(cached.transcript_id);
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
}

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

    // Fast cache check by stable player ID — avoids hitting Kaltura when we
    // already have a completed transcript locally.
    if (!force) {
      const cached = await getTranscriptByKalturaId(kalturaId, lang);
      if (cached && cached.status === "completed") {
        return await respondWithCached(cached);
      }
    }

    // Either forced or no fast-path hit — resolve via Kaltura for the legacy
    // lookup and (if needed) to start a new transcription.
    const kalturaLang = bcp47ToKalturaName(lang);
    const { entryId } = await getKalturaAudioUrl(kalturaId, kalturaLang);

    // Check DB for existing transcript by resolved entry_id (unless force=true)
    if (!force) {
      const cached = await getTranscript(
        entryId,
        undefined,
        undefined,
        true,
        lang,
      );

      if (cached && cached.status === "completed") {
        return await respondWithCached(cached);
      }
    } else {
      await deleteTranscriptsForEntry(entryId, lang);
    }

    const { transcriptId } = await submitTranscription(kalturaId, {
      force,
      language: lang,
    });
    console.log(
      "Transcription started:",
      transcriptId,
      "for entryId:",
      entryId,
    );
    return NextResponse.json({
      transcriptId,
      stage: "transcribing",
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return apiError(
      500,
      "internal_error",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
