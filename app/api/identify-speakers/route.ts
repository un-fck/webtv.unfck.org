import { NextRequest, NextResponse } from "next/server";
import { identifySpeakers } from "@/lib/speaker-identification";
import {
  getTranscriptById,
  updateTranscriptStatus,
  tryAcquirePipelineLock,
  releasePipelineLock,
} from "@/lib/turso";

export async function POST(request: NextRequest) {
  try {
    const { transcriptId } = await request.json();

    if (!transcriptId) {
      return NextResponse.json(
        { error: "transcriptId required" },
        { status: 400 },
      );
    }

    const transcript = await getTranscriptById(transcriptId);
    if (!transcript) {
      return NextResponse.json(
        { error: "Transcript not found" },
        { status: 404 },
      );
    }

    const paragraphs = transcript.content.raw_paragraphs;
    if (!paragraphs || paragraphs.length === 0) {
      return NextResponse.json(
        { error: "No raw paragraphs available" },
        { status: 400 },
      );
    }


    const acquired = await tryAcquirePipelineLock(transcriptId);
    if (!acquired) {
      return NextResponse.json(
        { error: "Pipeline already running" },
        { status: 409 },
      );
    }

    try {
      await updateTranscriptStatus(transcriptId, "identifying_speakers");
      const mapping = await identifySpeakers(paragraphs, transcriptId);
      await updateTranscriptStatus(transcriptId, "completed");
      await releasePipelineLock(transcriptId);

      const updated = await getTranscriptById(transcriptId);
      return NextResponse.json({
        mapping,
        statements: updated?.content.statements || [],
        topics: updated?.content.topics || {},
      });
    } catch (error) {
      await updateTranscriptStatus(
        transcriptId,
        "error",
        error instanceof Error ? error.message : "Pipeline failed",
      );
      await releasePipelineLock(transcriptId);
      throw error;
    }
  } catch (error) {
    console.error("Speaker identification error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
