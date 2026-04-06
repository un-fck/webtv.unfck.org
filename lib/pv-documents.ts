/**
 * Utilities for matching UN videos to their Procès-Verbal (PV) documents.
 *
 * PV documents are the official verbatim records of UN meetings, available
 * at documents.un.org. The document symbol (e.g. S/PV.9748) can be derived
 * from the meeting title and category.
 */

/**
 * Derive a PV document symbol from a video's title and category.
 *
 * Patterns:
 *   Security Council: "9748th meeting" + "Security Council" → S/PV.9748
 *   First Committee:  "First Committee, 7th plenary meeting … 79th session" + "General Assembly" → A/C.1/79/PV.7
 *   GA plenary:       "21st plenary meeting, 79th session" + "General Assembly" → A/79/PV.21
 */
export function parseMeetingSymbol(
  title: string,
  category: string,
): string | null {
  // Security Council: "9748th meeting" → S/PV.9748
  const scMatch = title.match(/(\d{4,5})(?:st|nd|rd|th)\s+meeting/);
  if (scMatch && /security council/i.test(category)) {
    return `S/PV.${scMatch[1]}`;
  }

  // First Committee: "First Committee, 7th plenary meeting - General Assembly, 79th session"
  // → A/C.1/79/PV.7
  const firstCommM = title.match(
    /First Committee.*?(\d+)(?:st|nd|rd|th)\s+(?:plenary\s+)?meeting.*?(\d+)(?:st|nd|rd|th)\s+session/i,
  );
  if (firstCommM && /general assembly/i.test(category)) {
    return `A/C.1/${firstCommM[2]}/PV.${firstCommM[1]}`;
  }

  // General Assembly plenary: "21st plenary meeting, 79th session" → A/79/PV.21
  const sessionM = title.match(/(\d+)(?:st|nd|rd|th)\s+session/);
  const plenaryM = title.match(/(\d+)(?:st|nd|rd|th)\s+plenary\s+meeting/);
  if (
    sessionM &&
    plenaryM &&
    /general assembly/i.test(category) &&
    !/committee/i.test(title)
  ) {
    return `A/${sessionM[1]}/PV.${plenaryM[1]}`;
  }

  return null;
}

/** Build a URL to access the PV document PDF from documents.un.org. */
export function getPVDocumentUrl(symbol: string, lang: string = "en"): string {
  return `https://documents.un.org/api/symbol/access?s=${encodeURIComponent(symbol)}&l=${encodeURIComponent(lang)}`;
}
