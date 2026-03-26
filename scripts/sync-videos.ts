#!/usr/bin/env tsx
import { getScheduleVideos, videoToRecord } from "../lib/un-api";
import { saveVideo, getVideoByAssetId, updateVideoEntryId } from "../lib/turso";
import { extractKalturaId } from "../lib/kaltura";

const args = process.argv.slice(2);
const daysArg = args.find((arg) => arg.startsWith("--days="));
const DAYS_TO_SYNC = daysArg ? parseInt(daysArg.split("=")[1]) : 7;

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Usage: npm run sync-videos -- [options]

Options:
  --days=N    Number of days to sync (default: 7)
  --help, -h  Show this help message

Examples:
  npm run sync-videos                 # Sync last 7 days
  npm run sync-videos -- --days=30    # Sync last 30 days
  npm run sync-videos -- --days=365   # Sync entire year
  
Note: The "--" before options is required when using npm run
  `);
  process.exit(0);
}

if (isNaN(DAYS_TO_SYNC) || DAYS_TO_SYNC < 1) {
  console.error("Error: --days must be a positive number");
  process.exit(1);
}

async function resolveEntryId(kalturaId: string): Promise<string | null> {
  try {
    const response = await fetch(
      "https://cdnapisec.kaltura.com/api_v3/service/multirequest",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "1": {
            service: "session",
            action: "startWidgetSession",
            widgetId: "_2503451",
          },
          "2": {
            service: "baseEntry",
            action: "list",
            ks: "{1:result:ks}",
            filter: { redirectFromEntryId: kalturaId },
            responseProfile: { type: 1, fields: "id" },
          },
          apiVersion: "3.3.0",
          format: 1,
          ks: "",
          clientTag: "html5:v3.17.30",
          partnerId: 2503451,
        }),
      },
    );

    if (!response.ok) return null;

    const data = await response.json();
    return data[1]?.objects?.[0]?.id || null;
  } catch (error) {
    console.error(`Failed to resolve entry ID for ${kalturaId}:`, error);
    return null;
  }
}

async function main() {
  console.log(
    `Syncing videos from last ${DAYS_TO_SYNC} day${DAYS_TO_SYNC === 1 ? "" : "s"}...`,
  );

  // Force scraping to get fresh data
  const videos = await getScheduleVideos(DAYS_TO_SYNC, false);

  console.log(`Found ${videos.length} videos to sync`);

  let savedCount = 0;
  let resolvedCount = 0;
  let errorCount = 0;

  for (const video of videos) {
    try {
      // Check if we already have this video cached
      const existing = await getVideoByAssetId(video.id);

      // Convert video to record format (handles duration parsing)
      const record = videoToRecord(video);

      // Preserve existing entry_id if available
      if (existing?.entry_id) {
        record.entry_id = existing.entry_id;
      }

      // Save/update video metadata
      await saveVideo(record);
      savedCount++;

      // If we don't have an entry_id yet, try to resolve it
      if (!existing?.entry_id) {
        const kalturaId = extractKalturaId(video.id);
        if (kalturaId) {
          const entryId = await resolveEntryId(kalturaId);
          if (entryId) {
            await updateVideoEntryId(video.id, entryId);
            resolvedCount++;
            console.log(`  ✓ ${video.id} → ${entryId}`);
          }
        }
      }
    } catch (error) {
      errorCount++;
      console.error(
        `  ✗ Failed to sync ${video.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log("\nSync complete:");
  console.log(`  Saved: ${savedCount}`);
  console.log(`  Entry IDs resolved: ${resolvedCount}`);
  console.log(`  Errors: ${errorCount}`);

  process.exit(0);
}

main().catch((error) => {
  console.error("Sync failed:", error);
  process.exit(1);
});
