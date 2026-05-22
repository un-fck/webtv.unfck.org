#!/usr/bin/env tsx
/**
 * Backfill `videos.duration` for past rows stuck at 0.
 *
 * Why these exist: duration is only ever captured from the schedule listing's
 * `HH:MM:SS` badge at scrape time (`lib/un-api.ts`), and the sync cron only
 * re-scrapes a ~4-day window. webtv publishes the badge once the VOD finalizes
 * *after* the live event — for some meetings that lands after the date has
 * aged out of the window, so the badge is never picked up and the row stays 0.
 * Kaltura (the player's own source) knows the duration regardless, so we read
 * it directly. The same logic runs each sync cron over a recent window
 * (`lib/duration-backfill.ts`); this script is for one-off / full-history runs.
 *
 * Safe by construction: only ever writes a positive duration onto a row that
 * currently has 0; never hides or deletes anything. Idempotent. Dry run unless
 * `--apply`.
 *
 * Usage:
 *   tsx scripts/backfill-durations.ts                    # dry run (default)
 *   tsx scripts/backfill-durations.ts --apply            # write changes
 *   tsx scripts/backfill-durations.ts --include-future   # also today/future rows
 *   tsx scripts/backfill-durations.ts --lookback=30      # only last 30 days (0 = all)
 *   tsx scripts/backfill-durations.ts --batch=100        # Kaltura idIn batch size
 */
import "../lib/load-env";
import { pool } from "../lib/db";
import { backfillDurations } from "../lib/duration-backfill";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const INCLUDE_FUTURE = args.includes("--include-future");
const LOOKBACK = Number(
  args.find((a) => a.startsWith("--lookback="))?.split("=")[1] ?? "0",
);
const BATCH = Number(
  args.find((a) => a.startsWith("--batch="))?.split("=")[1] ?? "100",
);

async function main() {
  console.log(
    APPLY
      ? "Applying duration backfill from Kaltura…"
      : "Dry run — pass --apply to write. Counts below reflect what WOULD change.",
  );

  const result = await backfillDurations({
    apply: APPLY,
    includeFuture: INCLUDE_FUTURE,
    lookbackDays: LOOKBACK,
    batch: BATCH,
    onUpdate: (assetId, dur, title) => {
      const hms = new Date(dur * 1000).toISOString().slice(11, 19);
      console.log(`  ✓ ${assetId} → ${hms}  ${title.slice(0, 60)}`);
    },
  });

  const tag = APPLY ? "" : " [dry run — no writes]";
  console.log(
    `\nDone${tag}: ${result.updated} rows ${APPLY ? "updated" : "would update"} ` +
      `of ${result.candidates} candidates, ${result.zeroOrMissing} still 0/missing in Kaltura, ` +
      `${result.errors} fetch errors`,
  );
  await pool.end();
}

main().catch(async (error) => {
  console.error("Backfill failed:", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
