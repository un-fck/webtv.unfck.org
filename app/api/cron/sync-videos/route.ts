import { NextRequest, NextResponse } from "next/server";
import { runSyncVideos } from "@/lib/cron/sync-videos";
import { apiError } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError(401, "unauthorized", "Unauthorized");
  }
  const range =
    request.nextUrl.searchParams.get("range") === "far" ? "far" : "near";
  const result = await runSyncVideos(range);
  return NextResponse.json(result);
}
