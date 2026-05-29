import nodemailer from "nodemailer";

import { getBaseUrl } from "@/lib/get-base-url";

export const SITE_TITLE = "UN Transcripts";

export const mailFrom = () =>
  `"${SITE_TITLE}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.mailbox.org",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

export async function sendMagicLink(email: string, token: string) {
  const link = `${await getBaseUrl()}/verify?token=${token}`;

  await transporter.sendMail({
    from: mailFrom(),
    to: email,
    subject: `Sign in to ${SITE_TITLE}`,
    text: `${SITE_TITLE}\n\nClick here to sign in: ${link}\n\nThis link expires in 15 minutes.\n\nIf you did not request this email, you can safely ignore it.`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" style="background:#fff;padding:32px 20px;"><tr><td align="center">
<table width="100%" style="max-width:520px;">
<tr><td style="padding:0 0 24px;"><div style="font-size:20px;font-weight:700;">${SITE_TITLE}</div></td></tr>
<tr><td style="border-top:1px solid #e5e7eb;padding:24px 0 0;"></td></tr>
<tr><td><p style="margin:0 0 16px;font-size:15px;color:#374151;">Click the button below to sign in. This link expires in 15 minutes.</p>
<a href="${link}" style="display:inline-block;background:#009edb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:500;">Sign in</a>
<p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">Or copy: <a href="${link}" style="color:#009edb;word-break:break-all;">${link}</a></p>
</td></tr>
<tr><td style="padding:24px 0 0;"><p style="margin:0;font-size:12px;color:#9ca3af;">If you did not request this email, you can safely ignore it.</p></td></tr>
</table></td></tr></table></body></html>`,
  });
}
