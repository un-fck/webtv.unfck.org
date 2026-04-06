import { NextRequest, NextResponse } from "next/server";
import { getPVContent, savePVContent } from "@/lib/turso";
import { getKalturaAudioUrl } from "@/lib/transcription";
import { alignPVWithAudio } from "@/lib/pv-alignment";
import type { PVDocument } from "@/lib/pv-parser";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { pvSymbol, kalturaId, language = "en" } = body as {
    pvSymbol: string;
    kalturaId: string;
    language?: string;
  };

  if (!pvSymbol || !kalturaId) {
    return NextResponse.json(
      { error: "Missing required parameters: pvSymbol, kalturaId" },
      { status: 400 },
    );
  }

  // Check if already aligned
  const cached = await getPVContent(pvSymbol, language);
  if (cached) {
    const doc = JSON.parse(cached.content) as PVDocument & {
      aligned?: boolean;
    };
    if (doc.aligned) {
      return NextResponse.json(doc);
    }
  }

  // Need the parsed PV document
  if (!cached) {
    return NextResponse.json(
      { error: "PV document not parsed yet. Fetch /api/pv first." },
      { status: 400 },
    );
  }

  const pvDoc = JSON.parse(cached.content) as PVDocument;

  // Get audio URL
  const { audioUrl } = await getKalturaAudioUrl(kalturaId);

  // Run alignment
  const aligned = await alignPVWithAudio(pvDoc, audioUrl);

  // Save aligned version
  await savePVContent(pvSymbol, language, JSON.stringify(aligned));

  return NextResponse.json(aligned);
}
