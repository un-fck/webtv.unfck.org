/** Centralized UN language definitions used across the stack. */

export interface UnLanguage {
  /** BCP-47 code (e.g. 'en', 'fr') or 'floor' for the original audio */
  code: string;
  /** Display name */
  name: string;
  /** Kaltura flavor `language` field value (lowercase), or null if unknown */
  kalturaName: string | null;
}

export const UN_LANGUAGES: UnLanguage[] = [
  { code: "floor", name: "Floor (Original)", kalturaName: "interlingua" },
  { code: "en", name: "English", kalturaName: "english" },
  { code: "fr", name: "French", kalturaName: "french" },
  { code: "es", name: "Spanish", kalturaName: "spanish" },
  { code: "ar", name: "Arabic", kalturaName: "arabic" },
  { code: "zh", name: "Chinese", kalturaName: "chinese" },
  { code: "ru", name: "Russian", kalturaName: "russian" },
];

const byCode = new Map(UN_LANGUAGES.map((l) => [l.code, l]));
const byKaltura = new Map(
  UN_LANGUAGES.filter((l) => l.kalturaName).map((l) => [l.kalturaName!, l]),
);

/** BCP-47 code → Kaltura flavor language name. Returns 'english' for unknown codes. */
export function bcp47ToKalturaName(code: string): string {
  return byCode.get(code)?.kalturaName ?? "english";
}

/** Kaltura flavor language name → BCP-47 code. Returns 'floor' for unrecognized names. */
export function kalturaNameToBcp47(kalturaName: string): string {
  return byKaltura.get(kalturaName.toLowerCase())?.code ?? "floor";
}

/** BCP-47 code → display name. */
export function getLanguageDisplayName(code: string): string {
  return byCode.get(code)?.name ?? code.toUpperCase();
}

/** BCP-47 code → full language name for prompts (e.g. 'English', 'French'). */
export function getLanguageFullName(code: string): string {
  const lang = byCode.get(code);
  if (!lang || code === "floor") return "the original language";
  return lang.name;
}
