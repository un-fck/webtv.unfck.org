/**
 * Language-specific regex patterns for the PV/SR parser, extracted from
 * `pv-parser.ts` so the per-language data lives in one auditable place keyed by
 * language code. The parser is the dispatcher; this module is the config.
 *
 * Arabic PV speaker detection is NOT declarative — RTL PDF extraction splits the
 * speaker id from the turn boundary, so it needs the bespoke line-scan handler in
 * `pv-parser.ts`. Only its two extraction regexes live here (AR_SPEAKER_*).
 */

export type LangCode = "en" | "fr" | "es" | "ru" | "zh" | "ar";

// ── Language detection ─────────────────────────────────────────────────

export const LANG_HINTS: Array<{ lang: LangCode; pattern: RegExp }> = [
  {
    lang: "fr",
    pattern:
      /Le Président|La Présidente|Conseil de sécurité|Conseil économique et social/,
  },
  {
    lang: "es",
    pattern:
      /El Presidente|La Presidenta|Consejo de Seguridad|Consejo Económico y Social/,
  },
  {
    lang: "ru",
    pattern: /Председатель|Совет Безопасности|Экономический и Социальный Совет/,
  },
  { lang: "zh", pattern: /安全理事会|主席|经济及社会理事会/ },
  { lang: "ar", pattern: /مجلس الأمن|الرئيس|المجلس الاقتصادي والاجتماعي/ },
  {
    lang: "en",
    pattern:
      /Security Council|General Assembly|Economic and Social Council|The President/,
  },
];

// ── Speaker patterns per language ──────────────────────────────────────
//
// Each PV pattern captures:
//   group 1 = speaker name (e.g. "The President", "Ms. DiCarlo", "主席")
//   group 2 = first parenthetical (affiliation or spoken-language annotation)
//   group 3 = second parenthetical (if present)
// The interpretation of groups 2/3 depends on context — see interpretSpeakerMatch.

// EN: "The President:", "Mr. Fletcher (United Kingdom...):"
const EN_SPEAKER =
  /^(The (?:President|Chairperson|Chairman|Chairwoman|Acting President|Secretary-General)|(?:Mr|Mrs|Ms|Dr|Sir|Dame|Lord|Lady|Ambassador|Minister)\.\s+[\p{L}\s''-]+?)(?:\s*\(([^)]+)\))?(?:\s*\(([^)]+)\))?\s*:\s*/mu;

// FR: "Le Président (parle en anglais) :", "M. Bonnafont (France) (parle en anglais) :"
const FR_SPEAKER =
  /^(Le (?:Président|Secrétaire général)|La (?:Présidente|Secrétaire générale)|(?:M|Mme|Mlle)\.\s+[\p{L}\s''-]+?)(?:\s*\(([^)]+)\))?(?:\s*\(([^)]+)\))?\s*:\s*/mu;

// ES: "El Presidente (habla en inglés):", "Sra. Zalabata Torres (Colombia) (habla en inglés):"
const ES_SPEAKER =
  /^(El (?:Presidente|Secretario General)|La (?:Presidenta|Secretaria General)|(?:Sr|Sra|Srta)\.\s+[\p{L}\s''-]+?)(?:\s*\(([^)]+)\))?(?:\s*\(([^)]+)\))?\s*:\s*/mu;

// RU: "Председатель (говорит по-английски):", "Г-жа Дикарло (...):", "Г-н Небензя (Российская Федерация):"
const RU_SPEAKER =
  /^(Председатель(?:ница)?|(?:Г-н|Г-жа)\s+[\p{L}\s''-]+?)(?:\s*\(([^)]+)\))?(?:\s*\(([^)]+)\))?\s*:\s*/mu;

// ZH: "主席（以英语发言）：", "迪卡洛女士（以英语发言）：", "孙磊先生（中国）："
const ZH_SPEAKER =
  /^(主席|[\p{Script=Han}·\s]+?(?:先生|女士|夫人))(?:\s*（([^）]+)）)?(?:\s*（([^）]+)）)?\s*：\s*/mu;

