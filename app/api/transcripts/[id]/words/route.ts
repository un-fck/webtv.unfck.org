// Returns word-level timestamps for a completed transcript.
import { NextRequest } from "next/server";
import { getTranscriptByIdForDisplay } from "@/lib/db";
import { getSpeakerMapping } from "@/lib/speakers";
import { apiError } from "@/lib/api-error";
import { compressedJson } from "@/lib/compressed-json";
import { wordsOnlyFromStatements } from "@/lib/strip-words";
import { filterOffRecord } from "@/lib/off-record";

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

    // Hide off-record statements with the same filter as every other serving
    // surface — the panel merges this payload back per-index, so the indices
    // MUST match the filtered statements it received from check/poll.
    const fullMapping = (await getSpeakerMapping(transcriptId)) || {};
    const { statements } = filterOffRecord(
      transcript.content.statements,
      fullMapping,
    );
    if (statements.length === 0) {
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
