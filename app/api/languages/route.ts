// Lists available audio language tracks and transcript status for a video.
import { NextRequest, NextResponse } from "next/server";
import { getAvailableAudioLanguages } from "@/lib/transcription";
import { getTranscriptLanguagesByKalturaId } from "@/lib/db";
import {
  kalturaNameToBcp47,
  getLanguageDisplayName,
  UN_LANGUAGES,
} from "@/lib/languages";
import { apiError } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    const kalturaId = request.nextUrl.searchParams.get("kalturaId");
    if (!kalturaId) {
      return apiError(400, "missing_parameter", "kalturaId is required");
    }

    const { entryId, languages: kalturaLanguages } =
      await getAvailableAudioLanguages(kalturaId);

    // Map Kaltura flavor languages to BCP-47 codes
    const availableCodes = new Set(
      kalturaLanguages.map((l) => kalturaNameToBcp47(l.language)),
    );

    // Look up existing transcript statuses by kaltura_id (URL-stable) rather
    // than entry_id (resolved-at-write-time canonical). The entry-id path
    // dropped legitimate transcripts whenever the canonical post-redirect
    // entry drifted between write and read — see CLAUDE.md "Joining
    // transcripts ↔ videos".
    const transcriptInfos = await getTranscriptLanguagesByKalturaId(kalturaId);
    const statusByLang = new Map(
      transcriptInfos.map((t) => [t.language_code, t.transcription_status]),
    );

    // Return all UN languages, marking which have audio tracks available
    const languages = UN_LANGUAGES.map((lang) => ({
      code: lang.code,
      name: lang.name,
      available: availableCodes.has(lang.code),
      transcriptStatus: statusByLang.get(lang.code) ?? null,
    }));

    return NextResponse.json({ entryId, languages });
  } catch (error) {
    console.error("Languages API error:", error);
    return apiError(
      500,
      "internal_error",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
