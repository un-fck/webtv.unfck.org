import nodemailer from "nodemailer";

export const SITE_TITLE = "UN Transcripts";

/**
 * All outbound mail flows through {@link deliver}. Two transports:
 *
 * 1. **Logic App relay** (production) — when `EMAIL_RELAY_URL` is set, the
 *    message is POSTed to an Azure Logic App whose HTTP trigger sends it from
 *    the `transcripts-app-noreply@un.org` shared mailbox via the Office 365
 *    connector. Mail then originates from a real un.org mailbox with aligned
 *    SPF/DKIM/DMARC — the reason this indirection exists (mailbox.org mail was
 *    landing in spam). The `from` address is fixed by the Logic App, so callers
 *    never set it.
 * 2. **SMTP fallback** (dev / rollback) — when `EMAIL_RELAY_URL` is unset, mail
 *    goes out directly via nodemailer/SMTP as before. Unset the env var to
 *    revert instantly.
 *
 * The relay is authenticated by a shared secret (`EMAIL_RELAY_SECRET`) sent as
 * an `auth` field in the JSON body and checked as the Logic App's first action.
 * (Body field rather than an HTTP header so the exact-case match is reliable —
 * header-name casing gets normalized in transit and by Azure's front end.) Keep
 * both the URL and the secret out of logs — either alone is a send credential.
 */

const RELAY_TIMEOUT_MS = 10_000;

// SMTP transport — only constructed/used on the fallback path.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.mailbox.org",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  // Require STARTTLS on the 587 submission port: fail the send rather than
  // transmit a magic-link token over cleartext if a network attacker strips
  // the TLS upgrade. (secure:false + requireTLS = mandatory STARTTLS.)
  requireTLS: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const mailFrom = () =>
  `"${SITE_TITLE}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function deliverViaRelay(
  url: string,
  msg: OutboundEmail,
): Promise<void> {
  const secret = process.env.EMAIL_RELAY_SECRET;
  if (!secret) {
    throw new Error(
      "EMAIL_RELAY_URL is set but EMAIL_RELAY_SECRET is missing — refusing to call the relay unauthenticated.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELAY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...msg, auth: secret }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Email relay responded ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Send one email through the active transport (Logic App relay or SMTP). */
export async function deliver(msg: OutboundEmail): Promise<void> {
  const relayUrl = process.env.EMAIL_RELAY_URL;
  if (relayUrl) {
    await deliverViaRelay(relayUrl, msg);
    return;
  }
  await transporter.sendMail({ from: mailFrom(), ...msg });
}
