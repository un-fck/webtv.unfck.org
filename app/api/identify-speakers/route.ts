import { NextRequest, NextResponse } from "next/server";
import { runSpeakerIdentification } from "@/lib/transcription";
import { apiError } from "@/lib/api-error";
import { requireUser } from "@/lib/auth/require-user";
import { enforceUserDailyLimit } from "@/lib/rate-limit";

// Runs the full GPT analysis pipeline inline, which can take minutes — keep the
// function alive long enough rather than letting Vercel cut it at the default.
export const maxDuration = 800;

// Re-running the analysis pipeline is rarer than initial transcription; a
// modest per-user daily cap is enough to bound the cost surface.
const REPROCESS_USER_DAILY_LIMIT =
  Number(process.env.REPROCESS_USER_DAILY_LIMIT) || 5;

const STATUS_BY_CODE = {
  not_found: 404,
  missing_data: 400,
  pipeline_locked: 409,
} as const;

export async function POST(request: NextRequest) {
  try {
    // Paid GPT work — require login and cap per-user.
    const auth = await requireUser();
    if (auth.response) return auth.response;
    const limited = await enforceUserDailyLimit(
      auth.user.id,
      "reprocess",
      REPROCESS_USER_DAILY_LIMIT,
    );
    if (limited) return limited;

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
