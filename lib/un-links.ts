// External-link helpers that respect the active UI locale.
//
// UN Multilingualism Web Standards (un.org/en/multilingualism-web-standards)
// require non-selected language links to indicate their target language and
// to stay minimal. The cleanest interpretation here: when we link out to
// un.org or webtv.un.org, route the user to the matching locale of that
// destination instead of dumping them on English. Both sites publish all six
// official languages under the same `/{locale}/...` URL scheme as this app.
//
// `locale` accepts any string so callers can pass `useLocale()` directly;
// unknown values fall back to English so we never produce a broken link.

const UN_LOCALES = new Set(["ar", "zh", "en", "fr", "ru", "es"]);

function normalize(locale: string | undefined): string {
  return locale && UN_LOCALES.has(locale) ? locale : "en";
}

/** Localize webtv.un.org links — schedule, asset, or any other locale-scoped path. */
export function webtvUrl(path: string = "", locale?: string): string {
  const lang = normalize(locale);
  const tail = path.replace(/^\/+/, "");
  return tail
    ? `https://webtv.un.org/${lang}/${tail}`
    : `https://webtv.un.org/${lang}/`;
}

/** Localize www.un.org links. Pass a tail path (no leading locale segment). */
export function unUrl(path: string = "", locale?: string): string {
  const lang = normalize(locale);
  const tail = path.replace(/^\/+/, "");
  return tail
    ? `https://www.un.org/${lang}/${tail}`
    : `https://www.un.org/${lang}/`;
}

/**
 * Given a stored canonical WebTV asset URL (always `/en/asset/...` per
 * `lib/un-api.ts`), return the locale-appropriate variant. Idempotent if the
 * URL already targets the requested locale or isn't a webtv URL.
 */
export function localizeWebtvAssetUrl(url: string, locale?: string): string {
  return url.replace(
    /^https:\/\/webtv\.un\.org\/(?:ar|zh|en|fr|ru|es)\//,
    `https://webtv.un.org/${normalize(locale)}/`,
  );
}
