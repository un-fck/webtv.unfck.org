// Pre-load the worker on the main thread to avoid worker file resolution issues
// in Next.js/Turbopack. The fake-worker setup does `import(workerSrc)` which fails
// when bundled, but if `globalThis.pdfjsWorker` is set, it uses that instead.
// @ts-expect-error — no type declarations for worker module
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
(globalThis as Record<string, unknown>).pdfjsWorker = pdfjsWorker;
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

// ── Types ──────────────────────────────────────────────────────────────

export interface PVDocument {
  symbol: string;
  body: string;
  session: string;
  meetingNumber: string;
  date: string;
  location: string;
  language: string;
  status: "provisional" | "official";
  president: { name: string; country: string } | null;
  members: Array<{ country: string; representative: string }>;
  agendaItems: string[];
  turns: PVTurn[];
  fullText: string;
}

export interface PVTurn {
  speaker: string;
  affiliation?: string;
  spokenLanguage?: string;
  /** e.g. "speaking on behalf of the Group of 77 and China" */
  onBehalfOf?: string;
  /** Original paragraph number from SR document (e.g. "1", "13") */
  paragraphNumber?: number;
  paragraphs: string[];
  type: "speech" | "procedural";
  /** Indices of paragraphs that are procedural/italic annotations (stage directions, etc.) */
  proceduralParagraphs?: number[];
}

// ── Language detection ─────────────────────────────────────────────────

const LANG_HINTS: Array<{ lang: string; pattern: RegExp }> = [
  { lang: "fr", pattern: /Le Président|La Présidente|Conseil de sécurité|Conseil économique et social/ },
  { lang: "es", pattern: /El Presidente|La Presidenta|Consejo de Seguridad|Consejo Económico y Social/ },
  { lang: "ru", pattern: /Председатель|Совет Безопасности|Экономический и Социальный Совет/ },
  { lang: "zh", pattern: /安全理事会|主席|经济及社会理事会/ },
  { lang: "ar", pattern: /مجلس الأمن|الرئيس|المجلس الاقتصادي والاجتماعي/ },
  { lang: "en", pattern: /Security Council|General Assembly|Economic and Social Council|The President/ },
];

function detectLanguage(text: string): string {
  for (const { lang, pattern } of LANG_HINTS) {
    if (pattern.test(text)) return lang;
  }
  return "en";
}

// ── Speaker patterns per language ──────────────────────────────────────
//
// Each pattern captures:
//   group 1 = speaker name (e.g. "The President", "Ms. DiCarlo", "主席")
//   group 2 = first parenthetical (could be affiliation or spoken-language annotation)
//   group 3 = second parenthetical (if present)
//
// The interpretation of groups 2/3 depends on context — see interpretSpeakerMatch.

// EN: "The President:", "Mr. Fletcher (United Kingdom of Great Britain and Northern Ireland):"
// Also handles continued/resumed: "The President (spoke in English):"
const EN_SPEAKER =
  /^(The (?:President|Chairperson|Chairman|Chairwoman|Acting President|Secretary-General)|(?:Mr|Mrs|Ms|Dr|Sir|Dame|Lord|Lady|Ambassador|Minister)\.\s+[\p{L}\s''-]+?)(?:\s*\(([^)]+)\))?(?:\s*\(([^)]+)\))?\s*:\s*/mu;

// FR: "Le Président (parle en anglais) :", "M. Bonnafont (France) (parle en anglais) :"
const FR_SPEAKER =
  /^(Le (?:Président|Secrétaire général)|La (?:Présidente|Secrétaire générale)|(?:M|Mme|Mlle)\.\s+[\p{L}\s''-]+?)(?:\s*\(([^)]+)\))?(?:\s*\(([^)]+)\))?\s*:\s*/mu;

// ES: "El Presidente (habla en inglés):", "Sra. Zalabata Torres (Colombia) (habla en inglés):"
const ES_SPEAKER =
  /^(El (?:Presidente|Secretario General)|La (?:Presidenta|Secretaria General)|(?:Sr|Sra|Srta)\.\s+[\p{L}\s''-]+?)(?:\s*\(([^)]+)\))?(?:\s*\(([^)]+)\))?\s*:\s*/mu;

// RU: "Председатель (говорит по-английски):", "Г-жа Дикарло (говорит по-английски):",
//     "Г-н Небензя (Российская Федерация):"
const RU_SPEAKER =
  /^(Председатель(?:ница)?|(?:Г-н|Г-жа)\s+[\p{L}\s''-]+?)(?:\s*\(([^)]+)\))?(?:\s*\(([^)]+)\))?\s*:\s*/mu;

// ZH: "主席（以英语发言）：", "迪卡洛女士（以英语发言）：", "孙磊先生（中国）："
//     "拉森女士（丹麦）（以英语发言）："
const ZH_SPEAKER =
  /^(主席|[\p{Script=Han}·\s]+?(?:先生|女士|夫人))(?:\s*（([^）]+)）)?(?:\s*（([^）]+)）)?\s*：\s*/mu;

// AR: Due to RTL PDF extraction, Arabic speaker patterns appear differently:
// 1. No country: "تكلم باإلنكليزية( الرئيس" or "تكلمت باإلنكليزية( السيدة ديكارلو"
// 2. With country: "تكلمت باإلنكليزية (التفيا) ( السيدة بافلوتا - ديسالنديس"
// The colon "): " appears on a nearby line.
// We handle Arabic specially in the parser using line-based detection.

