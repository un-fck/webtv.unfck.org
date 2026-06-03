"use client";

import { useLocale, useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { useTransition } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { headerPillClass } from "@/lib/header-pill";
import { cn } from "@/lib/utils";

// Native endonyms — each locale labelled in its own language. The list shows
// the same names regardless of which UI locale is active, so a user who has
// landed in the wrong language can still recognise their own.
const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  ar: "العربية",
  zh: "中文",
  ru: "Русский",
};

export function LanguagePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const active = useLocale() as Locale;
  const [pending, startTransition] = useTransition();
  const t = useTranslations("header");

  function pick(locale: Locale) {
    if (locale === active) return;
    startTransition(() => {
      // The i18n router preserves the current path and swaps only the locale
      // prefix. Cookie persistence is handled by next-intl middleware on the
      // resulting request.
      router.replace(pathname, { locale });
    });
  }

  return (
    <Popover>
      <PopoverTrigger
        aria-label={t("language")}
        className={cn(headerPillClass, pending && "opacity-60")}
      >
        {/* The trigger announces the active language *in that language* — so a
            user who landed in the wrong locale recognises their own option
            (e.g. someone wanting Arabic on an English page reads "English" and
            knows to switch). The endonym + chevron together is enough to
            convey "language switcher"; no icon is needed (un.org's own
            convention). */}
        <span lang={active}>{LOCALE_LABELS[active]}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        <p className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
          {t("language")}
        </p>
        <ul className="flex flex-col">
          {routing.locales.map((locale) => (
            <li key={locale}>
              <button
                type="button"
                onClick={() => pick(locale)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                  locale === active
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
                lang={locale}
              >
                <span>{LOCALE_LABELS[locale]}</span>
                {locale === active && (
                  <span className="ml-2 text-xs text-un-blue-text">●</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
