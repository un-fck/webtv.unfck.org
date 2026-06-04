import { formatDate, scrapeVideosForDates, videoToRecord } from "@/lib/un-api";
import { resolveEntryId } from "@/lib/kaltura-helpers";
import {
  saveVideo,
  getVideoByAssetId,
  getEnabledFeeds,
  scheduleTranscript,
  withJobLock,
} from "@/lib/db";
import { matchFeeds } from "@/lib/feeds";
import { backfillDurations } from "@/lib/duration-backfill";
import { reapRemovedVideos } from "@/lib/removed-videos";

export type SyncVideosResult =
  | { skipped: "lock_held" }
  | {
      synced: number;
      resolved: number;
      autoScheduled: number;
      durationsBackfilled: number;
      videosRemoved: number;
      videosRestored: number;
      errors: string[];
    };

/**
 * Scrape tomorrow + the last 3 days of UN Web TV schedule, persist videos,
 * resolve Kaltura entry IDs, auto-schedule transcription for newly-seen videos
 * matching enabled feeds, then run duration-backfill and removed-video reaping
 * on the last 30 days.
 */
export async function runSyncVideos(): Promise<SyncVideosResult> {
  const result = await withJobLock("sync-videos", async () => {
    const today = new Date();
    const dates: string[] = [];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dates.push(formatDate(tomorrow));
    for (let i = 0; i < 3; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(formatDate(date));
    }

    console.log(`[sync-videos] Scraping dates: ${dates.join(", ")}`);

    // scrapeVideosForDates fans out across all six locales and returns a
    // deduplicated Video[] keyed on asset_id, with the localized
    // title/category pre-merged into each row's i18n map.
    const uniqueVideos = await scrapeVideosForDates(dates);

    let synced = 0;
    let resolved = 0;
    let autoScheduled = 0;
    const errors: string[] = [];
    const enabledFeeds = await getEnabledFeeds();

    for (const video of uniqueVideos) {
      try {
        const record = videoToRecord(video);
        const existing = await getVideoByAssetId(video.id);
        const cachedEntryId = existing?.entry_id ?? null;
        const entryId = await resolveEntryId(video.id, cachedEntryId);
        if (entryId) {
          record.entry_id = entryId;
          if (!cachedEntryId) resolved++;
        }
        await saveVideo(record);
        synced++;
        if (!existing && record.kaltura_id) {
          const matched = matchFeeds(record, enabledFeeds);
          if (matched.length > 0) {
            await scheduleTranscript(video.id, record.kaltura_id, null, null);
            autoScheduled++;
            console.log(
              `[sync-videos] Auto-scheduled ${video.id} for feeds: ${matched.join(", ")}`,
            );
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[sync-videos] Error syncing ${video.id}: ${msg}`);
        errors.push(`${video.id}: ${msg}`);
      }
    }

    let durationsBackfilled = 0;
    try {
      const r = await backfillDurations({ apply: true, lookbackDays: 30 });
      durationsBackfilled = r.updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[sync-videos] Duration backfill failed: ${msg}`);
    }

    let videosRemoved = 0;
    let videosRestored = 0;
    try {
      const r = await reapRemovedVideos({ apply: true, lookbackDays: 30 });
      videosRemoved = r.removed;
      videosRestored = r.restored;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[sync-videos] Removed-video reap failed: ${msg}`);
    }

    console.log(
      `[sync-videos] Done: ${synced} synced, ${resolved} new entry IDs resolved, ` +
        `${autoScheduled} auto-scheduled, ${durationsBackfilled} durations backfilled, ` +
        `${videosRemoved} removed, ${videosRestored} restored, ${errors.length} errors`,
    );

    return {
      synced,
      resolved,
      autoScheduled,
      durationsBackfilled,
      videosRemoved,
      videosRestored,
      errors,
    };
  });
  return result ?? { skipped: "lock_held" };
}