// ── Spoken-language annotation detection ───────────────────────────────

const SPOKEN_LANG_PATTERNS: Array<{ pattern: RegExp; extract: (m: string) => string }> = [
  // EN: "spoke in French", "interpretation from French"
  { pattern: /spoke in (\w+)/i, extract: (m) => langNameToCode(m) },
  { pattern: /interpretation from (\w+)/i, extract: (m) => langNameToCode(m) },
  // FR: "parle en anglais", "parle en français"
  { pattern: /parle en (\w+)/i, extract: (m) => langNameToCode(m) },
  // ES: "habla en inglés", "habla en francés"
  { pattern: /habla en (\w+)/i, extract: (m) => langNameToCode(m) },
  // RU: "говорит по-английски", "говорит по-французски"
  { pattern: /говорит по-([\p{L}]+)/iu, extract: (m) => ruLangToCode(m) },
  // ZH: "以英语发言", "以法语发言"
  { pattern: /以(\S+?)语?发言/, extract: (m) => zhLangToCode(m) },
  // AR: "تكلم باإلنكليزية", "تكلمت بالفرنسية" — "با" prefix, not always "بال"
  { pattern: /تكلم[ت]?\s+با([\p{L}]+)/u, extract: (m) => arLangToCode(m) },
];

function langNameToCode(name: string): string {
  const map: Record<string, string> = {
    english: "en", french: "fr", spanish: "es", russian: "ru",
    chinese: "zh", arabic: "ar",
    anglais: "en", français: "fr", espagnol: "es", russe: "ru",
    chinois: "zh", arabe: "ar",
    inglés: "en", francés: "fr", español: "es", ruso: "ru",
    chino: "zh", árabe: "ar",
  };
  return map[name.toLowerCase()] || name.toLowerCase();
}

function ruLangToCode(name: string): string {
  const map: Record<string, string> = {
    английски: "en", французски: "fr", испански: "es",
    русски: "ru", китайски: "zh", арабски: "ar",
  };
  return map[name.toLowerCase()] || name.toLowerCase();
}

function zhLangToCode(name: string): string {
  const map: Record<string, string> = {
    英: "en", 法: "fr", 西班牙: "es", 俄: "ru", 中: "zh", 阿拉伯: "ar",
  };
  return map[name] || name;
}

function arLangToCode(name: string): string {
  // The extracted text may have "إلنكليزية" or "لفرنسية" etc. (with ال prefix)
  const map: Record<string, string> = {
    إنكليزية: "en", انكليزية: "en", إلنكليزية: "en",
    لنكليزية: "en", // variant after ال
    فرنسية: "fr", لفرنسية: "fr",
    إسبانية: "es", اسبانية: "es", إلسبانية: "es", لسبانية: "es",
    روسية: "ru", لروسية: "ru",
    صينية: "zh", لصينية: "zh",
    عربية: "ar", لعربية: "ar",
  };
  // Try exact match first, then try removing leading ل or إل
  if (map[name]) return map[name];
  const stripped = name.replace(/^[إال]+/, "");
  if (map[stripped]) return map[stripped];
  return name;
}

function extractSpokenLanguage(text: string): string | undefined {
  for (const { pattern, extract } of SPOKEN_LANG_PATTERNS) {
    const m = text.match(pattern);
    if (m) return extract(m[1]);
  }
  return undefined;
}

function isSpokenLanguageAnnotation(text: string): boolean {
  return SPOKEN_LANG_PATTERNS.some(({ pattern }) => pattern.test(text));
}

// ── Artifact stripping ────────────────────────────────────────────────

function stripPageArtifacts(text: string): string {
  let cleaned = text;
  // Remove form feeds
  cleaned = cleaned.replace(/\f/g, "\n");
  // Remove ---PAGE--- markers
  cleaned = cleaned.replace(/^---PAGE---$/gm, "");
  // Remove page numbers (standalone digits)
  cleaned = cleaned.replace(/^\s*\d{1,3}\/\d{1,3}\s*$/gm, "");
  cleaned = cleaned.replace(/^\s*\d{1,3}\s*$/gm, "");
  // Remove repeated document symbol headers (e.g., "S/PV.10124", "A/79/PV.21", "E/2024/SR.10", "A/HRC/61/SR.29")
  cleaned = cleaned.replace(/^\s*[SAE]\/(?:[\w.]+\/)*(?:PV|SR)\.\d+\s*$/gm, "");
  // Remove date+title headers repeated on each page (e.g. "23/03/2026 	Maintenance... 	S/PV.10124")
  cleaned = cleaned.replace(/^\s*\d{2}\/\d{2}\/\d{4}\s+.+\s+[SAE]\/(?:[\dC.]+\/)?(?:PV|SR)\.\d+\s*$/gm, "");
  cleaned = cleaned.replace(/^\s*[SAE]\/(?:[\dC.]+\/)?(?:PV|SR)\.\d+\s+.+\s+\d{2}\/\d{2}\/\d{4}\s*$/gm, "");
  // Remove reference codes (e.g., "26-01225 (E)", "26-03920")
  cleaned = cleaned.replace(/^\s*\d{2}-\d{5}\s*(?:\([A-Z]\))?\s*$/gm, "");
  cleaned = cleaned.replace(/^\s*\*\d+\*\s*$/gm, "");
  // Remove page number fractions like "2/35" or "3/26"
  cleaned = cleaned.replace(/^\s*\d{1,2}\/\d{2,3}\s+\d{2}-\d{5}\s*$/gm, "");
  cleaned = cleaned.replace(/^\s*\d{2}-\d{5}\s+\d{1,2}\/\d{2,3}\s*$/gm, "");
  // Remove combined reference+page artifacts (PDF concatenates without spaces):
  // "25-078444/6" = ref "25-07844" + page "4/6", or "3/625-07844" = page "3/6" + ref "25-07844"
  cleaned = cleaned.replace(/^\s*\d{2}-\d{5}\d{1,2}\/\d{1,3}\s*$/gm, "");
  cleaned = cleaned.replace(/^\s*\d{1,2}\/\d{1,3}\d{2}-\d{5}\s*$/gm, "");
  // Remove dot leaders (from attendance list formatting) — both consecutive dots and dot-space patterns
  cleaned = cleaned.replace(/(?:\.\s*){3,}/g, " ");
  // Remove lines that are just dots, dashes, or underscores
  cleaned = cleaned.replace(/^\s*[._-]{3,}\s*$/gm, "");
  // Collapse excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(/[ \t]+/g, " ");
  return cleaned.trim();
}

