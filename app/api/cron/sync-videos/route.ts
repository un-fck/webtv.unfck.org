import { NextRequest, NextResponse } from "next/server";
import { fetchVideosForDate, formatDate, videoToRecord } from "@/lib/un-api";
import { resolveEntryId } from "@/lib/kaltura-helpers";
import {
  saveVideo,
  getVideoByAssetId,
  getEnabledFeeds,
  scheduleTranscript,
} from "@/lib/db";
import { matchFeeds } from "@/lib/feeds";
import { backfillDurations } from "@/lib/duration-backfill";
import { reapRemovedVideos } from "@/lib/removed-videos";
import { apiError } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError(401, "unauthorized", "Unauthorized");
  }

  // Scrape tomorrow + last 3 days
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

  const results = await Promise.all(dates.map(fetchVideosForDate));
  const videos = results.flat();

  // Deduplicate by ID
  const uniqueVideos = Array.from(
    new Map(videos.map((v) => [v.id, v])).values(),
  );

  let synced = 0;
  let resolved = 0;
  let autoScheduled = 0;
  const errors: string[] = [];

  // Enabled feeds drive proactive transcription of newly-discovered matches.
  const enabledFeeds = await getEnabledFeeds();

  for (const video of uniqueVideos) {
    try {
      const record = videoToRecord(video);

      // Check for existing entry_id to avoid Kaltura API call
      const existing = await getVideoByAssetId(video.id);
      const cachedEntryId = existing?.entry_id ?? null;

      const entryId = await resolveEntryId(video.id, cachedEntryId);
      if (entryId) {
        record.entry_id = entryId;
        if (!cachedEntryId) resolved++;
      }

      await saveVideo(record);
      synced++;

      // Newly-discovered video matching an enabled feed → queue transcription.
      // scheduleTranscript is idempotent; process-scheduled picks it up once
      // audio is available. Scoped to first-seen videos so enabling a feed
      // never bursts over the existing backlog.
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

  // Backfill durations for recent rows still stuck at 0 — webtv often publishes
  // the duration badge after a date has aged out of the scrape window above, so
  // we read it straight from Kaltura instead. Bounded to the last 30 days so we
  // don't re-poll permanently-zero/deleted entries forever.
  let durationsBackfilled = 0;
  try {
    const r = await backfillDurations({ apply: true, lookbackDays: 30 });
    durationsBackfilled = r.updated;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sync-videos] Duration backfill failed: ${msg}`);
  }

  // Soft-disable videos whose Kaltura entry was deleted (status 3) so they drop
  // out of schedule/search instead of rendering a dead "Video has been removed"
  // player. Bounded to the last 30 days, same window as the duration backfill.
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

  return NextResponse.json({
    synced,
    resolved,
    autoScheduled,
    durationsBackfilled,
    videosRemoved,
    videosRestored,
    errors,
  });
}
