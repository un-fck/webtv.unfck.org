import { defineRouting } from "next-intl/routing";

// The six official UN languages, in the canonical order prescribed by the
// UN multilingualism web standards (Arabic, Chinese, English, French, Russian,
// Spanish — i.e. the order of the endonyms عربي 中文 English Français Русский
// Español). The order is what the language picker iterates, and it also sets
// next-intl's fallback order for `Accept-Language` negotiation.
export const routing = defineRouting({
  locales: ["ar", "zh", "en", "fr", "ru", "es"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

// Locales that should render with right-to-left text direction.
export const RTL_LOCALES = new Set<string>(["ar"]);

/**
 * Build a Next.js `alternates` object for a given locale-agnostic path so the
 * route emits the full hreflang set required by the UN multilingualism web
 * standards. `path` should NOT include a leading locale segment — pass `"/about"`,
 * not `"/en/about"`. The current locale's URL becomes the canonical; every
 * other locale gets a `<link rel="alternate" hreflang="...">`. `x-default`
 * falls to English to match common SEO conventions on UN-system sites.
 */
export function alternatesFor(
  locale: string,
  path: string = "/",
): { canonical: string; languages: Record<string, string> } {
  const tail = path === "/" ? "" : path;
  const languages: Record<string, string> = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}${tail}`]),
  );
  languages["x-default"] = `/en${tail}`;
  return { canonical: `/${locale}${tail}`, languages };
}