// ── Header parsing ────────────────────────────────────────────────────

interface ParsedHeader {
  symbol: string;
  body: string;
  session: string;
  meetingNumber: string;
  date: string;
  location: string;
  status: "provisional" | "official";
}

function parseHeader(text: string, lang: string): ParsedHeader {
  const header: ParsedHeader = {
    symbol: "",
    body: "",
    session: "",
    meetingNumber: "",
    date: "",
    location: "",
    status: "provisional",
  };

  // Extract document symbol (works across all languages)
  // Arabic PDFs may have spaces: "S /PV. 10124"
  // Handles S/PV.NNNN, A/NN/PV.NN, A/C.N/NN/PV.NN, A/ES-NN/PV.NN, E/YYYY/SR.NN
  const symbolMatch = text.match(/[SAE]\s*\/\s*(?:[\w.ES-]+\s*\/\s*)*(?:PV|SR)\s*\.\s*\d+/);
  if (symbolMatch) header.symbol = symbolMatch[0].replace(/\s+/g, "");

  // Detect body
  const bodyPatterns: Record<string, Array<{ pattern: RegExp; body: string }>> = {
    en: [
      { pattern: /Security Council/, body: "Security Council" },
      { pattern: /General Assembly/, body: "General Assembly" },
      { pattern: /Economic and Social Council/, body: "Economic and Social Council" },
      { pattern: /Human Rights Council/, body: "Human Rights Council" },
    ],
    fr: [
      { pattern: /Conseil de sécurité/, body: "Security Council" },
      { pattern: /Assemblée générale/, body: "General Assembly" },
      { pattern: /Conseil économique et social/, body: "Economic and Social Council" },
      { pattern: /Conseil des droits de l'homme/, body: "Human Rights Council" },
    ],
    es: [
      { pattern: /Consejo de Seguridad/, body: "Security Council" },
      { pattern: /Asamblea General/, body: "General Assembly" },
      { pattern: /Consejo Económico y Social/, body: "Economic and Social Council" },
      { pattern: /Consejo de Derechos Humanos/, body: "Human Rights Council" },
    ],
    ru: [
      { pattern: /Совет Безопасности/, body: "Security Council" },
      { pattern: /Генеральная Ассамблея/, body: "General Assembly" },
      { pattern: /Экономический и Социальный Совет/, body: "Economic and Social Council" },
      { pattern: /Совет по правам человека/, body: "Human Rights Council" },
    ],
    zh: [
      { pattern: /安全理事会/, body: "Security Council" },
      { pattern: /大会/, body: "General Assembly" },
      { pattern: /经济及社会理事会/, body: "Economic and Social Council" },
      { pattern: /人权理事会/, body: "Human Rights Council" },
    ],
    ar: [
      { pattern: /مجلس الأمن|مجلس األمن/, body: "Security Council" },
      { pattern: /الجمعية العامة/, body: "General Assembly" },
      { pattern: /المجلس الاقتصادي والاجتماعي/, body: "Economic and Social Council" },
      { pattern: /مجلس حقوق الإنسان/, body: "Human Rights Council" },
    ],
  };

  for (const { pattern, body } of bodyPatterns[lang] || bodyPatterns.en) {
    if (pattern.test(text)) {
      header.body = body;
      break;
    }
  }

  // Extract meeting number — matches patterns like "10124th meeting", "10124-е заседание", "第一〇一二四次会议"
  // Also handles ECOSOC shorter meeting numbers (1-3 digits)
  const meetingPatterns = [
    /(\d{1,5})(?:st|nd|rd|th)\s+meeting/i,
    /(\d{1,5})e?\s+séance/i,
    /(\d{1,5})ª?\s+sesión/i,
    /(\d{1,5})-[ея]\s+заседание/i,
    /第([\d〇一二三四五六七八九十百千]+)次会议/,
    /(\d{1,5})\s+الجلسة/,
  ];
  for (const p of meetingPatterns) {
    const m = text.match(p);
    if (m) {
      header.meetingNumber = m[1];
      break;
    }
  }

  // Detect provisional vs official
  const provisionalPatterns = [
    /Provisional/i, /Provisoire/i, // EN/FR/ES: "Provisional" shared
    /Предварительный/i, /临时/, /مؤقت/,
  ];
  header.status = provisionalPatterns.some((p) => p.test(text)) ? "provisional" : "official";

  // Location — always New York for SC/GA
  const locationPatterns = [
    /New York/i, /Nueva York/i, /Нью-Йорк/, /纽约/, /نيويورك/,
  ];
  for (const p of locationPatterns) {
    if (p.test(text)) {
      header.location = "New York";
      break;
    }
  }

  // Session
  const sessionPatterns = [
    // EN: "Eighty-first year" or "Seventy-ninth session"
    /^((?:[A-Z][a-z][\w-]+(?:\s+[\w-]+)?)\s+(?:year|session))\b/m,
    // FR: "Quatre-vingt-unième année"
    /([\p{L}-]+\s+année)/iu,
    // ES: "Octogésimo primer año"
    /([\p{L}]+\s+(?:primer|segundo|tercer)?\s*año)/iu,
    // RU: "Восемьдесят первый год"
    /([\p{L}]+\s+[\p{L}]+\s+год)/iu,
    // ZH: "第八十一年"
    /(第[\p{Script=Han}]+年)/u,
  ];
  for (const p of sessionPatterns) {
    const m = text.match(p);
    if (m) {
      header.session = m[1].trim();
      break;
    }
  }

  return header;
}

// ── Attendance parsing ────────────────────────────────────────────────

interface AttendanceInfo {
  president: { name: string; country: string } | null;
  members: Array<{ country: string; representative: string }>;
}

function parseAttendance(headerText: string, lang: string): AttendanceInfo {
  const result: AttendanceInfo = { president: null, members: [] };

  // President line patterns by language
  // After dot-leader cleanup, dots become single spaces. Match name then parenthesized country.
  const presidentPatterns: Record<string, RegExp> = {
    en: /President:\s+(.+?)\s+\(([^)]+)\)/,
    fr: /Président(?:e|s)?[\s:]+(.+?)\s+\(([^)]+)\)/u,
    es: /Presidencia:\s+(.+?)\s+\(([^)]+)\)/u,
    ru: /Председатель:\s+(.+?)\s+\(([^)]+)\)/u,
    zh: /主席：\s+(.+?)\s+（([^）]+)）/u,
    ar: /الرئيس\s+(.+?)\s*\(([^)]+)\)/u,
  };

  const presPattern = presidentPatterns[lang] || presidentPatterns.en;
  const presMatch = headerText.match(presPattern);
  if (presMatch) {
    result.president = {
      name: presMatch[1].trim().replace(/\s+/g, " "),
      country: presMatch[2].trim(),
    };
  }

  // Member lines — look for country ... representative patterns
  // These appear after "Members:" / "Membres:" / "Miembros:" etc.
  const membersSection = extractMembersSection(headerText, lang);
  if (membersSection) {
    // After dot-leader cleanup, member lines look like:
    // "Bahrain Ms. Nancy Abdulla" — single spaces, split by title pattern
    const lines = membersSection.split("\n");

    // Title patterns for splitting country from representative
    const titlePatterns: Record<string, RegExp> = {
      en: /\s+((?:Mr|Mrs|Ms|Dr|Sir|Dame)\.\s+.+)$/,
      fr: /\s+((?:M|Mme|Mlle)\.\s+.+)$/,
      es: /\s+((?:Sr|Sra|Srta)\.\s+.+)$/,
      ru: /\s+((?:г-н|г-жа)\s+.+)$/u,
      zh: /\s+(.+(?:先生|女士|夫人))$/u,
      ar: /\s+((?:السيد|السيدة)\s+.+)$/u,
    };
    const titlePattern = titlePatterns[lang] || titlePatterns.en;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 3) continue;
      // Skip header-like lines
      if (/^Members|^Membres|^Miembros|^Члены|^成员|^األعضاء/u.test(trimmed)) continue;

      const titleMatch = trimmed.match(titlePattern);
      if (titleMatch) {
        const representative = titleMatch[1].trim();
        const country = trimmed.slice(0, titleMatch.index!).trim();
        if (country.length > 1 && representative.length > 1) {
          result.members.push({ country, representative });
        }
      }
    }
  }

  return result;
}

