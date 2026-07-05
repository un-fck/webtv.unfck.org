// Cron: marks heartbeat-stale transcript rows as interrupted.
import { NextRequest, NextResponse } from "next/server";
import { runLivenessSweep } from "@/lib/cron/liveness-sweep";
import { checkCronAuth } from "@/lib/cron/auth";

export async function GET(request: NextRequest) {
  const unauthorized = checkCronAuth(request);
  if (unauthorized) return unauthorized;
  const result = await runLivenessSweep();
  return NextResponse.json(result);
}
