import { getRecentlyCompletedTranscripts, getAllFeeds, withJobLock } from "@/lib/db";
import { notifyTranscriptSubscribers } from "@/lib/notifications/notify";

const ts = () => new Date().toTimeString().slice(0, 8);

// How far back to look for completed transcripts. Comfortably larger than the
// cron interval so a transient failure gets retried on subsequent runs.
const LOOKBACK_HOURS = 24;

export type SendNotificationsResult =
  | { skipped: "lock_held" }
  | { checked: number; sent: number; errors?: string[] };

export async function runSendTranscriptNotifications(): Promise<SendNotificationsResult> {
  const result = await withJobLock(
    "send-transcript-notifications",
    async () => {
      const transcripts = await getRecentlyCompletedTranscripts(LOOKBACK_HOURS);
      if (transcripts.length === 0) {
        return { checked: 0, sent: 0 };
      }

      const allFeeds = await getAllFeeds();
      let sent = 0;
      const errors: string[] = [];

      // Per-transcript recipient resolution + dedup'd send lives in the shared
      // helper (same code path the instant post-completion hook uses). The
      // ledger claim inside makes this a backstop: transcripts already emailed
      // by the instant hook are skipped here.
      for (const t of transcripts) {
        const res = await notifyTranscriptSubscribers(t, allFeeds);
        sent += res.sent;
        errors.push(...res.errors);
      }

      console.log(
        `[${ts()}] [notifications] checked ${transcripts.length}, sent ${sent}, ${errors.length} errors`,
      );

      return { checked: transcripts.length, sent, errors };
    },
  );
  return result ?? { skipped: "lock_held" };
}
