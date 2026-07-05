// Cron: recalculates timestamp offsets for re-cut videos.
import { NextRequest, NextResponse } from "next/server";
import { runRealign } from "@/lib/cron/realign";
import { checkCronAuth } from "@/lib/cron/auth";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const unauthorized = checkCronAuth(request);
  if (unauthorized) return unauthorized;
  const result = await runRealign();
  return NextResponse.json(result);
}
