import { NextRequest, NextResponse } from "next/server";
import { AzureOpenAI } from "openai";
import { analyzePropositions } from "@/lib/speaker-identification";
import {
  getTranscriptById,
  updateTranscriptContent,
  updateTranscriptStatus,
  tryAcquirePipelineLock,
  releasePipelineLock,
} from "@/lib/turso";
import { getSpeakerMapping } from "@/lib/speakers";

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

    const speakerMapping = await getSpeakerMapping(transcriptId);
    if (!speakerMapping || Object.keys(speakerMapping).length === 0) {
      return NextResponse.json(
        { error: "No speaker mapping available — run transcription first" },
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
      await updateTranscriptStatus(transcriptId, "analyzing_propositions");

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

      // Update transcript content with propositions
      await updateTranscriptContent(transcriptId, {
        ...transcript.content,
        propositions,
      });

      await updateTranscriptStatus(transcriptId, "completed");
      await releasePipelineLock(transcriptId);

      return NextResponse.json({ propositions });
    } catch (error) {
      await updateTranscriptStatus(
        transcriptId,
        "error",
        error instanceof Error ? error.message : "Analysis failed",
      );
      await releasePipelineLock(transcriptId);
      throw error;
    }
  } catch (error) {
    console.error("Proposition analysis error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
