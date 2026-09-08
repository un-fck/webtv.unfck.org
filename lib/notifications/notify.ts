import * as Sentry from "@sentry/nextjs";
import {
  getVideoByKalturaId,
  getVideoSubscribers,
  getFeedSubscribers,
  getRetranscriptionRequester,
  getAllFeeds,
  getTranscriptById,
  claimTranscriptNotification,
  type Feed,
  type Recipient,
} from "@/lib/db";
import { matchFeeds } from "@/lib/feeds";
import { sendTranscriptReady } from "@/lib/notifications/mail";

/** The minimal shape needed to notify subscribers of one completed transcript. */
export interface NotifiableTranscript {
  transcript_id: string;
  kaltura_id: string;
  language_code: string | null;
}

export interface NotifyResult {
  sent: number;
  errors: string[];
}

/**
 * Email transcript-ready notifications for ONE completed transcript to all its
 * subscribers — the union of per-video subscribers and subscribers of any
 * matching feed, both filtered by the completing transcript's language.
 *
 * This is the single source of truth for "who gets notified for this
 * transcript", shared by two triggers:
 *   - the instant post-completion hook in `lib/transcription.ts` (fast path)
 *   - the `send-transcript-notifications` cron (5-min backstop)
 *
 * Correctness across both triggers rests on `claimTranscriptNotification`: it
 * atomically claims each `(user, transcript)` in the `sent_transcript_notifications`
 * ledger BEFORE sending. Claims are serialized per user/meeting/language and
 * check earlier transcript versions too. Only an explicit replacement requester
 * may be notified again, once for that replacement.
 *
 * Never throws. Per-recipient send failures and any top-level error are logged
 * + reported to Sentry and returned in `errors`. Pre-claim failures can be
 * retried by the cron; delivery failures retain their claim to avoid duplicates.
 *
 * @param allFeeds Pass the already-fetched feed list to avoid a per-transcript
 *   `getAllFeeds()` round-trip when notifying many transcripts (the cron does
 *   this). Omit for one-off instant sends.
 */
export async function notifyTranscriptSubscribers(
  t: NotifiableTranscript,
  allFeeds?: Feed[],
): Promise<NotifyResult> {
  const errors: string[] = [];
  let sent = 0;

  const language = t.language_code;
  if (!language) {
    // Defensive: schema allows NULL but every real row has a code. If a
    // legacy NULL row sneaks through we can't tell who to notify, so skip.
    console.warn(
      `[notifications] Skipping ${t.transcript_id}: NULL language_code`,
    );
    return { sent, errors };
  }

  try {
    const video = await getVideoByKalturaId(t.kaltura_id);
    if (!video) return { sent, errors };

    const feeds = allFeeds ?? (await getAllFeeds());

    // Recipients = per-video subscribers ∪ matching feed subscribers ∪ requester.
    // Both filtered by the completing transcript's language — subscriptions
    // are per-(video, language) and per-(feed, language).
    const feedKeys = matchFeeds(video, feeds);
    const [videoSubs, feedSubs, requester] = await Promise.all([
      getVideoSubscribers(t.kaltura_id, language),
      getFeedSubscribers(feedKeys, language),
      getRetranscriptionRequester(t.transcript_id),
    ]);

    const byUser = new Map<string, Recipient>();
    for (const r of [...videoSubs, ...feedSubs]) byUser.set(r.user_id, r);
    if (requester) byUser.set(requester.user_id, requester);
    if (byUser.size === 0) return { sent, errors };

    for (const recipient of byUser.values()) {
      // Atomically claim the ledger row first; only send if we won the
      // claim. Trades a rare missed email on SMTP failure (logged +
      // Sentry-reported) for guaranteed no-duplicates across replicas and
      // across the instant/cron triggers.
      const claimed = await claimTranscriptNotification(
        recipient.user_id,
        t.transcript_id,
      );
      if (!claimed) continue;
      try {
        await sendTranscriptReady(
          recipient.email,
          video,
          requester?.user_id === recipient.user_id
            ? "retranscription"
            : "subscription",
        );
        sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[notifications] Failed to email ${recipient.email} for ${t.transcript_id}: ${msg}`,
        );
        Sentry.captureException(err, {
          tags: {
            pipeline: "notifications",
            kind: "send_failed",
            transcript_id: t.transcript_id,
          },
        });
        errors.push(`${t.transcript_id}/${recipient.email}: ${msg}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[notifications] Error processing ${t.transcript_id}: ${msg}`,
    );
    Sentry.captureException(err, {
      tags: {
        pipeline: "notifications",
        kind: "process_failed",
        transcript_id: t.transcript_id,
      },
    });
    errors.push(`${t.transcript_id}: ${msg}`);
  }

  return { sent, errors };
}

/**
 * Instant-path convenience: load the transcript by id and notify its
 * subscribers. Used by the pipeline completion hook, which only has the
 * transcript id in hand. Never throws — a missing/unreadable row is logged
 * and treated as "nothing to notify" (the cron backstop still covers it).
 */
export async function notifyTranscriptSubscribersById(
  transcriptId: string,
): Promise<NotifyResult> {
  try {
    const t = await getTranscriptById(transcriptId);
    if (!t) {
      console.warn(
        `[notifications] Instant notify: transcript ${transcriptId} not found`,
      );
      return { sent: 0, errors: [] };
    }
    return await notifyTranscriptSubscribers({
      transcript_id: t.transcript_id,
      kaltura_id: t.kaltura_id,
      language_code: t.language_code,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[notifications] Instant notify failed for ${transcriptId}: ${msg}`,
    );
    Sentry.captureException(err, {
      tags: {
        pipeline: "notifications",
        kind: "instant_failed",
        transcript_id: transcriptId,
      },
    });
    return { sent: 0, errors: [`${transcriptId}: ${msg}`] };
  }
}
