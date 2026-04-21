import { NextRequest, NextResponse } from "next/server";
import { pollTranscription } from "@/lib/transcription";
import { getSpeakerMapping } from "@/lib/speakers";
import { apiError } from "@/lib/api-error";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: transcriptId } = await context.params;

    if (!transcriptId) {
      return apiError(400, "missing_parameter", "Transcript ID required");
    }

    const result = await pollTranscription(transcriptId);

    // If completed or has statements, include speaker mappings
    let speakerMappings = {};
    if (result.statements && result.statements.length > 0) {
      speakerMappings = (await getSpeakerMapping(transcriptId)) || {};
    }

    return NextResponse.json({
      ...result,
      speakerMappings,
    });
  } catch (error) {
    console.error("Poll error:", error);
    return apiError(500, "internal_error", error instanceof Error ? error.message : "Unknown error");
  }
}
