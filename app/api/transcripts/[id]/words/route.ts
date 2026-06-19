import { NextRequest } from "next/server";
import { getTranscriptByIdForDisplay } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { compressedJson } from "@/lib/compressed-json";
import { wordsOnlyFromStatements } from "@/lib/strip-words";

/**
 * Word-level timestamps for an existing completed transcript. Companion to
 * /api/transcripts/check, which omits words[] for fast first paint. The
 * transcription panel fetches this once the transcript is on screen and
 * merges the words back into its statements state to enable in-sentence
 * karaoke highlight + click-to-seek.
 *
 * Returns the same statement/paragraph/sentence nesting as the panel
 * already holds, so the merge is a per-index walk on the client.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: transcriptId } = await context.params;
    if (!transcriptId) {
      return apiError(400, "missing_parameter", "Transcript ID required");
    }

    const transcript = await getTranscriptByIdForDisplay(transcriptId);
    if (!transcript) {
      return apiError(404, "not_found", "Transcript not found");
    }

    const statements = transcript.content.statements;
    if (!statements || statements.length === 0) {
      return compressedJson(request, { statements: [] });
    }

    return compressedJson(request, {
      statements: wordsOnlyFromStatements(statements),
    });
  } catch (error) {
    console.error("Words endpoint error:", error);
    return apiError(
      500,
      "internal_error",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
