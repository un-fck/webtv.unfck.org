import {
  getRecentlyCompletedTranscripts,
  getVideoByKalturaId,
  getVideoSubscribers,
  getFeedSubscribers,
  getAllFeeds,
  claimTranscriptNotification,
  withJobLock,
  type Recipient,
} from "@/lib/db";
import { matchFeeds } from "@/lib/feeds";
import { sendTranscriptReady } from "@/lib/notifications/mail";

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

      for (const t of transcripts) {
        const playerId = t.kaltura_id;
        const language = t.language_code;
        if (!language) {
          // Defensive: schema allows NULL but every real row has a code. If a
          // legacy NULL row sneaks through we can't tell who to notify, so skip.
          console.warn(
            `[notifications] Skipping ${t.transcript_id}: NULL language_code`,
          );
          continue;
        }
        try {
          const video = await getVideoByKalturaId(playerId);
          if (!video) continue;

          // Recipients = per-video subscribers ∪ subscribers of any matching feed.
          // Both filtered by the completing transcript's language — subscriptions
          // are per-(video, language) and per-(feed, language).
          const feedKeys = matchFeeds(video, allFeeds);
          const [videoSubs, feedSubs] = await Promise.all([
            getVideoSubscribers(playerId, language),
            getFeedSubscribers(feedKeys, language),
          ]);

          const byUser = new Map<string, Recipient>();
          for (const r of [...videoSubs, ...feedSubs]) byUser.set(r.user_id, r);
          if (byUser.size === 0) continue;

          for (const recipient of byUser.values()) {
            // Atomically claim the ledger row first; only send if we won the
            // claim. Trades a rare missed email on SMTP failure (logged +
            // Sentry-reported) for guaranteed no-duplicates across replicas.
            const claimed = await claimTranscriptNotification(
              recipient.user_id,
              t.transcript_id,
            );
            if (!claimed) continue;
            try {
              await sendTranscriptReady(recipient.email, video);
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

      return { checked: transcripts.length, sent, errors };
    },
  );
  return result ?? { skipped: "lock_held" };
}
