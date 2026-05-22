import { pool } from "./db";
import { fetchKalturaDurations } from "./kaltura-helpers";

export interface BackfillDurationOptions {
  /** Write changes. When false, computes counts without mutating. */
  apply: boolean;
  /** Only consider rows from the last N days (0 = no cap). Default 0. */
  lookbackDays?: number;
  /** Include rows whose date is today or future (default: past only). */
  includeFuture?: boolean;
  /** Kaltura idIn batch size. Default 100. */
  batch?: number;
  /** Called for each row that gets (or would get) a duration. */
  onUpdate?: (asset_id: string, durationSeconds: number, title: string) => void;
}

export interface BackfillDurationResult {
  candidates: number;
  updated: number;
  zeroOrMissing: number;
  errors: number;
}

/**
 * Backfill `videos.duration` for rows stuck at 0/null by reading the
 * authoritative duration from Kaltura (the player's own source).
 *
 * These rows exist because duration is only captured from the schedule
 * listing's badge at scrape time, and the sync cron only re-scrapes a ~4-day
 * window — webtv often publishes the badge after the date has aged out. Kaltura
 * knows the duration regardless, so we read it directly.
 *
 * Safe by construction: only ever writes a positive duration onto a row that is
 * still at 0/null; never hides or deletes anything. Idempotent.
 */
export async function backfillDurations(
  opts: BackfillDurationOptions,
): Promise<BackfillDurationResult> {
  const { apply, lookbackDays = 0, includeFuture = false, batch = 100 } = opts;

  const conds = ["(duration = 0 OR duration IS NULL)", "entry_id IS NOT NULL"];
  if (!includeFuture) conds.push("date < CURRENT_DATE");
  if (lookbackDays > 0) {
    conds.push(`date >= CURRENT_DATE - ${Math.floor(lookbackDays)}::int`);
  }

  const { rows } = await pool.query<{
    asset_id: string;
    entry_id: string;
    title: string;
  }>(
    `SELECT asset_id, entry_id, title
     FROM webtv.videos
     WHERE ${conds.join(" AND ")}
     ORDER BY date DESC NULLS LAST`,
  );

  const result: BackfillDurationResult = {
    candidates: rows.length,
    updated: 0,
    zeroOrMissing: 0,
    errors: 0,
  };

  for (let i = 0; i < rows.length; i += batch) {
    const slice = rows.slice(i, i + batch);
    let durations: Map<string, number>;
    try {
      durations = await fetchKalturaDurations(slice.map((r) => r.entry_id));
    } catch {
      result.errors += slice.length;
      continue;
    }
    for (const row of slice) {
      const dur = durations.get(row.entry_id);
      if (!dur) {
        result.zeroOrMissing++;
        continue;
      }
      if (apply) {
        await pool.query(
          `UPDATE webtv.videos SET duration = $1, updated_at = NOW()
           WHERE asset_id = $2 AND (duration = 0 OR duration IS NULL)`,
          [dur, row.asset_id],
        );
      }
      result.updated++;
      opts.onUpdate?.(row.asset_id, dur, row.title);
    }
  }

  return result;
}
