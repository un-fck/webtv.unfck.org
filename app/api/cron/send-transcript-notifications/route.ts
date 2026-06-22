// Cron: emails subscribers when a requested transcript is ready.
import { NextRequest, NextResponse } from "next/server";
import { runSendTranscriptNotifications } from "@/lib/cron/send-transcript-notifications";
import { apiError } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError(401, "unauthorized", "Unauthorized");
  }
  const result = await runSendTranscriptNotifications();
  return NextResponse.json(result);
}
