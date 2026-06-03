"use client";

import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { useTransition } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
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
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          pending && "opacity-60",
        )}
      >
        <Languages className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
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