// SR (Summary Record) speaker patterns — numbered paragraphs, third-person narrative.
// Groups: (1)=speaker name, (2)=parenthetical (affiliation/role). Paragraph number non-capturing.
const EN_SR_SPEAKER =
  /^(?:\d+)\.\s+(The (?:President|Chairperson|Chairman|Chairwoman|Acting President|Secretary-General)|(?:Mr|Mrs|Ms|Dr|Sir|Dame)\.\s+[\p{L}''-][\p{L}\s''-]*[\p{L}''-])\s*\(([^)]+)\)/mu;
const FR_SR_SPEAKER =
  /^(?:\d+)\.\s+(Le (?:Président|Secrétaire général)|La (?:Présidente|Secrétaire générale)|(?:M|Mme|Mlle)\.\s+[\p{L}''-][\p{L}\s''-]*[\p{L}''-])\s*\(([^)]+)\)/mu;
// ES SR: "1. La Sra. Schantz (...)" — note "La/El" article before title in SR format
const ES_SR_SPEAKER =
  /^(?:\d+)\.\s+(El (?:Presidente|Secretario General)|La (?:Presidenta|Secretaria General)|(?:(?:El |La )?(?:Sr|Sra|Srta))\.\s+[\p{L}''-][\p{L}\s''-]*[\p{L}''-])\s*\(([^)]+)\)/mu;
const RU_SR_SPEAKER =
  /^(?:\d+)\.\s+(Председатель(?:ница)?|(?:Г-н|Г-жа)\s+[\p{L}''-][\p{L}\s''-]*[\p{L}''-])\s*\(([^)]+)\)/mu;
const ZH_SR_SPEAKER =
  /^(?:\d+)\.\s+(主席|[\p{L}·\s]+?(?:先生|女士|夫人))(?:\s*[（(]([^）)]+)[）)])?\s*/mu;

export interface LangSpeakerPatterns {
  /** PV (verbatim) speaker line; null for Arabic (handled by the line-scan parser). */
  pv: RegExp | null;
  /** SR (summary) numbered speaker line; null for Arabic. */
  sr: RegExp | null;
}

export const SPEAKER_PATTERNS: Record<LangCode, LangSpeakerPatterns> = {
  en: { pv: EN_SPEAKER, sr: EN_SR_SPEAKER },
  fr: { pv: FR_SPEAKER, sr: FR_SR_SPEAKER },
  es: { pv: ES_SPEAKER, sr: ES_SR_SPEAKER },
  ru: { pv: RU_SPEAKER, sr: RU_SR_SPEAKER },
  zh: { pv: ZH_SPEAKER, sr: ZH_SR_SPEAKER },
  ar: { pv: null, sr: null },
};

