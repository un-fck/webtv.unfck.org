"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { ExternalLink } from "@/components/external-link";
import {
  SOCIAL_LABELS,
  SocialIcon,
  type SocialNetwork,
} from "@/components/social-icons";
import { pageWidth, widePageWidth } from "@/lib/layout";
import { unUrl } from "@/lib/un-links";
import { cn } from "@/lib/utils";

// Wide pages all live under the [...meeting] catch-all and start with one of
// these top-level segments (see lib/meeting-slug.ts). Everything else
// (about, login, speakers, subscriptions, verify, home) uses the standard
// pageWidth.
const WIDE_SEGMENTS = new Set(["sc", "ga", "hrc", "ecosoc", "meeting"]);

function isWidePathname(pathname: string): boolean {
  // pathname is like "/{locale}/sc/9748" or "/{locale}" or "/{locale}/about".
  const segments = pathname.split("/").filter(Boolean);
  return segments.length >= 2 && WIDE_SEGMENTS.has(segments[1]);
}

// ---------------------------------------------------------------------------
// Replica of the www.un.org footer. Markup was scraped from un.org/{locale}/
// and the exact dimensions/colors below were read with Playwright from the
// live site's computed styles (2026-06). Labels live in the message catalogs
// (footer.links.*); the structural data here — target paths, per-locale
// display order, per-locale social accounts — is navigation fact, not
// translation, so it stays in code.
// ---------------------------------------------------------------------------

const LINK_PATHS = {
  siteIndex: "site-index",
  contact: "contact-us-0",
  copyright: "about-us/copyright",
  faq: "about-us/frequently-asked-questions",
  fraudAlert: "about-us/fraud-alert",
  privacyNotice: "about-us/privacy-notice",
  termsOfUse: "about-us/terms-of-use",
} as const;

type LinkKey = keyof typeof LINK_PATHS;

// un.org alphabetizes the bottom links per locale: fr/es sort by their
// translated labels; en is alphabetical already and ar/zh/ru keep the
// English semantic order.
const DEFAULT_LINK_ORDER: LinkKey[] = [
  "siteIndex",
  "contact",
  "copyright",
  "faq",
  "fraudAlert",
  "privacyNotice",
  "termsOfUse",
];

const LINK_ORDER: Partial<Record<string, LinkKey[]>> = {
  fr: [
    "termsOfUse",
    "privacyNotice",
    "contact",
    "fraudAlert",
    "copyright",
    "faq",
    "siteIndex",
  ],
  es: [
    "fraudAlert",
    "contact",
    "termsOfUse",
    "faq",
    "privacyNotice",
    "copyright",
    "siteIndex",
  ],
};

function linkHref(key: LinkKey, locale: string): string {
  // The Chinese contact page is the one URL that differs across locales.
  const path =
    key === "contact" && locale === "zh" ? "contact" : LINK_PATHS[key];
  return unUrl(path, locale);
}

// Each un.org locale links its own social accounts (different handles per
// language); the Chinese edition shows none.
const SOCIAL_ACCOUNTS: Record<string, [SocialNetwork, string][]> = {
  en: [
    ["facebook", "https://www.facebook.com/unitednations"],
    ["x", "https://twitter.com/un"],
    ["youtube", "https://www.youtube.com/unitednations"],
    ["flickr", "https://www.flickr.com/photos/un_photo/"],
    ["instagram", "https://www.instagram.com/unitednations"],
  ],
  fr: [
    ["facebook", "https://www.facebook.com/nationsunies/"],
    ["x", "https://twitter.com/onu_fr"],
    ["youtube", "https://www.youtube.com/user/onuenaction"],
    ["instagram", "https://www.instagram.com/nations_unies/"],
    ["flickr", "https://www.flickr.com/photos/un_photo/"],
  ],
  es: [
    ["facebook", "https://www.facebook.com/nacionesunidas"],
    ["x", "https://twitter.com/ONU_es"],
    ["youtube", "https://www.youtube.com/user/NacionesUnidasVideo"],
    ["instagram", "https://www.instagram.com/nacionesunidas/"],
    ["flickr", "https://www.flickr.com/photos/un_photo/"],
  ],
  ar: [
    ["youtube", "https://www.youtube.com/user/UNarabic"],
    ["x", "https://twitter.com/UNarabic"],
    ["facebook", "https://www.facebook.com/UnitedNationsArabic"],
    ["flickr", "https://www.flickr.com/photos/un_photo/"],
  ],
  ru: [
    ["facebook", "https://www.facebook.com/UnitedNationsRussian/"],
    ["x", "https://twitter.com/UnitedNationsRU"],
    ["youtube", "https://www.youtube.com/user/NationsRU"],
    ["flickr", "https://www.flickr.com/photos/un_photo/"],
  ],
  zh: [],
};

