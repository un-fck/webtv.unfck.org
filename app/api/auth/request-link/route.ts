// Sends a magic-link login email to the given address.
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { sendMagicLink } from "@/lib/auth/mail";
import { createMagicToken, recentTokenExists } from "@/lib/auth/service";

// Basic shape check — we deliberately do NOT gate on a domain allowlist here.
// Registration is open; experimental features are gated per-user via the
// `users.experimental_access` boolean (toggled directly in the DB; see the
// About page note for the user-facing request flow). The per-email cooldown
// inside the service is the only abuse mitigation on this endpoint.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    locale?: unknown;
  };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const locale = typeof body.locale === "string" ? body.locale : "en";
  const t = await getTranslations({ locale, namespace: "login" });

  if (!email) {
    return NextResponse.json({ ok: false, error: t("errorEmailRequired") });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: t("errorInvalidEmail") });
  }
  if (await recentTokenExists(email)) {
    return NextResponse.json({ ok: false, error: t("errorRecentToken") });
  }
  try {
    const token = await createMagicToken(email);
    await sendMagicLink(email, token, locale);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error sending magic link:", error);
    return NextResponse.json({ ok: false, error: t("errorSendFailed") });
  }
}
