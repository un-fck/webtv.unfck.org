// Clears the current user session (logout).
import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/service";

export async function POST() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