// Official per-locale footer lockups (emblem + localized wordmark in one
// white SVG), vendored from un.org's bootstrap_un2 theme. All share a
// 91.1-unit intrinsic height; un.org renders them 52px tall, so the display
// width is round(intrinsicWidth / 91.1 × 52) per locale.
const LOGO_WIDTHS: Record<string, number> = {
  en: 170,
  fr: 171,
  es: 192,
  ar: 165,
  zh: 194,
  ru: 177,
};

// Bottom-of-page footer mounted in the locale layout so every route gets it.
//
// Pixel replica of the www.un.org footer (4px blue border, #333 panel,
// per-locale reverse logo, per-locale social accounts, Donate, 3px-pipe
// separated links), so footer content reads in the active locale
// (Multilingualism Web Standards req #9) and the logo doubles as the
// reciprocal back-link to un.org in the same language (req #12).
export function SiteFooter() {
  const tFooter = useTranslations("footer");
  const locale = useLocale();
  const pathname = usePathname();
  const wide = isWidePathname(pathname);
  const logoLocale = locale in LOGO_WIDTHS ? locale : "en";
  const social = SOCIAL_ACCOUNTS[locale] ?? SOCIAL_ACCOUNTS.en;
  const linkOrder = LINK_ORDER[locale] ?? DEFAULT_LINK_ORDER;

  return (
    <footer className="mt-auto border-t-4 border-un-blue bg-[#333333] text-white">
      <div
        className={cn(
          "mx-auto px-4 pt-8 pb-[33px] sm:px-8",
          wide ? widePageWidth : pageWidth,
        )}
      >
        <div className="flex flex-wrap items-center gap-y-6">
          <ExternalLink
            href={unUrl("", locale)}
            className="shrink-0 transition-opacity hover:opacity-80"
          >
            <Image
              src={`/images/un-logo-${logoLocale}-reverse.svg`}
              alt={tFooter("unName")}
              width={LOGO_WIDTHS[logoLocale]}
              height={52}
              className="h-[52px] w-auto select-none"
              draggable={false}
            />
          </ExternalLink>
          <div className="ms-auto flex items-center ps-4">
            {social.length > 0 && (
              <nav
                aria-label={tFooter("socialLabel")}
                className="flex items-center gap-7"
              >
                {social.map(([network, href]) => (
                  <ExternalLink
                    key={network}
                    href={href}
                    aria-label={SOCIAL_LABELS[network]}
                    className="text-[#c4c4c4] transition-colors hover:text-white"
                  >
                    <SocialIcon network={network} className="h-6 w-6" />
                  </ExternalLink>
                ))}
              </nav>
            )}
            {/* On un.org the icon/button divider is a border on the donate
                wrapper: 28px after the icons, 1px #808080 line, 21px before
                the button — exactly as tall as the button. */}
            <div
              className={cn(
                social.length > 0 && "ms-7 border-s border-[#808080] ps-[21px]",
              )}
            >
              <ExternalLink
                href={unUrl("about-us/how-to-donate-to-the-un-system", locale)}
                className="inline-block rounded border border-un-blue bg-white px-5 pt-[9px] pb-[10px] text-xs leading-3 font-bold tracking-[1.27px] whitespace-nowrap text-[#454545] uppercase transition-colors hover:bg-[#e6e6e6]"
              >
                {tFooter("donate")}
              </ExternalLink>
            </div>
          </div>
        </div>
        <div aria-hidden className="mt-4 mb-[19px] border-t border-[#5b5b5b]" />
        <nav aria-label={tFooter("linksLabel")}>
          <ul className="flex flex-wrap justify-end gap-y-2 text-xs leading-[14px] font-medium tracking-[0.77px] uppercase">
            {linkOrder.map((key) => (
              <li
                key={key}
                className="border-e-[3px] border-[#808080] ps-2.5 pe-[13px] last:border-e-0 last:pe-0"
              >
                <ExternalLink
                  href={linkHref(key, locale)}
                  className="hover:underline"
                >
                  {tFooter(`links.${key}`)}
                </ExternalLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