function extractMembersSection(text: string, lang: string): string | null {
  const memberHeaders: Record<string, RegExp> = {
    en: /Members:/,
    fr: /Membres\s*:/,
    es: /Miembros\s*:/,
    ru: /Члены\s*:/u,
    zh: /成员：/u,
    ar: /األعضاء:|الأعضاء:/u,
  };

  const agendaHeaders: Record<string, RegExp> = {
    en: /Agenda/,
    fr: /Ordre du jour/,
    es: /Orden del día/,
    ru: /Повестка дня/,
    zh: /议程项目/,
    ar: /جدول األعمال|جدول الأعمال/,
  };

  const startPattern = memberHeaders[lang] || memberHeaders.en;
  const endPattern = agendaHeaders[lang] || agendaHeaders.en;

  const startMatch = text.match(startPattern);
  if (!startMatch || startMatch.index === undefined) return null;

  const afterMembers = text.slice(startMatch.index + startMatch[0].length);
  const endMatch = afterMembers.match(endPattern);
  if (endMatch && endMatch.index !== undefined) {
    return afterMembers.slice(0, endMatch.index);
  }
  // Take a reasonable chunk if no agenda found
  return afterMembers.slice(0, 2000);
}

// ── Agenda parsing ────────────────────────────────────────────────────

