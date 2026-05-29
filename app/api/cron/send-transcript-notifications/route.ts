import { NextRequest, NextResponse } from "next/server";
import {
  getRecentlyCompletedTranscripts,
  getVideoByKalturaId,
  getVideoSubscribers,
  getFeedSubscribers,
  getAllFeeds,
  getNotifiedUserIds,
  markTranscriptNotified,
  type Recipient,
} from "@/lib/db";
import { matchFeeds } from "@/lib/feeds";
import { sendTranscriptReady } from "@/lib/notifications/mail";
import { apiError } from "@/lib/api-error";

const ts = () => new Date().toTimeString().slice(0, 8);

// How far back to look for completed transcripts. Comfortably larger than the
// cron interval so a transient failure gets retried on subsequent runs.
const LOOKBACK_HOURS = 24;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError(401, "unauthorized", "Unauthorized");
  }

  const transcripts = await getRecentlyCompletedTranscripts(LOOKBACK_HOURS);
  if (transcripts.length === 0) {
    return NextResponse.json({ checked: 0, sent: 0 });
  }

  const allFeeds = await getAllFeeds();
  let sent = 0;
  const errors: string[] = [];

  for (const t of transcripts) {
    const playerId = t.kaltura_id;
    try {
      const video = await getVideoByKalturaId(playerId);
      if (!video) continue;

      // Recipients = per-video subscribers ∪ subscribers of any matching feed.
      const feedKeys = matchFeeds(video, allFeeds);
      const [videoSubs, feedSubs] = await Promise.all([
        getVideoSubscribers(playerId),
        getFeedSubscribers(feedKeys),
      ]);

      const byUser = new Map<string, Recipient>();
      for (const r of [...videoSubs, ...feedSubs]) byUser.set(r.user_id, r);
      if (byUser.size === 0) continue;

      const alreadySent = await getNotifiedUserIds(t.transcript_id);

      for (const recipient of byUser.values()) {
        if (alreadySent.has(recipient.user_id)) continue;
        try {
          // Send first, then record — so a send failure is retried next run
          // rather than silently swallowed by an early ledger write.
          await sendTranscriptReady(recipient.email, video);
          await markTranscriptNotified(recipient.user_id, t.transcript_id);
          sent++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `[notifications] Failed to email ${recipient.email} for ${t.transcript_id}: ${msg}`,
          );
          errors.push(`${t.transcript_id}/${recipient.email}: ${msg}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[notifications] Error processing ${t.transcript_id}: ${msg}`,
      );
      errors.push(`${t.transcript_id}: ${msg}`);
    }
  }

  console.log(
    `[${ts()}] [notifications] checked ${transcripts.length}, sent ${sent}, ${errors.length} errors`,
  );

  return NextResponse.json({ checked: transcripts.length, sent, errors });
}
