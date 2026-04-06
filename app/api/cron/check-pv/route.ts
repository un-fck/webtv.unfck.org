import { NextRequest, NextResponse } from "next/server";
import {
  getVideosNeedingPVCheck,
  updatePVAvailability,
} from "@/lib/turso";
import { pvDocumentExists } from "@/lib/pv-documents";

const MAX_CHECKS_PER_RUN = 20;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  return NextResponse.json({
    checked: toCheck.length,
    remaining: videos.length - toCheck.length,
    found,
    missing,
    errors,
  });
}
