#!/usr/bin/env tsx
/**
 * Recover videos that were silently dropped by the historical slug-collision
 * bug (two assets sharing a pv_symbol → same slug → second INSERT rejected by
 * the slug UNIQUE index).
 *
 * `saveVideo` now resolves slugs against the DB (appending -part-N on
 * collision), so simply re-scraping the recent window and re-saving inserts the
 * previously-dropped siblings. Existing rows keep their slug (stability), so
 * this is safe to re-run.
 *
 * Usage:
 *   tsx scripts/backfill-missing-videos.ts [days]   # default 60
 */
import { scrapeVideos, videoToRecord } from "../lib/un-api";
import { saveVideo, getVideoByAssetId } from "../lib/db";

const DAYS = parseInt(process.argv[2] ?? "60", 10);

if (isNaN(DAYS) || DAYS < 1) {
  console.error("Error: days must be a positive number");
  process.exit(1);
}

async function main() {
  console.log(`Backfilling missing videos from the last ${DAYS} days...`);

  const videos = await scrapeVideos(DAYS);
  console.log(`Scraped ${videos.length} videos`);

  let inserted = 0;
  let existed = 0;
  let errors = 0;

  for (const video of videos) {
    try {
      const before = await getVideoByAssetId(video.id);
      await saveVideo(videoToRecord(video));
      if (before) {
        existed++;
      } else {
        inserted++;
        console.log(`  + ${video.id}  (${video.pvSymbol ?? "no symbol"})`);
      }
    } catch (error) {
      errors++;
      console.error(
        `  ✗ ${video.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log("\nBackfill complete:");
  console.log(`  Newly inserted (recovered): ${inserted}`);
  console.log(`  Already present: ${existed}`);
  console.log(`  Errors: ${errors}`);

  process.exit(0);
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