function parseAgenda(text: string, lang: string): string[] {
  const agendaHeaders: Record<string, RegExp> = {
    en: /Agenda\b/,
    fr: /Ordre du jour/,
    es: /Orden del día/,
    ru: /Повестка дня/u,
    zh: /议程项目/u,
    ar: /جدول األعمال|جدول الأعمال/u,
  };

  // End markers for the agenda section
  const endMarkers = [
    /The meeting was called to order/,
    /La séance est ouverte/,
    /Se (?:abre|declara abierta) la sesión/,
    /Заседание открывается/,
    /开会/,
    /افتتحت الجلسة/,
    // Speaker patterns also end the agenda
    /^The President\s*:/m,
    /^Le Président/m,
    /^El Presidente/m,
    /^Председатель/m,
    /^主席/m,
    /^---PAGE---$/m,
  ];

  const header = agendaHeaders[lang] || agendaHeaders.en;
  const match = text.match(header);
  if (!match || match.index === undefined) return [];

  const afterAgenda = text.slice(match.index + match[0].length);

  // Find end of agenda section
  let endIdx = afterAgenda.length;
  for (const p of endMarkers) {
    const m = afterAgenda.match(p);
    if (m && m.index !== undefined && m.index < endIdx) {
      endIdx = m.index;
    }
  }

  const agendaText = afterAgenda.slice(0, endIdx).trim();
  // Split into items — each non-empty line that isn't a document reference code
  const items: string[] = [];
  const lines = agendaText.split("\n");
  let currentItem = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentItem) {
        items.push(currentItem.trim());
        currentItem = "";
      }
      continue;
    }
    // Skip standalone document references like "(S/2026/8)"
    if (/^\([A-Z]\/[\d/.]+\)$/.test(trimmed)) continue;
    // Append to current item
    currentItem += (currentItem ? " " : "") + trimmed;
  }
  if (currentItem) items.push(currentItem.trim());

  return items.filter((i) => i.length > 2);
}

// ── Speaker turn splitting ────────────────────────────────────────────

interface RawSpeakerMatch {
  index: number;
  matchLength: number;
  speaker: string;
  paren1?: string;
  paren2?: string;
  paragraphNumber?: number;
}

// SR (Summary Record) speaker patterns — numbered paragraphs with third-person narrative
// EN: "1. Mr. Steiner (Under-Secretary-General...)" or "13. Ms. Sandström (Observer for Finland)"
// Groups: (1)=speaker name, (2)=parenthetical (affiliation/role). Paragraph number is non-capturing.
// Name capture uses greedy `+` (not lazy `+?`) and requires a `(` after the name.
// In SR docs, a parenthetical (role or country) is virtually always present.
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

function findSpeakerTurns(text: string, lang: string): RawSpeakerMatch[] {
  if (lang === "ar") return findArabicSpeakerTurns(text);

  // Choose patterns based on document type (PV vs SR)
  const patterns: Record<string, RegExp[]> = {
    en: [EN_SPEAKER],
    fr: [FR_SPEAKER],
    es: [ES_SPEAKER],
    ru: [RU_SPEAKER],
    zh: [ZH_SPEAKER],
  };

  const srPatterns: Record<string, RegExp[]> = {
    en: [EN_SR_SPEAKER],
    fr: [FR_SR_SPEAKER],
    es: [ES_SR_SPEAKER],
    ru: [RU_SR_SPEAKER],
    zh: [ZH_SR_SPEAKER],
  };

  // Try PV patterns first; if no matches found, try SR patterns
  let langPatterns = patterns[lang] || [EN_SPEAKER];
  let matches = findWithPatterns(text, langPatterns);

  // If we found very few matches with PV patterns, try SR patterns
  if (matches.length < 2) {
    const srLangPatterns = srPatterns[lang] || [EN_SR_SPEAKER];
    const srMatches = findWithPatterns(text, srLangPatterns);
    if (srMatches.length > matches.length) {
      // Extract paragraph numbers from SR matches (e.g. "1. Mr. X" → 1)
      for (const m of srMatches) {
        const numMatch = text.slice(m.index).match(/^(\d+)\./);
        if (numMatch) m.paragraphNumber = parseInt(numMatch[1]);
      }
      matches = srMatches;
    }
  }

  return matches;
}

function findWithPatterns(text: string, langPatterns: RegExp[]): RawSpeakerMatch[] {
  const matches: RawSpeakerMatch[] = [];
  let remaining = text;
  let offset = 0;

  while (remaining.length > 0) {
    let earliest: RawSpeakerMatch | null = null;

    for (const pattern of langPatterns) {
      // Reset the regex
      const re = new RegExp(pattern.source, pattern.flags);
      const m = re.exec(remaining);
      if (m && m.index !== undefined) {
        if (!earliest || m.index < earliest.index) {
          earliest = {
            index: offset + m.index,
            matchLength: m[0].length,
            speaker: m[1].trim(),
            paren1: m[2]?.trim(),
            paren2: m[3]?.trim(),
          };
        }
      }
    }

    if (!earliest) break;

    matches.push(earliest);
    const advanceTo = earliest.index - offset + earliest.matchLength;
    remaining = remaining.slice(advanceTo);
    offset = earliest.index + earliest.matchLength;
  }

  return matches;
}

