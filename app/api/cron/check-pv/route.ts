// Cron: checks for newly available PV documents on recent meetings.
import { NextRequest, NextResponse } from "next/server";
import { runCheckPv } from "@/lib/cron/check-pv";
import { checkCronAuth } from "@/lib/cron/auth";

export async function GET(request: NextRequest) {
  const unauthorized = checkCronAuth(request);
  if (unauthorized) return unauthorized;
  const result = await runCheckPv();
  return NextResponse.json(result);
}
