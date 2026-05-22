import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user: user ? { email: user.email } : null });
}
