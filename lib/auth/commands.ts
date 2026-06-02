"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { sendMagicLink } from "./mail";
import {
  clearSession,
  createMagicToken,
  createSession,
  recentTokenExists,
  upsertUser,
  verifyMagicToken as verifyMagicTokenService,
} from "./service";

type ActionResult = { success: true } | { success: false; error: string };

// Basic shape check — we deliberately do NOT gate on a domain allowlist here.
// Registration is open; experimental features are gated per-user via the
// `users.experimental_access` boolean (toggled directly in the DB; see the
// About page note for the user-facing request flow). The per-email cooldown
// below is the only abuse mitigation on this endpoint.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestMagicLink(email: string): Promise<ActionResult> {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "login" });
  if (!email || typeof email !== "string" || !email.trim()) {
    return { success: false, error: t("errorEmailRequired") };
  }
  const trimmedEmail = email.trim();
  if (!EMAIL_RE.test(trimmedEmail)) {
    return { success: false, error: t("errorInvalidEmail") };
  }
  if (await recentTokenExists(trimmedEmail)) {
    return { success: false, error: t("errorRecentToken") };
  }
  try {
    const token = await createMagicToken(trimmedEmail);
    await sendMagicLink(trimmedEmail, token, locale);
    return { success: true };
  } catch (error) {
    console.error("Error sending magic link:", error);
    return { success: false, error: t("errorSendFailed") };
  }
}

export async function verifyMagicToken(token: string): Promise<ActionResult> {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "verify" });
  if (!token || typeof token !== "string") {
    return { success: false, error: t("errorMissingToken") };
  }
  const email = await verifyMagicTokenService(token);
  if (!email) {
    return { success: false, error: t("errorInvalidLink") };
  }
  const userId = await upsertUser(email);
  await createSession(userId);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function logout(): Promise<void> {
  await clearSession();
  const locale = await getLocale();
  redirect({ href: "/", locale });
}
