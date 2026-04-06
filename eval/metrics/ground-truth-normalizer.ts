/**
 * Normalize UN PV ground truth text to remove non-spoken content.
 *
 * PV documents contain editorial elements that were never spoken aloud:
 * - Speaker labels: "The President:", "Mr. Bendjama (Algeria):"
 * - Page headers/footers: "30/01/2026 The situation in Cyprus S/PV.10100", "3/3 26-01225"
 * - Vote roll call lists: "In favour: Bahrain, China, ..."
 * - Document boilerplate (Arabic, Russian, Chinese front matter)
 * - Procedural stage directions: "A vote was taken by show of hands."
 *
 * This normalizer strips these so WER/CER only measures substantive transcription accuracy.
 */

/** Speaker label patterns by language */
const SPEAKER_LABEL_PATTERNS: Record<string, RegExp[]> = {
  en: [
    // "The President:", "The President (spoke in Arabic):"
    /^The President\b[^:]*:/gm,
    // "Mr. Bendjama:", "Mr. Bendjama (Algeria):", "Ms. Foo (United States of America):"
    /^(?:Mr|Ms|Mrs|Sir|Dame|Lord)\b\.?[^:]*:/gm,
  ],
  fr: [
    /^(?:Le Président|La Présidente)\b[^:]*:/gm,
    /^(?:M|Mme)\b\.?[^:]*:/gm,
  ],
  es: [
    /^(?:El Presidente|La Presidenta)\b[^:]*:/gm,
    /^(?:El Sr|La Sra)\b\.?[^:]*:/gm,
  ],
  ar: [
    // Arabic speaker labels: الرئيس (President), السيد (Mr.), السيدة (Mrs.)
    /^(?:الرئيس|الرئيسة)[^:]*:/gm,
    /^(?:السيد|السيدة)[^:]*:/gm,
  ],
  ru: [
    /^Председатель\b[^:]*:/gm,
    /^(?:Г-н|Г-жа)\b[^:]*:/gm,
  ],
  zh: [
    /^主席[^：:]*[：:]/gm,
    /^(?:先生|女士|夫人)[^：:]*[：:]/gm,
  ],
};

/** Page header/footer: "30/01/2026 The situation in Cyprus S/PV.10100" or "3/3 26-01225" */
const PAGE_HEADER_PATTERNS = [
  // Date + title + S/PV or A/PV reference: "30/01/2026 ... S/PV.10100"
  /^\d{1,2}\/\d{2}\/\d{4}\s+.+\s+[SA]\/PV\.\d+$/gm,
  // Page number + document ID: "3/3 26-01225" or "14/22 24-01072"
  /^\d{1,3}\/\d{1,3}\s+\d{2}-\d{4,6}$/gm,
];

/** Vote roll call blocks (English) — from "A vote was taken" through the country lists */
const VOTE_BLOCK_PATTERNS: Record<string, RegExp[]> = {
  en: [
    // "A vote was taken by show of hands." / "A recorded vote was taken."
    /^A (?:recorded )?vote was taken[^.]*\.$/gm,
    // Roll call blocks: "In favour:\n  countries...\nAgainst:\n  ...\nAbstaining:\n  ..."
    /^In favour:\n(?:[\s\S]*?)(?=^(?:The President|Mr\.|Ms\.|Mrs\.)|\n\n)/gm,
  ],
  fr: [
    /^Il (?:est )?procédé au vote[^.]*\.$/gm,
    /^Votent pour ?\n(?:[\s\S]*?)(?=^(?:Le Président|La Présidente|M\.|Mme)|\n\n)/gm,
  ],
  es: [
    /^Se procede a (?:la )?votación[^.]*\.$/gm,
    /^Votos a favor:\n(?:[\s\S]*?)(?=^(?:El Presidente|La Presidenta|El Sr\.|La Sra\.)|\n\n)/gm,
  ],
  ar: [],
  ru: [
    /^Проводится голосование[^.]*\.$/gm,
  ],
  zh: [],
};

/** Document boilerplate patterns (front matter from PDF extraction) */
const BOILERPLATE_PATTERNS = [
  // Arabic boilerplate
  /^باللغات الملقاة[\s\S]*?verbatimrecords@un\.org\)/m,
  // Russian boilerplate
  /^Документ расширенного[\s\S]*?S\/PV\.\d+/m,
  // Chinese boilerplate
  /^无障碍文件[\s\S]*?重发。/m,
  // English boilerplate (rare but possible)
  /^This record contains[\s\S]*?verbatimrecords@un\.org\)/m,
  // French boilerplate
  /^Le présent compte rendu[\s\S]*?verbatimrecords@un\.org\)/m,
  // Spanish boilerplate
  /^La presente acta[\s\S]*?verbatimrecords@un\.org\)/m,
  // "Accessible document" / "Please recycle" lines
  /^(?:Accessible document|Please recycle|Documento accesible|Prière de recycler|无障碍文件 请回收).*$/gm,
  // UN document references on their own line: "S/PV.10069" or "Организация Объединенных Наций S/PV.10069"
  /^.*(?:United Nations|Nations Unies|Naciones Unidas|Организация Объединенных Наций)\s+[SA]\/PV\.\d+.*$/gm,
];

/** Meeting record table of contents / participant lists */
const TOC_PATTERNS = [
  // Dotted leader lines in participant lists: "Председатель . . . . . . . г-н Жбогар"
  /^.*\. \. \. .*$/gm,
  // "Agenda\n" or "Order du jour\n" section headers
  /^(?:Agenda|Ordre du jour|Orden del día|جدول الأعمال|Повестка дня|议程)$/gm,
];

/**
 * Remove non-spoken content from PV ground truth text.
 * Applied to reference text before WER/CER computation.
 */
export function normalizeGroundTruth(text: string, language = "en"): string {
  let result = text;

  // Remove document boilerplate
  for (const pattern of BOILERPLATE_PATTERNS) {
    result = result.replace(pattern, "");
  }

  // Remove TOC / participant lists
  for (const pattern of TOC_PATTERNS) {
    result = result.replace(pattern, "");
  }

  // Remove page headers/footers
  for (const pattern of PAGE_HEADER_PATTERNS) {
    result = result.replace(pattern, "");
  }

  // Remove speaker labels
  const speakerPatterns =
    SPEAKER_LABEL_PATTERNS[language] || SPEAKER_LABEL_PATTERNS.en;
  for (const pattern of speakerPatterns) {
    result = result.replace(pattern, "");
  }

  // Remove vote roll call blocks
  const votePatterns = VOTE_BLOCK_PATTERNS[language] || [];
  for (const pattern of votePatterns) {
    result = result.replace(pattern, "");
  }

  // Collapse whitespace
  result = result.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim();

  return result;
}