// Arabic speaker extraction (bespoke line-scan in pv-parser.ts uses these).
// 1. With country: "تكلمت باإلنكليزية (التفيا) ( السيدة بافلوتا - ديسالنديس"
export const AR_SPEAKER_WITH_COUNTRY =
  /^(تكلم[ت]?\s+با[\p{L}]+)\s+\(([^)]+)\)\s*\(\s*(الرئيس(?:ة)?|(?:السيد|السيدة)\s+[\p{L}\s''-]+)/u;
// 2. No country: "تكلم باإلنكليزية( الرئيس"
export const AR_SPEAKER_NO_COUNTRY =
  /^(تكلم[ت]?\s+با[\p{L}]+)\(\s*(الرئيس(?:ة)?|(?:السيد|السيدة)\s+[\p{L}\s''-]+)/u;

// ── Spoken-language annotation detection ───────────────────────────────

function langNameToCode(name: string): string {
  const map: Record<string, string> = {
    english: "en",
    french: "fr",
    spanish: "es",
    russian: "ru",
    chinese: "zh",
    arabic: "ar",
    anglais: "en",
    français: "fr",
    espagnol: "es",
    russe: "ru",
    chinois: "zh",
    arabe: "ar",
    inglés: "en",
    francés: "fr",
    español: "es",
    ruso: "ru",
    chino: "zh",
    árabe: "ar",
  };
  return map[name.toLowerCase()] || name.toLowerCase();
}

function ruLangToCode(name: string): string {
  const map: Record<string, string> = {
    английски: "en",
    французски: "fr",
    испански: "es",
    русски: "ru",
    китайски: "zh",
    арабски: "ar",
  };
  return map[name.toLowerCase()] || name.toLowerCase();
}

function zhLangToCode(name: string): string {
  const map: Record<string, string> = {
    英: "en",
    法: "fr",
    西班牙: "es",
    俄: "ru",
    中: "zh",
    阿拉伯: "ar",
  };
  return map[name] || name;
}

function arLangToCode(name: string): string {
  // The extracted text may have "إلنكليزية" or "لفرنسية" etc. (with ال prefix)
  const map: Record<string, string> = {
    إنكليزية: "en",
    انكليزية: "en",
    إلنكليزية: "en",
    لنكليزية: "en", // variant after ال
    فرنسية: "fr",
    لفرنسية: "fr",
    إسبانية: "es",
    اسبانية: "es",
    إلسبانية: "es",
    لسبانية: "es",
    روسية: "ru",
    لروسية: "ru",
    صينية: "zh",
    لصينية: "zh",
    عربية: "ar",
    لعربية: "ar",
  };
  if (map[name]) return map[name];
  const stripped = name.replace(/^[إال]+/, "");
  if (map[stripped]) return map[stripped];
  return name;
}

export const SPOKEN_LANG_PATTERNS: Array<{
  pattern: RegExp;
  extract: (m: string) => string;
}> = [
  // EN
  { pattern: /spoke in (\w+)/i, extract: (m) => langNameToCode(m) },
  { pattern: /interpretation from (\w+)/i, extract: (m) => langNameToCode(m) },
  // FR
  { pattern: /parle en (\w+)/i, extract: (m) => langNameToCode(m) },
  // ES
  { pattern: /habla en (\w+)/i, extract: (m) => langNameToCode(m) },
  // RU
  { pattern: /говорит по-([\p{L}]+)/iu, extract: (m) => ruLangToCode(m) },
  // ZH
  { pattern: /以(\S+?)语?发言/, extract: (m) => zhLangToCode(m) },
  // AR: "تكلم باإلنكليزية", "تكلمت بالفرنسية" — "با" prefix, not always "بال"
  { pattern: /تكلم[ت]?\s+با([\p{L}]+)/u, extract: (m) => arLangToCode(m) },
];

// ── Procedural detection ─────────────────────────────────────────────────

// Paragraph-level: procedural/italic annotations within a speech turn.
export const PROCEDURAL_PARAGRAPH_PATTERNS = [
  // EN
  /^The meeting (?:was called to order|rose) at/i,
  /^\((?:spoke|continued) in \w+\)/i,
  /^\(interpretation from \w+\)/i,
  /^\(Mr\.|Mrs\.|Ms\..*(?:took the Chair|resumed the Chair)\)/i,
  /^A (?:recorded )?vote was taken/i,
  /^The draft (?:resolution|decision) was (?:adopted|rejected)/i,
  /^In favour:/i,
  /^Against:/i,
  /^Abstaining:/i,
  /^The result of the vote was as follows:/i,
  // FR
  /^La séance est (?:ouverte|levée)/i,
  /^Il est procédé au vote/i,
  /^Le projet de résolution est adopté/i,
  /^Votent pour\s*:/i,
  /^Votent contre\s*:/i,
  /^S'abstiennent\s*:/i,
  // ES
  /^Se (?:abre|declara abierta|levanta) la sesión/i,
  /^Se procede a votación/i,
  /^Votos a favor\s*:/i,
  /^Votos en contra\s*:/i,
  /^Abstenciones\s*:/i,
  // RU
  /^Заседание (?:открывается|закрывается)/i,
  /^Проводится голосование/i,
  // ZH
  /^(?:开会|散会)/,
  /^进行(?:记录)?表决/,
  // Cross-language: parenthetical notes
  /^\([^)]{5,}\)$/,
];

// Turn-level: strong procedural indicators (only applied to chair turns).
export const PROCEDURAL_PATTERNS = [
  // EN
  /adopted as resolution/i,
  /a vote was taken/i,
  /the agenda was adopted/i,
  /the meeting rose at/i,
  /I shall put the draft/i,
  /proceed to the vote/i,
  // FR
  /il est procédé au vote/i,
  /l'ordre du jour est adopté/i,
  /la séance est levée/i,
  // ES
  /se procede a votación/i,
  /queda aprobado el orden del día/i,
  /se levanta la sesión/i,
  // RU
  /повестка дня утверждается/i,
  /заседание закрывается/i,
  // ZH
  /议程通过/,
  /散会/,
];
