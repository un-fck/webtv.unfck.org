import {
  fetchKalturaEntryStatuses,
  KALTURA_STATUS_DELETED,
} from "./kaltura-helpers";
import {
  getRemovalCandidates,
  markVideoRemoved,
  clearVideoRemoved,
} from "./db";

export interface ReapRemovedOptions {
  /** Write changes. When false, computes counts without mutating. */
  apply: boolean;
  /** Only consider rows seen in the last N days. Default 30. */
  lookbackDays?: number;
  /** Kaltura idIn batch size. Default 100. */
  batch?: number;
  onChange?: (assetId: string, removed: boolean) => void;
}

export interface ReapRemovedResult {
  candidates: number;
  removed: number;
  restored: number;
  errors: number;
}

/**
 * Reconcile recent videos with their Kaltura entry status and soft-disable any
 * whose entry is DELETED (status 3) — the state behind the player's "Video has
 * been removed" message. Also clears the flag on previously-removed rows whose
 * entry is no longer reporting deleted (false-positive recovery).
 *
 * Safe by construction: only toggles `removed_at`; never deletes a row or
 * touches a transcript. Idempotent. Designed to piggyback on the sync cron.
 */
export async function reapRemovedVideos(
  opts: ReapRemovedOptions,
): Promise<ReapRemovedResult> {
  const { apply, lookbackDays = 30, batch = 100, onChange } = opts;
  const rows = await getRemovalCandidates(lookbackDays);

  const result: ReapRemovedResult = {
    candidates: rows.length,
    removed: 0,
    restored: 0,
    errors: 0,
  };

  for (let i = 0; i < rows.length; i += batch) {
    const slice = rows.slice(i, i + batch);
    let statuses: Map<string, number>;
    try {
      statuses = await fetchKalturaEntryStatuses(slice.map((r) => r.entry_id));
    } catch {
      result.errors += slice.length;
      continue;
    }
    for (const row of slice) {
      const status = statuses.get(row.entry_id);
      // Unknown status (entry not returned) → leave the row untouched. We only
      // act on an explicit DELETED signal to avoid hiding videos on a transient
      // API hiccup or an entry the batch simply didn't include.
      if (status === undefined) continue;

      const isDeleted = status === KALTURA_STATUS_DELETED;
      const wasRemoved = row.removed_at !== null;

      if (isDeleted && !wasRemoved) {
        if (apply) await markVideoRemoved(row.asset_id);
        result.removed++;
        onChange?.(row.asset_id, true);
      } else if (!isDeleted && wasRemoved) {
        if (apply) await clearVideoRemoved(row.asset_id);
        result.restored++;
        onChange?.(row.asset_id, false);
      }
    }
  }

  return result;
}