function findArabicSpeakerTurns(text: string): RawSpeakerMatch[] {
  const matches: RawSpeakerMatch[] = [];

  // Arabic PDF extraction produces speaker ID lines like:
  // 1. No country: "تكلم باإلنكليزية( الرئيس" or "تكلمت باإلنكليزية( السيدة ديكارلو"
  // 2. With country: "تكلمت باإلنكليزية (التفيا) ( السيدة بافلوتا - ديسالنديس"
  // The "):  " colon appears on the preceding line.
  //
  // Strategy: scan line by line for lines starting with "تكلم".
  // The turn boundary is actually the "): " that precedes the speaker ID line.

  const lines = text.split("\n");
  let charOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineStart = charOffset;
    charOffset += lines[i].length + 1; // +1 for \n

    // Match speaker ID lines
    // Pattern 1: with country — "تكلم[ت]? با[lang] ([country]) ( [speaker]"
    // Note: "با" not "بال" because "باإلنكليزية" has hamza: باإل not بال
    const withCountry = line.match(
      /^(تكلم[ت]?\s+با[\p{L}]+)\s+\(([^)]+)\)\s*\(\s*(الرئيس(?:ة)?|(?:السيد|السيدة)\s+[\p{L}\s''-]+)/u,
    );
    if (withCountry) {
      // Find the "): " on the preceding line to get the actual turn start
      const turnStart = findArabicTurnStart(lines, i, lineStart, text);
      matches.push({
        index: turnStart.index,
        matchLength: turnStart.matchLength,
        speaker: withCountry[3].trim(),
        paren1: withCountry[2].trim(), // country
        paren2: withCountry[1].trim(), // language annotation
      });
      continue;
    }

    // Pattern 2: no country — "تكلم[ت]? با[lang]( [speaker]"
    const noCountry = line.match(
      /^(تكلم[ت]?\s+با[\p{L}]+)\(\s*(الرئيس(?:ة)?|(?:السيد|السيدة)\s+[\p{L}\s''-]+)/u,
    );
    if (noCountry) {
      const turnStart = findArabicTurnStart(lines, i, lineStart, text);
      matches.push({
        index: turnStart.index,
        matchLength: turnStart.matchLength,
        speaker: noCountry[2].trim(),
        paren2: noCountry[1].trim(), // language annotation (no country)
      });
      continue;
    }
  }

  return matches;
}

function findArabicTurnStart(
  lines: string[],
  speakerLineIdx: number,
  speakerLineStart: number,
  fullText: string,
): { index: number; matchLength: number } {
  // The "): " colon appears on the preceding line. Find it.
  // Look at previous line for "): " pattern
  if (speakerLineIdx > 0) {
    const prevLine = lines[speakerLineIdx - 1];
    const colonIdx = prevLine.indexOf("):");
    if (colonIdx !== -1) {
      // The turn starts at "): " on the previous line
      // Calculate the absolute position
      let prevLineStart = 0;
      for (let j = 0; j < speakerLineIdx - 1; j++) {
        prevLineStart += lines[j].length + 1;
      }
      const absColonIdx = prevLineStart + colonIdx;
      // The match encompasses from "): " to end of speaker ID line
      const endOfSpeakerLine = speakerLineStart + lines[speakerLineIdx].length;
      return {
        index: absColonIdx,
        matchLength: endOfSpeakerLine - absColonIdx,
      };
    }
  }

  // Fallback: use the speaker line itself as the turn boundary
  return {
    index: speakerLineStart,
    matchLength: lines[speakerLineIdx].length,
  };
}

function interpretSpeakerMatch(
  match: RawSpeakerMatch,
  lang: string,
): { speaker: string; affiliation?: string; spokenLanguage?: string } {
  const { speaker, paren1, paren2 } = match;
  let affiliation: string | undefined;
  let spokenLanguage: string | undefined;

  if (lang === "ar") {
    // For Arabic: paren1 = country, paren2 = language annotation text
    if (paren1) affiliation = paren1;
    if (paren2) spokenLanguage = extractSpokenLanguage(paren2);
    return { speaker, affiliation, spokenLanguage };
  }

  // For other languages: paren1 could be affiliation or spoken-language annotation
  // If there are two parentheticals, first is usually affiliation, second is spoken language
  if (paren1 && paren2) {
    if (isSpokenLanguageAnnotation(paren1)) {
      spokenLanguage = extractSpokenLanguage(paren1);
      affiliation = paren2;
    } else {
      affiliation = paren1;
      spokenLanguage = extractSpokenLanguage(paren2);
    }
  } else if (paren1) {
    if (isSpokenLanguageAnnotation(paren1)) {
      spokenLanguage = extractSpokenLanguage(paren1);
    } else {
      affiliation = paren1;
    }
  }

  // Post-process: extract country/entity from role-based affiliations
  // e.g. "Representative of the European Union, in its capacity as observer" → "European Union"
  //      "Observer for Finland" → "Finland"
  //      "Under-Secretary-General for Management" → keep as-is (no country)
  if (affiliation) {
    affiliation = simplifyAffiliation(affiliation);
  }

  return { speaker, affiliation, spokenLanguage };
}

/**
 * Extract "speaking [also] on behalf of X" preamble from the first paragraph of a turn.
 * Strips it from the paragraph text and returns the preamble string, or undefined.
 * Also handles "introducing the report of..." and similar SR preambles.
 */
