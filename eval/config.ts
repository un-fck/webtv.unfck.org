/** The 6 official UN languages with their codes */
export const UN_LANGUAGES: Record<string, string> = {
  en: "english",
  fr: "french",
  es: "spanish",
  ar: "arabic",
  zh: "chinese",
  ru: "russian",
};

/** ISO code → documents.un.org language param */
export const DOC_LANG_CODES: Record<string, string> = {
  en: "en",
  fr: "fr",
  es: "es",
  ar: "ar",
  zh: "zh",
  ru: "ru",
};

/** Filler words to strip before WER comparison, per language */
export const FILLER_WORDS: Record<string, string[]> = {
  en: ["um", "uh", "ah", "er", "hmm", "mm", "mhm", "erm"],
  fr: ["euh", "heu", "hum", "ben", "bah"],
  es: ["eh", "este", "pues", "bueno", "mm"],
  ar: ["يعني", "آه", "إيه"],
  zh: ["嗯", "啊", "那个", "这个"],
  ru: ["э", "эм", "ну", "вот", "так"],
};
