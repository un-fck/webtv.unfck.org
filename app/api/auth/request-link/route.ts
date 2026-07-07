// Sends a magic-link login email to the given address.
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { sendMagicLink } from "@/lib/auth/mail";
import { createMagicToken, recentTokenExists } from "@/lib/auth/service";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Abuse controls beyond the per-email cooldown (tunable). The per-IP hourly cap
// stops one source from bombing many distinct addresses; the global daily cap
// bounds total SMTP volume/cost and — unlike the per-IP bucket — cannot be
// dodged by spoofing X-Forwarded-For.
const IP_LIMIT_PER_HOUR = 10;
const GLOBAL_SENDS_PER_DAY = 300;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  // Per-IP hourly cap. Reuses the "recently sent" copy (429, but the login form
  // reads the JSON body not the status) so no new locale string is needed.
  const ipCheck = await rateLimit({
    bucket: "request-link:ip",
    identifier: `ip:${getClientIp(request)}`,
    limit: IP_LIMIT_PER_HOUR,
    windowMs: HOUR_MS,
  });
  if (!ipCheck.allowed) {
    return NextResponse.json(
      { ok: false, error: t("errorRecentToken") },
      { status: 429 },
    );
  }
  if (await recentTokenExists(email)) {
    return NextResponse.json({ ok: false, error: t("errorRecentToken") });
  }
  // Global daily send ceiling — checked only past the per-email cooldown so
  // cooldown-blocked retries can't exhaust it (which would DoS sign-in for
  // everyone). Counts genuine send attempts.
  const globalCheck = await rateLimit({
    bucket: "request-link:email:global",
    identifier: "__global__",
    limit: GLOBAL_SENDS_PER_DAY,
    windowMs: DAY_MS,
  });
  if (!globalCheck.allowed) {
    return NextResponse.json(
      { ok: false, error: t("errorRecentToken") },
      { status: 429 },
    );
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
