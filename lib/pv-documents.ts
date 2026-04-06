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

/**
 * Check whether a PV document actually exists at documents.un.org.
 *
 * Fetches the PDF and validates that it contains the expected symbol string,
 * since the API occasionally returns a nearby document instead.
 */
export async function pvDocumentExists(
  symbol: string,
  lang: string = "en",
): Promise<boolean> {
  try {
    const url = getPVDocumentUrl(symbol, lang);
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return false;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("pdf")) return false;

    // Validate: the PDF must contain the expected symbol to guard against
    // the API returning a nearby/wrong document.
    const buffer = Buffer.from(await res.arrayBuffer());
    const pdfText = buffer.toString("latin1");
    return pdfText.includes(symbol);
  } catch {
    return false;
  }
}
