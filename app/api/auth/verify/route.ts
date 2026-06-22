// Verifies a magic-link token and creates an authenticated session.
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import {
  verifyMagicToken,
  upsertUser,
  createSession,
} from "@/lib/auth/service";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    token?: unknown;
    locale?: unknown;
  };
  const token = typeof body.token === "string" ? body.token : "";
  const locale = typeof body.locale === "string" ? body.locale : "en";
  const t = await getTranslations({ locale, namespace: "verify" });

  if (!token) {
    return NextResponse.json({ ok: false, error: t("errorMissingToken") });
  }
  const email = await verifyMagicToken(token);
  if (!email) {
    return NextResponse.json({ ok: false, error: t("errorInvalidLink") });
  }
  const userId = await upsertUser(email);
  await createSession(userId);
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
