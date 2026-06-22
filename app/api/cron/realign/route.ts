// Cron: recalculates timestamp offsets for re-cut videos.
import { NextRequest, NextResponse } from "next/server";
import { runRealign } from "@/lib/cron/realign";
import { apiError } from "@/lib/api-error";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError(401, "unauthorized", "Unauthorized");
  }
  const result = await runRealign();
  return NextResponse.json(result);
}
