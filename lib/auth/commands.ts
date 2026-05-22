"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendMagicLink } from "./mail";
import {
  clearSession,
  createMagicToken,
  createSession,
  isAllowedDomain,
  recentTokenExists,
  upsertUser,
  verifyMagicToken as verifyMagicTokenService,
} from "./service";

type ActionResult = { success: true } | { success: false; error: string };

export async function requestMagicLink(email: string): Promise<ActionResult> {
  if (!email || typeof email !== "string" || !email.trim()) {
    return { success: false, error: "Email required" };
  }
  const trimmedEmail = email.trim();
  if (!(await isAllowedDomain(trimmedEmail))) {
    return { success: false, error: "Email domain not allowed" };
  }
  if (await recentTokenExists(trimmedEmail)) {
    return {
      success: false,
      error:
        "A magic link was recently sent. Please check your email or wait a few minutes.",
    };
  }
  try {
    const token = await createMagicToken(trimmedEmail);
    await sendMagicLink(trimmedEmail, token);
    return { success: true };
  } catch (error) {
    console.error("Error sending magic link:", error);
    return { success: false, error: "Failed to send email. Please try again." };
  }
}

export async function verifyMagicToken(token: string): Promise<ActionResult> {
  if (!token || typeof token !== "string") {
    return { success: false, error: "Missing token" };
  }
  const email = await verifyMagicTokenService(token);
  if (!email) {
    return { success: false, error: "Invalid or expired link" };
  }
  const userId = await upsertUser(email);
  await createSession(userId);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function logout(): Promise<void> {
  await clearSession();
  redirect("/");
}
