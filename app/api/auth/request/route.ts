import { NextResponse } from "next/server";
import {
  isAllowedDomain,
  createMagicToken,
  recentTokenExists,
} from "@/lib/auth/service";
import { sendMagicLink } from "@/lib/auth/mail";

export async function POST(request: Request) {
  let email: unknown;
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!email || typeof email !== "string")
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  if (!(await isAllowedDomain(email)))
    return NextResponse.json(
      { error: "Email domain not allowed" },
      { status: 403 },
    );
  if (await recentTokenExists(email))
    return NextResponse.json(
      { error: "Magic link recently sent. Check your email or wait." },
      { status: 429 },
    );
  const token = await createMagicToken(email);
  await sendMagicLink(email, token);
  return NextResponse.json({ ok: true });
}
