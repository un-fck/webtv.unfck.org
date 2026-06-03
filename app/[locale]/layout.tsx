import type { Metadata } from "next";
import { Roboto, Noto_Sans_Arabic, Noto_Sans_SC } from "next/font/google";
import Script from "next/script";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import { AnimatedCornerLogo } from "@/components/animated-corner-logo";
import { SkipLink } from "@/components/skip-link";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TimezoneProvider } from "@/lib/hooks/use-timezone";
import { routing, RTL_LOCALES } from "@/i18n/routing";
import { cn } from "@/lib/utils";

// Privacy-first analytics (Umami). Only loaded when the env var is set, so
// dev and contributor builds run script-free. No cookies, no consent banner
// needed; aggregates pageviews + referrers + countries at the Umami backend.
const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
const UMAMI_SRC =
  process.env.NEXT_PUBLIC_UMAMI_SRC || "https://cloud.umami.is/script.js";

// https://fonts.google.com/specimen/Roboto
// 100 (Thin), 300 (Light), 400 (Regular), 500 (Medium), 700 (Bold), 800 (ExtraBold), 900 (Black)
const roboto = Roboto({
  weight: ["100", "300", "400", "500", "700", "800", "900"],
  subsets: ["latin"],
  variable: "--font-roboto",
  display: "swap",
});

// Roboto's "latin" subset doesn't cover Arabic script. Noto Sans Arabic is
// the Google Fonts companion and matches Roboto's neutral grotesque feel.
const notoArabic = Noto_Sans_Arabic({
  weight: ["400", "500", "700"],
  subsets: ["arabic"],
  variable: "--font-arabic",
  display: "swap",
});

// Han characters require a CJK font. Noto Sans SC (Simplified Chinese)
// covers UN simplified-Chinese usage.
const notoSC = Noto_Sans_SC({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-sc",
  display: "swap",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    title: t("siteTitle"),
    description: t("siteDescription"),
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const messages = await getMessages();
  const dir = RTL_LOCALES.has(locale) ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      className={cn(
        roboto.variable,
        notoArabic.variable,
        notoSC.variable,
        "antialiased",
      )}
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          <TimezoneProvider>
            <TooltipProvider delayDuration={200}>
              <SkipLink />
              {children}
              <AnimatedCornerLogo />
            </TooltipProvider>
          </TimezoneProvider>
        </NextIntlClientProvider>
        {UMAMI_WEBSITE_ID && (
          <Script
            src={UMAMI_SRC}
            data-website-id={UMAMI_WEBSITE_ID}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
