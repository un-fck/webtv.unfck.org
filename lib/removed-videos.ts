import {
  fetchKalturaEntryStatuses,
  KALTURA_STATUS_DELETED,
} from "./kaltura-helpers";
import {
  getRemovalCandidates,
  markVideoRemoved,
  clearVideoRemoved,
} from "./db";
import { fetchAssetPage } from "./un-api";

// ── Shared removal core ──────────────────────────────────────────────────────
// One vocabulary and one writer, reused by both detectors: the lazy check on
// the detail-page render and the periodic reaper. Each keeps its own fetching
// (single vs batched) but funnels the verdict through `applyRemoval`.

/** Upstream liveness for one source. `unknown` = ambiguous → never act. */
export type Liveness = "gone" | "live" | "unknown";

/** WebTV asset-page HTTP status → liveness. Only an explicit 404 is "gone". */
export function classifyWebtv(status: number): Liveness {
  if (status === 404) return "gone";
  if (status >= 200 && status < 300) return "live";
  return "unknown"; // 403/5xx, or 0 for a network error
}

/** Kaltura entry status → liveness. `undefined` = entry not returned. */
export function classifyKaltura(status: number | undefined): Liveness {
  if (status === KALTURA_STATUS_DELETED) return "gone";
  if (status === undefined) return "unknown";
  return "live";
}

/** Probe a single asset's WebTV liveness (used by the reaper, one GET/asset). */
export async function probeWebtvLiveness(assetId: string): Promise<Liveness> {
  const { status } = await fetchAssetPage(assetId);
  return classifyWebtv(status);
}

/**
 * The single writer of removal state. Applies each source's verdict to its own
 * column via `markVideoRemoved`/`clearVideoRemoved`, so the two sources never
 * race. `unknown` verdicts (and omitted sources) are left untouched. Returns
 * what changed, preferring `removed` over `restored` when both moved.
 */
export async function applyRemoval(
  assetId: string,
  signals: { webtv?: Liveness; kaltura?: Liveness },
): Promise<"removed" | "restored" | "noop"> {
  let removed = false;
  let restored = false;

  if (signals.kaltura === "gone") {
    await markVideoRemoved(assetId, "kaltura");
    removed = true;
  } else if (signals.kaltura === "live") {
    if (await clearVideoRemoved(assetId, "kaltura")) restored = true;
  }

  if (signals.webtv === "gone") {
    await markVideoRemoved(assetId, "webtv");
    removed = true;
  } else if (signals.webtv === "live") {
    if (await clearVideoRemoved(assetId, "webtv")) restored = true;
  }

  return removed ? "removed" : restored ? "restored" : "noop";
}

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
      const wasRemoved = row.kaltura_deleted_at !== null;

      if (isDeleted && !wasRemoved) {
        if (apply) await markVideoRemoved(row.asset_id, "kaltura");
        result.removed++;
        onChange?.(row.asset_id, true);
      } else if (!isDeleted && wasRemoved) {
        if (apply) await clearVideoRemoved(row.asset_id, "kaltura");
        result.restored++;
        onChange?.(row.asset_id, false);
      }
    }
  }

  return result;
}
