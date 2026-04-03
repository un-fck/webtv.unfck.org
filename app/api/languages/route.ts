import { NextRequest, NextResponse } from "next/server";
import { getAvailableAudioLanguages } from "@/lib/transcription";
import { getTranscriptLanguagesForEntry } from "@/lib/turso";
import { kalturaNameToBcp47, getLanguageDisplayName, UN_LANGUAGES } from "@/lib/languages";

export async function GET(request: NextRequest) {
  try {
    const kalturaId = request.nextUrl.searchParams.get("kalturaId");
    if (!kalturaId) {
      return NextResponse.json(
        { error: "kalturaId is required" },
        { status: 400 },
      );
    }

    const { entryId, languages: kalturaLanguages } =
      await getAvailableAudioLanguages(kalturaId);

    // Map Kaltura flavor languages to BCP-47 codes
    const availableCodes = new Set(
      kalturaLanguages.map((l) => kalturaNameToBcp47(l.language)),
    );

    // Get existing transcript statuses for this entry
    const transcriptInfos = await getTranscriptLanguagesForEntry(entryId);
    const statusByLang = new Map(
      transcriptInfos.map((t) => [t.language_code, t.status]),
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
