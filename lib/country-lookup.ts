import countryNames from "@/lib/data/country-names.json";

/**
 * Official UN country names (UNSD M49 standard) keyed by ISO alpha-3 code,
 * in all six official UN languages. Vendored snapshot — re-harvest with
 * `tsx scripts/harvest-country-names.ts` when the M49 list changes.
 */
const COUNTRY_NAMES = countryNames as Record<
  string,
  Record<string, string | undefined>
>;

/**
 * Resolve an ISO alpha-3 code to the official UN country name in the given
 * locale (defaults to English). Returns null for unknown codes — M49 covers
 * all UN member and observer states, but not every ISO code (e.g. TWN).
 */
export function getCountryName(
  iso3Code: string,
  locale: string = "en",
): string | null {
  const entry = COUNTRY_NAMES[iso3Code.toUpperCase()];
  if (!entry) return null;
  return entry[locale] ?? entry.en ?? null;
}