function extractOnBehalfOf(paragraphs: string[]): string | undefined {
  if (paragraphs.length === 0) return undefined;

  // Match patterns like:
  //   ", speaking on behalf of the Group of 77 and China, said that..."
  //   ", speaking also on behalf of Liechtenstein, said that..."
  //   ", introducing the report of the Secretary-General on X, said that..."
  // The preamble is between the leading comma and a verb like "said/asked/noted/etc."
  const first = paragraphs[0];

  // SR preamble: starts with comma, ends before a reporting verb.
  // SR documents use PRESENT tense (not past): "dit que", "dice que", "говорит"
  const verbs = [
    // EN (past tense — used in EN SRs)
    "said", "asked", "expressed", "noted", "recalled", "stressed", "urged",
    "proposed", "supported", "endorsed", "observed", "welcomed", "pointed",
    "drew", "took", "made", "called", "introduced", "informing",
    // FR (present tense — "déclare que", "dit que", "note que", ...)
    "déclare", "dit", "note", "rappelle", "souligne", "demande",
    "exprime", "propose", "appuie", "accueille", "observe",
    "présente", "indique", "fait",
    // ES (present tense — "dice que", "declara que", "señala que", ...)
    "dice", "declara", "señala", "recuerda", "subraya", "pide", "expresa",
    "propone", "apoya", "acoge", "observa", "presenta", "indica", "hace",
    // RU (present tense — "говорит,", "заявляет,", "отмечает,", ...)
    "говорит", "заявляет", "отмечает", "подчеркивает", "напоминает",
    "предлагает", "выражает", "указывает", "приветствует", "призывает",
  ];
  const verbPattern = verbs.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const preambleMatch = first.match(
    new RegExp(`^,\\s*(.+?),?\\s+(?=${verbPattern})\\s*`, "i"),
  );
  if (preambleMatch) {
    // Strip the preamble from the paragraph, keep the rest starting with the verb
    const afterPreamble = first.slice(preambleMatch[0].length);
    // Capitalize the first letter of the remaining text
    paragraphs[0] = afterPreamble.charAt(0).toUpperCase() + afterPreamble.slice(1);
    return preambleMatch[1].replace(/,\s*$/, "").trim();
  }

  // ZH: "代表X发言。他/她说，..." or "同时代表X发言。他/她说，..."
  // No leading comma; preamble is "代表...发言", verb is "说" after 他/她
  const zhMatch = first.match(
    /^(?:同时)?(代表.+?发言)。[他她](?:说|表示|指出|强调)，\s*/,
  );
  if (zhMatch) {
    const afterPreamble = first.slice(zhMatch[0].length);
    paragraphs[0] = afterPreamble;
    return zhMatch[1].trim();
  }

  return undefined;
}

