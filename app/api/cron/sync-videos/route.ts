import { NextRequest, NextResponse } from "next/server";
import {
  fetchVideosForDate,
  formatDate,
  videoToRecord,
} from "@/lib/un-api";
import { resolveEntryId } from "@/lib/kaltura-helpers";
import { saveVideo, getVideoByAssetId } from "@/lib/turso";
import { apiError } from "@/lib/api-error";

export async function POST(request: NextRequest) {
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
  const errors: string[] = [];

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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[sync-videos] Error syncing ${video.id}: ${msg}`);
      errors.push(`${video.id}: ${msg}`);
    }
  }

  console.log(
    `[sync-videos] Done: ${synced} synced, ${resolved} new entry IDs resolved, ${errors.length} errors`,
  );

  return NextResponse.json({ synced, resolved, errors });
}
