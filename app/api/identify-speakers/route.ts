import { NextRequest, NextResponse } from "next/server";
import { identifySpeakers } from "@/lib/speaker-identification";
import {
  getTranscriptById,
  updateTranscriptStatus,
  tryAcquirePipelineLock,
  releasePipelineLock,
} from "@/lib/turso";
import { apiError } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  try {
    const { transcriptId } = await request.json();

    if (!transcriptId) {
      return apiError(400, "missing_parameter", "transcriptId required");
    }

    const transcript = await getTranscriptById(transcriptId);
    if (!transcript) {
      return apiError(404, "not_found", "Transcript not found");
    }

    const paragraphs = transcript.content.raw_paragraphs;
    if (!paragraphs || paragraphs.length === 0) {
      return apiError(400, "missing_data", "No raw paragraphs available");
    }

    const acquired = await tryAcquirePipelineLock(transcriptId);
    if (!acquired) {
      return apiError(409, "pipeline_locked", "Pipeline already running");
    }

    try {
      await updateTranscriptStatus(transcriptId, "identifying_speakers");
      const mapping = await identifySpeakers(paragraphs, transcriptId, undefined, { skipPropositions: true });
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
    return apiError(500, "internal_error", error instanceof Error ? error.message : "Unknown error");
  }
}
