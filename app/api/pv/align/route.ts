// Aligns a parsed PV document with audio to produce per-turn timestamps.
import { NextRequest, NextResponse } from "next/server";
import { getPVContent, savePVContent } from "@/lib/db";
import { getKalturaAudioUrl } from "@/lib/transcription";
import { alignPVWithAudio } from "@/lib/pv-alignment";
import type { PVDocument } from "@/lib/pv-parser";
import { apiError } from "@/lib/api-error";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    pvSymbol,
    kalturaId,
    language = "en",
  } = body as {
    pvSymbol: string;
    kalturaId: string;
    language?: string;
  };

  if (!pvSymbol || !kalturaId) {
    return apiError(
      400,
      "missing_parameter",
      "Missing required parameters: pvSymbol, kalturaId",
    );
  }

  // Check if already aligned
  const cached = await getPVContent(pvSymbol, language);
  if (cached) {
    const doc = cached.content as PVDocument & { aligned?: boolean };
    if (doc.aligned) {
      return NextResponse.json(doc);
    }
  }

  // Need the parsed PV document
  if (!cached) {
    return apiError(
      400,
      "missing_data",
      "PV document not parsed yet. Fetch /api/pv first.",
    );
  }

  const pvDoc = cached.content as PVDocument;

  // Get audio URL
  const { audioUrl } = await getKalturaAudioUrl(kalturaId);

  // Run alignment
  const aligned = await alignPVWithAudio(pvDoc, audioUrl);

  // Save aligned version
  await savePVContent(pvSymbol, language, aligned as object);

  return NextResponse.json(aligned);
}
