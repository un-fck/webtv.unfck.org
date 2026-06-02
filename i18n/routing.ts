import { defineRouting } from "next-intl/routing";

// The six official UN languages. The order here determines fallback order
// for `Accept-Language` negotiation in next-intl's middleware.
export const routing = defineRouting({
  locales: ["en", "fr", "es", "ar", "zh", "ru"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

// Locales that should render with right-to-left text direction.
export const RTL_LOCALES = new Set<string>(["ar"]);
