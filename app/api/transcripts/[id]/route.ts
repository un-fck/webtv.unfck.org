import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { pollTranscription } from "@/lib/transcription";
import { getSpeakerMapping } from "@/lib/speakers";
import { apiError } from "@/lib/api-error";

export async function GET(
  request: NextRequest,
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

    // The client polls this every few seconds while a transcript progresses.
    // The body carries the full `statements` array — large and mostly unchanged
    // between polls. Attach a weak validator (ETag over the body) with
    // `Cache-Control: no-cache` so the browser revalidates via If-None-Match and
    // unchanged polls get a bodiless 304 (no client changes — the browser
    // transparently reuses its cached copy). Saves the repeated re-download.
    const body = JSON.stringify({ ...result, speakerMappings });
    const etag = `"${createHash("sha1").update(body).digest("base64")}"`;
    const headers: Record<string, string> = {
      "Cache-Control": "no-cache",
      ETag: etag,
    };

    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers });
    }

    return new NextResponse(body, {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Poll error:", error);
    return apiError(
      500,
      "internal_error",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