function simplifyAffiliation(aff: string): string {
  // Normalize whitespace (PDF extraction can introduce newlines within parentheticals)
  const norm = aff.replace(/\s+/g, " ").trim();

  // "Representative of X" / "Observer for X" / "Permanent Representative of X"
  const repMatch = norm.match(
    /(?:Permanent\s+)?(?:Representative|Observer|Delegate|Rapporteur)\s+(?:of|for)\s+(?:the\s+)?(.+?)(?:\s*,\s*in\s+its\s+capacity.*)?$/i,
  );
  if (repMatch) return repMatch[1].trim();

  // "représentant(e) de X" / "observateur(trice) de X" (FR)
  const frMatch = norm.match(
    /(?:représentant|observat(?:eur|rice))\s+(?:de\s+(?:la\s+|l'|le\s+)?|du\s+)(.+?)(?:\s*,.*)?$/i,
  );
  if (frMatch) return frMatch[1].trim();

  // "Representante de X" / "Observador(a) de X" (ES)
  const esMatch = norm.match(
    /(?:Representante|Observador|Observadora)\s+(?:de\s+(?:la\s+|el\s+)?|del\s+)(.+?)(?:\s*,.*)?$/i,
  );
  if (esMatch) return esMatch[1].trim();

  return norm;
}

// ── Procedural paragraph detection ───────────────────────────────────
// These patterns identify paragraphs that are procedural/italic annotations
// within a speech turn (stage directions, procedural notes).

const PROCEDURAL_PARAGRAPH_PATTERNS = [
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

function isProceduralParagraph(text: string): boolean {
  return PROCEDURAL_PARAGRAPH_PATTERNS.some(p => p.test(text.trim()));
}

// ── Turn-level procedural detection ──────────────────────────────────

const PROCEDURAL_PATTERNS = [
  // EN — only strong procedural indicators
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

function isProcedural(text: string, speaker: string): boolean {
  // Only mark as procedural if it's a short turn from the President/Chair that contains
  // strong procedural language (votes, agenda adoption, meeting open/close)
  const isChair = /President|Chairperson|Acting President|Président|Presidente|Председатель|主席|الرئيس/i.test(speaker);
  if (!isChair) return false;
  return PROCEDURAL_PATTERNS.some((p) => p.test(text));
}

// ── Find start of speech content ──────────────────────────────────────

function findSpeechStart(text: string, lang: string): number {
  // Find where the actual speech content begins (after preamble/header)
  // This is the first speaker turn
  const meetingOpenPatterns = [
    /The meeting was called to order/,
    /La séance est ouverte/,
    /Se (?:abre|declara abierta) la sesión/,
    /Заседание открывается/,
    /开会/,
    /افتتحت الجلسة/,
  ];

  // First try to find meeting opening
  for (const p of meetingOpenPatterns) {
    const m = text.match(p);
    if (m && m.index !== undefined) {
      return m.index;
    }
  }

  // Fallback: find first speaker turn
  return 0;
}

// ── Main parser ───────────────────────────────────────────────────────

export async function parsePVDocument(
  pdfBuffer: Buffer,
  langHint?: string,
): Promise<PVDocument> {
  // Disable worker to avoid issues in Next.js server environment
  pdfjs.GlobalWorkerOptions.workerSrc = "";
  const data = new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);
  const doc = await pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const parts: string[] = [];
    for (const item of content.items) {
      if ("str" in item) {
        parts.push(item.str);
        if (item.hasEOL) parts.push("\n");
      }
    }
    pageTexts.push(parts.join(""));
  }
  const rawText = pageTexts.join("\n");

  const lang = langHint || detectLanguage(rawText);
  const cleanedText = stripPageArtifacts(rawText);

  // Parse header from the first ~3000 characters, but also search full text for symbol
  const headerText = cleanedText.slice(0, 3000);
  const header = parseHeader(headerText, lang);

  // If symbol wasn't found in the header (e.g., resumed/continuation sessions),
  // search the full text for document symbol in page artifacts
  if (!header.symbol) {
    const fullSymbolMatch = cleanedText.match(/[SAE]\s*\/\s*(?:[\w.ES-]+\s*\/\s*)*(?:PV|SR)\s*\.\s*\d+/);
    if (fullSymbolMatch) header.symbol = fullSymbolMatch[0].replace(/\s+/g, "");
  }

  // Always infer body from symbol — this is authoritative and avoids false matches
  // from body names mentioned in speech content (e.g., "Security Council" mentioned
  // in a GA emergency session about Palestine)
  if (header.symbol) {
    if (header.symbol.startsWith("S/")) header.body = "Security Council";
    else if (header.symbol.startsWith("A/HRC/")) header.body = "Human Rights Council";
    else if (header.symbol.startsWith("A/")) header.body = "General Assembly";
    else if (header.symbol.startsWith("E/")) header.body = "Economic and Social Council";
  }

  // Parse attendance
  const attendance = parseAttendance(headerText, lang);

  // Parse agenda
  const agenda = parseAgenda(cleanedText, lang);

  // Find where speech content begins
  const speechStart = findSpeechStart(cleanedText, lang);
  const speechText = cleanedText.slice(speechStart);

  // Find speaker turns
  const speakerMatches = findSpeakerTurns(speechText, lang);

  // Build turns
  const turns: PVTurn[] = [];
  for (let i = 0; i < speakerMatches.length; i++) {
    const match = speakerMatches[i];
    const nextMatch = speakerMatches[i + 1];

    // Indices are relative to speechText
    const textStart = match.index + match.matchLength;
    const textEnd = nextMatch ? nextMatch.index : speechText.length;
    const turnText = speechText.slice(textStart, textEnd).trim();

    const { speaker, affiliation, spokenLanguage } = interpretSpeakerMatch(match, lang);

    // Split into paragraphs, preserving SR numbered paragraph structure.
    // For SR documents, split on newlines before numbered paragraphs (e.g. "25. The...")
    // BEFORE collapsing whitespace, so we use the PDF's original line breaks.
    const splitPattern = match.paragraphNumber
      ? /\n\s*\n|\n(?=\d{1,3}\.\s+\S)/  // double newline OR newline before "NN. X"
      : /\n\s*\n/;                         // PV: double newline only
    const rawParas = turnText
      .split(splitPattern)
      .map((p) => p
        .replace(/\s+/g, " ")
        // Rejoin words split across PDF line breaks:
        // "гово- рит" → "говорит" (lowercase = line-break hyphen, remove it)
        // "Юго- Восточной" → "Юго-Восточной" (uppercase = compound word, keep hyphen)
        .replace(/(\p{L})- (\p{Ll})/gu, "$1$2")
        .replace(/(\p{L})- (\p{Lu})/gu, "$1-$2")
        .trim())
      .filter((p) => p.length > 0);

    // For SR documents, merge orphan fragments (paragraphs that don't start with a number)
    // back into the previous paragraph. These are created by page break artifacts.
    const paragraphs: string[] = [];
    if (match.paragraphNumber) {
      for (const p of rawParas) {
        if (paragraphs.length > 0 && !/^\d{1,3}\.\s/.test(p)) {
          paragraphs[paragraphs.length - 1] += " " + p;
        } else {
          paragraphs.push(p);
        }
      }
    } else {
      paragraphs.push(...rawParas);
    }

    // Extract "speaking [also] on behalf of X" from first paragraph
    const onBehalfOf = extractOnBehalfOf(paragraphs);

    // Capitalize the first letter of the first paragraph (SR turns often start with "said")
    if (paragraphs.length > 0 && /^[a-z]/.test(paragraphs[0])) {
      paragraphs[0] = paragraphs[0].charAt(0).toUpperCase() + paragraphs[0].slice(1);
    }

    const type = isProcedural(turnText, speaker) ? "procedural" : "speech";

    // Detect procedural paragraphs within speech turns
    const proceduralParagraphs: number[] = [];
    for (let j = 0; j < paragraphs.length; j++) {
      if (isProceduralParagraph(paragraphs[j])) {
        proceduralParagraphs.push(j);
      }
    }

    turns.push({
      speaker,
      affiliation,
      spokenLanguage,
      ...(onBehalfOf ? { onBehalfOf } : {}),
      ...(match.paragraphNumber ? { paragraphNumber: match.paragraphNumber } : {}),
      paragraphs,
      type,
      ...(proceduralParagraphs.length > 0 ? { proceduralParagraphs } : {}),
    });
  }

  return {
    symbol: header.symbol,
    body: header.body,
    session: header.session,
    meetingNumber: header.meetingNumber,
    date: header.date,
    location: header.location,
    language: lang,
    status: header.status,
    president: attendance.president,
    members: attendance.members,
    agendaItems: agenda,
    turns,
    fullText: cleanedText,
  };
}
