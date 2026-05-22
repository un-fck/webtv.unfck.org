import { NextRequest, NextResponse } from "next/server";
import { AzureOpenAI } from "openai";
import { analyzePropositions } from "@/lib/pipeline";
import {
  getTranscriptById,
  updateTranscriptContent,
  updateAnalysisStatus,
  tryAcquirePipelineLock,
  releasePipelineLock,
} from "@/lib/db";
import { getSpeakerMapping } from "@/lib/speakers";
import { apiError } from "@/lib/api-error";
import { requireUser } from "@/lib/auth/require-user";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    // Analysis is a private feature — only signed-in users may run it.
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const { id: transcriptId } = await context.params;

    if (!transcriptId) {
      return apiError(400, "missing_parameter", "Transcript ID required");
    }

    const transcript = await getTranscriptById(transcriptId);
    if (!transcript) {
      return apiError(404, "not_found", "Transcript not found");
    }

    const paragraphs = transcript.content.raw_paragraphs;
    if (!paragraphs || paragraphs.length === 0) {
      return apiError(400, "missing_data", "No raw paragraphs available");
    }

    const speakerMapping = await getSpeakerMapping(transcriptId);
    if (!speakerMapping || Object.keys(speakerMapping).length === 0) {
      return apiError(
        400,
        "missing_speakers",
        "No speaker mapping available — run transcription first",
      );
    }

    const acquired = await tryAcquirePipelineLock(transcriptId);
    if (!acquired) {
      return apiError(409, "pipeline_locked", "Pipeline already running");
    }

    try {
      // Analysis runs on its own status axis — the transcript stays
      // 'completed' and visible to everyone while propositions compute.
      await updateAnalysisStatus(transcriptId, "analyzing");

      const client = new AzureOpenAI({
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion:
          process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview",
      });

      const propositions = await analyzePropositions(
        paragraphs,
        speakerMapping,
        client,
        transcriptId,
      );

      await updateTranscriptContent(transcriptId, {
        ...transcript.content,
        propositions,
      });

      await updateAnalysisStatus(transcriptId, "completed");
      await releasePipelineLock(transcriptId);

      return NextResponse.json({ propositions });
    } catch (error) {
      await updateAnalysisStatus(
        transcriptId,
        "error",
        error instanceof Error ? error.message : "Analysis failed",
      );
      await releasePipelineLock(transcriptId);
      throw error;
    }
  } catch (error) {
    console.error("Proposition analysis error:", error);
    return apiError(
      500,
      "internal_error",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
