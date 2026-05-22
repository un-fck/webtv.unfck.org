import { NextRequest, NextResponse } from "next/server";
import { runSpeakerIdentification } from "@/lib/transcription";
import { apiError } from "@/lib/api-error";

const STATUS_BY_CODE = {
  not_found: 404,
  missing_data: 400,
  pipeline_locked: 409,
} as const;

export async function POST(request: NextRequest) {
  try {
    const { transcriptId } = await request.json();

    if (!transcriptId) {
      return apiError(400, "missing_parameter", "transcriptId required");
    }

    const result = await runSpeakerIdentification(transcriptId);
    if (!result.ok) {
      return apiError(STATUS_BY_CODE[result.code], result.code, result.message);
    }

    return NextResponse.json({
      mapping: result.mapping,
      statements: result.statements,
      topics: result.topics,
    });
  } catch (error) {
    console.error("Speaker identification error:", error);
    return apiError(
      500,
      "internal_error",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
