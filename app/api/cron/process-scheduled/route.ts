import { NextRequest, NextResponse } from "next/server";
import {
  getScheduledTranscripts,
} from "@/lib/turso";
import { getKalturaAudioUrl, submitGeminiTranscription } from "@/lib/transcription";

export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scheduled = await getScheduledTranscripts();

  if (scheduled.length === 0) {
    return NextResponse.json({
      processed: 0,
      message: "No scheduled transcripts",
    });
  }

  let started = 0;
  let pending = 0;
  const errors: string[] = [];

  for (const item of scheduled) {
    try {
      // entry_id holds the kalturaId passed at schedule time
      const kalturaId = item.entry_id;

      // Try to fetch audio — will throw if the recording isn't available yet
      const { isLiveStream } = await getKalturaAudioUrl(kalturaId);

      // Live streams aren't yet supported for scheduled transcription
      if (isLiveStream) {
        pending++;
        continue;
      }

      // Audio is available — reuse the existing scheduled row
      const { transcriptId } = await submitGeminiTranscription(kalturaId, {
        existingTranscriptId: item.transcript_id,
      });

      console.log(
        `✓ Started scheduled transcript for ${kalturaId} → ${transcriptId}`,
      );
      started++;
    } catch (err) {
      // Audio not available yet — leave as scheduled, try again next run
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("404") ||
        msg.includes("not found") ||
        msg.includes("no flavors")
      ) {
        pending++;
      } else {
        console.error(
          `Error processing scheduled transcript ${item.transcript_id}:`,
          err,
        );
        errors.push(`${item.transcript_id}: ${msg}`);
      }
    }
  }

  return NextResponse.json({
    processed: scheduled.length,
    started,
    pending,
    errors,
  });
}
