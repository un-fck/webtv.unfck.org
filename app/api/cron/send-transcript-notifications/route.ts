// Cron: emails subscribers when a requested transcript is ready.
import { NextRequest, NextResponse } from "next/server";
import { runSendTranscriptNotifications } from "@/lib/cron/send-transcript-notifications";
import { checkCronAuth } from "@/lib/cron/auth";

export async function GET(request: NextRequest) {
  const unauthorized = checkCronAuth(request);
  if (unauthorized) return unauthorized;
  const result = await runSendTranscriptNotifications();
  return NextResponse.json(result);
}
