import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";

const ts = () => new Date().toTimeString().slice(0, 8);
import { getScheduledTranscripts } from "@/lib/db";
import { getKalturaAudioUrl, submitTranscription } from "@/lib/transcription";
import { apiError } from "@/lib/api-error";

// Each picked-up transcript starts a pipeline in `after()`; keep the function
// alive long enough for those runs. 800s is the Vercel Pro + Fluid Compute
// ceiling; lower to 300 if the deploy rejects it.
export const maxDuration = 800;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError(401, "unauthorized", "Unauthorized");
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
      const { transcriptId } = await submitTranscription(kalturaId, {
        existingTranscriptId: item.transcript_id,
        language: item.language_code || "en",
        schedule: after,
      });

      console.log(
        `[${ts()}] ✓ Started scheduled transcript for ${kalturaId} → ${transcriptId}`,
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
