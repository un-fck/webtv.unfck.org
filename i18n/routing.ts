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
