import { getTranslations } from "next-intl/server";

import { deliver } from "@/lib/email/transport";
import { getTrustedBaseUrl } from "@/lib/get-base-url";

export async function sendMagicLink(
  email: string,
  token: string,
  locale: string,
) {
  // Locale embedded in the magic-link URL so the verify page (and the post-
  // verify navigation) lands in the same language the user requested. The
  // header/body of the email are pulled from the locale's catalog.
  // Trusted (config-only) origin — never the request Host — so a forged Host
  // on the sign-in request cannot redirect this token-bearing link.
  const link = `${getTrustedBaseUrl()}/${locale}/verify?token=${token}`;
  const t = await getTranslations({
    locale,
    namespace: "email.magicLink",
  });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  const siteTitle = tMeta("siteTitle");

  await deliver({
    to: email,
    subject: t("subject"),
    text: `${siteTitle}\n\n${t("body")}\n\n${link}\n\n${t("spamHint")}\n\n${t("ignoreNote")}`,
    html: `<!DOCTYPE html><html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" style="background:#fff;padding:32px 20px;"><tr><td align="center">
<table width="100%" style="max-width:520px;">
<tr><td style="padding:0 0 24px;"><div style="font-size:20px;font-weight:700;">${siteTitle}</div></td></tr>
<tr><td style="border-top:1px solid #e5e7eb;padding:24px 0 0;"></td></tr>
<tr><td><p style="margin:0 0 16px;font-size:15px;color:#374151;">${t("body")}</p>
<a href="${link}" style="display:inline-block;background:#009edb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:500;">${t("cta")}</a>
<p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">${t("fallback")} <a href="${link}" style="color:#009edb;word-break:break-all;">${link}</a></p>
</td></tr>
<tr><td style="padding:24px 0 0;"><p style="margin:0;font-size:13px;color:#6b7280;">${t("spamHint")}</p></td></tr>
<tr><td style="padding:16px 0 0;"><p style="margin:0;font-size:12px;color:#9ca3af;">${t("ignoreNote")}</p></td></tr>
</table></td></tr></table></body></html>`,
  });
}
