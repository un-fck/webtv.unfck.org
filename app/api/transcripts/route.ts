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
import { getCurrentUser } from "@/lib/auth/service";
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
  // Propositions ("analysis") are private — only return them to signed-in users.
  const user = await getCurrentUser();
  return NextResponse.json({
    statements: cached.content.statements,
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

export async function POST(request: NextRequest) {
  try {
    const { kalturaId, force, assetId, language, schedule } =
      await request.json();

    if (!kalturaId) {
      return apiError(400, "missing_parameter", "kalturaId is required");
    }

    const lang = language || "en";

    // Schedule action: queue transcript for later processing (video still live/upcoming).
    // Idempotent — returns the existing transcript if one is already queued/running/done.
    if (schedule) {
      const { transcriptId, stage } = await scheduleTranscript(
        assetId || kalturaId,
        kalturaId,
        null,
        null,
      );
      return NextResponse.json({ transcriptId, stage });
    }

    // Fast cache check by stable player ID — avoids hitting Kaltura when we
    // already have a completed transcript locally.
    if (!force) {
      const cached = await getTranscriptByKalturaId(kalturaId, lang);
      if (cached && cached.transcription_status === "completed") {
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

      if (cached && cached.transcription_status === "completed") {
        return await respondWithCached(cached);
      }
    } else {
      await deleteTranscriptsForEntry(entryId, lang);
    }

    // Idempotent: reuses an in-progress transcript if one already exists for
    // this video, so concurrent viewers don't kick off duplicate runs.
    const { transcriptId, stage, started } = await submitTranscription(
      kalturaId,
      {
        force,
        language: lang,
      },
    );
    console.log(
      started ? "Transcription started:" : "Reusing in-progress transcript:",
      transcriptId,
      "for entryId:",
      entryId,
    );
    return NextResponse.json({
      transcriptId,
      stage,
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
