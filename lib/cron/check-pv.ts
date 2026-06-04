import {
  getVideosNeedingPVCheck,
  updatePVAvailability,
  withJobLock,
} from "@/lib/db";
import { pvDocumentExists } from "@/lib/pv-documents";

const MAX_CHECKS_PER_RUN = 20;

export type CheckPvResult =
  | { skipped: "lock_held" }
  | {
      checked: number;
      remaining: number;
      found: number;
      missing: number;
      errors: string[];
    };

export async function runCheckPv(): Promise<CheckPvResult> {
  const result = await withJobLock("check-pv", async () => {
    const videos = await getVideosNeedingPVCheck(90, 7);
    const toCheck = videos.slice(0, MAX_CHECKS_PER_RUN);
    console.log(
      `[check-pv] ${videos.length} videos need checking, processing ${toCheck.length}`,
    );

    let found = 0;
    let missing = 0;
    const errors: string[] = [];

    for (const { asset_id, pv_symbol } of toCheck) {
      try {
        const exists = await pvDocumentExists(pv_symbol);
        await updatePVAvailability(asset_id, exists);
        if (exists) {
          found++;
          console.log(`[check-pv] ✓ ${pv_symbol} available`);
        } else {
          missing++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[check-pv] Error checking ${pv_symbol}: ${msg}`);
        errors.push(`${pv_symbol}: ${msg}`);
      }
    }

    console.log(
      `[check-pv] Done: ${found} found, ${missing} missing, ${errors.length} errors`,
    );

    return {
      checked: toCheck.length,
      remaining: videos.length - toCheck.length,
      found,
      missing,
      errors,
    };
  });
  return result ?? { skipped: "lock_held" };
}
