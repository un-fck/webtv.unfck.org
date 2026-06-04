import { NextRequest, NextResponse } from "next/server";
import { runProcessScheduled } from "@/lib/cron/process-scheduled";
import { apiError } from "@/lib/api-error";

// `after()` in the pipeline keeps work alive past the response — keep this
// function's keep-alive window long enough on platforms that enforce one.
// 800s is the Vercel Pro + Fluid Compute ceiling; no-op on Azure (long-lived
// container).
export const maxDuration = 800;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError(401, "unauthorized", "Unauthorized");
  }
  const result = await runProcessScheduled();
  return NextResponse.json(result);
}
