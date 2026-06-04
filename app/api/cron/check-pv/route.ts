import { NextRequest, NextResponse } from "next/server";
import { runCheckPv } from "@/lib/cron/check-pv";
import { apiError } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError(401, "unauthorized", "Unauthorized");
  }
  const result = await runCheckPv();
  return NextResponse.json(result);
}
