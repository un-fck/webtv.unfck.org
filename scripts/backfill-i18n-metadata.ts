#!/usr/bin/env tsx
/**
 * One-shot backfill of the per-locale `i18n` map on `webtv.videos` by
 * re-scraping the WebTV schedule across all six official languages for a
 * date range further back than the rolling cron window.
 *
 * The harvest is additive — `saveVideo` merges the new `i18n` slots with
 * `videos.i18n || EXCLUDED.i18n`, so reruns are safe and partial fetches
 * never blank existing translations. Idempotent.
 *
 * Run:
 *   tsx scripts/backfill-i18n-metadata.ts                # default: 365 days back
 *   tsx scripts/backfill-i18n-metadata.ts -- --days=730  # 2 years back
 *   tsx scripts/backfill-i18n-metadata.ts -- --start=2024-01-01 --end=2024-12-31
 *
 * Politeness: dates are processed in chunks of CHUNK_DAYS at a time, each
 * chunk fanning out across all 6 locales in parallel (CHUNK_DAYS × 6 ≈ peak
 * concurrency), then waiting before the next chunk. WebTV cached pages
 * tolerate moderate bursts; tune CHUNK_DAYS if you see throttling.
 *
 * Prints a per-locale coverage summary at the end so the measurement can
 * inform whether the locale-strict default UX is still appropriate.
 */
import "@/lib/load-env";
import { scrapeVideosForDates, videoToRecord, formatDate } from "@/lib/un-api";
import { saveVideo, getVideoByAssetId, pool } from "@/lib/db";

const CHUNK_DAYS = 10; // 10 dates × 6 locales = 60 parallel fetches per chunk
const args = process.argv.slice(2);

function arg(name: string): string | undefined {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found?.split("=")[1];
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Usage: tsx scripts/backfill-i18n-metadata.ts [options]

Options:
  --days=N             Days back from today (default: 365). Ignored if
                       --start / --end are set.
  --start=YYYY-MM-DD   Inclusive start date.
  --end=YYYY-MM-DD     Inclusive end date (default: today).
  --help, -h           Show this help message.

Examples:
  tsx scripts/backfill-i18n-metadata.ts -- --days=180
  tsx scripts/backfill-i18n-metadata.ts -- --start=2024-01-01 --end=2024-12-31
`);
  process.exit(0);
}

function buildDateRange(): string[] {
  const start = arg("start");
  const end = arg("end");
  if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
    const endDate = end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? new Date(end) : new Date();
    const startDate = new Date(start);
    const dates: string[] = [];
    for (
      const d = new Date(startDate);
      d <= endDate;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      dates.push(formatDate(d));
    }
    return dates;
  }
  const days = parseInt(arg("days") ?? "365", 10);
  if (isNaN(days) || days < 1) {
    console.error("--days must be a positive integer");
    process.exit(1);
  }
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(formatDate(d));
  }
  return dates;
}

async function reportCoverage(): Promise<void> {
  const result = await pool.query(
    `SELECT jsonb_object_keys(i18n) AS locale, COUNT(*) AS count
       FROM webtv.videos
       WHERE i18n <> '{}'::jsonb
       GROUP BY locale
       ORDER BY locale`,
  );
  console.log("\nPer-locale coverage (videos with i18n entry):");
  for (const row of result.rows as { locale: string; count: string }[]) {
    console.log(`  ${row.locale}: ${row.count}`);
  }
  const total = await pool.query(`SELECT COUNT(*) AS n FROM webtv.videos`);
  console.log(`  (total videos in DB: ${(total.rows[0] as { n: string }).n})`);
}

async function main(): Promise<void> {
  const dates = buildDateRange();
  console.log(
    `Backfilling i18n metadata across ${dates.length} dates × 6 locales = ${dates.length * 6} HTTP requests.`,
  );
  console.log(
    `Processing in chunks of ${CHUNK_DAYS} dates (${CHUNK_DAYS * 6} parallel fetches per chunk).\n`,
  );

  let saved = 0;
  let errors = 0;
  let processed = 0;

  for (let i = 0; i < dates.length; i += CHUNK_DAYS) {
    const chunk = dates.slice(i, i + CHUNK_DAYS);
    let videos;
    try {
      videos = await scrapeVideosForDates(chunk);
    } catch (err) {
      errors++;
      console.error(
        `  ✗ chunk ${chunk[0]}..${chunk[chunk.length - 1]} fetch failed:`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }

    for (const video of videos) {
      try {
        const record = videoToRecord(video);
        // Preserve existing entry_id — the harvest doesn't resolve Kaltura
        // entry_ids; the regular sync cron handles that.
        const existing = await getVideoByAssetId(video.id);
        if (existing?.entry_id) record.entry_id = existing.entry_id;
        await saveVideo(record);
        saved++;
      } catch (err) {
        errors++;
        console.error(
          `  ✗ save failed for ${video.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    processed += chunk.length;
    console.log(
      `  …${processed}/${dates.length} dates, ${saved} rows merged, ${errors} errors`,
    );
  }

  console.log(`\nBackfill complete: ${saved} rows merged, ${errors} errors.`);
  await reportCoverage();
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
