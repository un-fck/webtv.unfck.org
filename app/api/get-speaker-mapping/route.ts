import { NextRequest, NextResponse } from "next/server";
import { getSpeakerMapping } from "@/lib/speakers";

export async function POST(request: NextRequest) {
  try {
    const { transcriptId } = await request.json();

    if (!transcriptId) {
      return NextResponse.json(
        { error: "Transcript ID required" },
        { status: 400 },
      );
    }

    const mapping = await getSpeakerMapping(transcriptId);

    return NextResponse.json({ mapping });
  } catch (error) {
    console.error("Get speaker mapping error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
