/**
 * Utilities for matching UN videos to their official meeting records.
 *
 * PV (Procès-Verbal) = verbatim records; SR (Summary Records) = third-person summaries.
 * Available at documents.un.org. The document symbol can be derived from meeting title and category.
 *
 * See docs/official-transcripts.md for which organs use PV vs SR.
 */

/**
 * Derive an official record symbol from a video's title and category.
 *
 * Returns PV symbols for: SC, GA plenary, GA 1st Committee, GA emergency special sessions
 * Returns SR symbols for: GA committees 2-6, ECOSOC, Human Rights Council
 */
export function parseMeetingSymbol(
  title: string,
  category: string,
  videoDate?: string,
): string | null {
  // Security Council: "9748th meeting" → S/PV.9748
  const scMatch = title.match(/(\d{4,5})(?:st|nd|rd|th)\s+meeting/);
  if (scMatch && /security council/i.test(category)) {
    return `S/PV.${scMatch[1]}`;
  }

  // GA Committees: "First Committee, 7th meeting - General Assembly, 79th session"
  // "Third Committee, 5th meeting - General Assembly, 79th session"
  // → A/C.1/79/PV.7 (1st = verbatim), A/C.3/79/SR.5 (2nd-6th = summary)
  const committeeNames: Record<string, string> = {
    first: "1", second: "2", third: "3", fourth: "4", fifth: "5", sixth: "6",
  };
  const committeeM = title.match(
    /(First|Second|Third|Fourth|Fifth|Sixth)\s+Committee.*?(\d+)(?:st|nd|rd|th)\s+(?:plenary\s+)?meeting.*?(\d+)(?:st|nd|rd|th)\s+session/i,
  );
  if (committeeM && /general assembly/i.test(category)) {
    const num = committeeNames[committeeM[1].toLowerCase()];
    if (num) {
      // 1st Committee uses PV (verbatim), committees 2-6 use SR (summary records)
      const recordType = num === "1" ? "PV" : "SR";
      return `A/C.${num}/${committeeM[3]}/${recordType}.${committeeM[2]}`;
    }
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

  // GA Emergency Special Session: "23rd plenary meeting - Emergency special session" → A/ES-11/PV.23
  // Title patterns vary; the ES-NN number may be in the title or category
  const esMatch = title.match(/(\d+)(?:st|nd|rd|th)\s+plenary\s+meeting/i);
  const esSession = (title + " " + category).match(/(?:ES|emergency\s+special).*?(\d+)/i);
  if (esMatch && esSession && /emergency/i.test(title + " " + category)) {
    return `A/ES-${esSession[1]}/PV.${esMatch[1]}`;
  }

  // Human Rights Council: "29th Meeting - 61st Session of Human Rights Council" → A/HRC/61/SR.29
  // Also: "1st Meeting - 57th Regular Session of Human Rights Council"
  // Must match "Session ... Human Rights Council" in the title to avoid false positives
  // from subsidiary bodies (Working Groups, Permanent Forum, etc.)
  const hrcM = title.match(
    /(\d+)(?:st|nd|rd|th)\s+Meeting\s*[-–,]\s*(\d+)(?:st|nd|rd|th)\s+(?:Regular\s+)?(?:Special\s+)?Session\s+(?:of\s+)?(?:the\s+)?Human\s+Rights\s+Council/i,
  );
  if (hrcM) {
    return `A/HRC/${hrcM[2]}/SR.${hrcM[1]}`;
  }

  // ECOSOC: "10th meeting - Economic and Social Council" → E/2024/SR.10
  // Also: "Economic and Social Council, 14th meeting, 2026 session"
  // Many subsidiary bodies (UNICEF board, UNDP board, etc.) append
  // " - Economic and Social Council" as a trailing suffix. To exclude these,
  // we require either:
  //   a) "Economic and Social Council" followed by meeting number (within ~20 chars)
  //   b) meeting number followed by " - Economic and Social Council" directly
  const ecosocM = title.match(
    /(?:economic and social council|ecosoc)[,\s]{1,20}(\d+)(?:st|nd|rd|th)\s+meeting|(\d+)(?:st|nd|rd|th)\s+meeting\s*-\s*(?:economic and social council|ecosoc)/i,
  );
  if (ecosocM) {
    const meetingNum = ecosocM[1] || ecosocM[2];
    const year = videoDate ? new Date(videoDate).getFullYear() : new Date().getFullYear();
    return `E/${year}/SR.${meetingNum}`;
  }

  return null;
}

/** Build a URL to access the PV document PDF from documents.un.org. */
export function getPVDocumentUrl(symbol: string): string {
  return `https://documents.un.org/api/symbol/access?s=${encodeURIComponent(symbol)}`;
}

/**
 * Check whether a PV document actually exists at documents.un.org.
 *
 * Fetches the PDF and validates that it contains the expected symbol string,
 * since the API occasionally returns a nearby document instead.
 */
/**
 * Fetch the raw PDF buffer for a PV document from documents.un.org.
 * Returns null if the document doesn't exist or isn't a valid PDF.
 */
export async function fetchPVDocument(
  symbol: string,
  lang: string = "en",
): Promise<Buffer | null> {
  try {
    const url = `https://documents.un.org/api/symbol/access?s=${encodeURIComponent(symbol)}&l=${encodeURIComponent(lang)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("pdf")) return null;

    const buffer = Buffer.from(await res.arrayBuffer());

    // Basic validation: must be a real PDF (starts with %PDF)
    if (buffer.length < 100 || !buffer.subarray(0, 5).toString().startsWith("%PDF")) return null;

    // Validate: check if the symbol appears in the PDF binary (works for most PDFs
    // where text is stored as ASCII/latin1 literals in the stream). This guards against
    // documents.un.org returning a nearby/wrong document.
    // The symbol without spaces (e.g. "S/PV.10100") should appear somewhere in the raw bytes.
    // For PDFs with compressed text streams, this check may fail — so we also try
    // with dots/slashes stripped as a fallback pattern.
    const rawText = buffer.toString("latin1");
    const symbolNorm = symbol.replace(/\s+/g, "");
    if (!rawText.includes(symbolNorm)) {
      // Try without the slash (some PDFs encode "S/PV" differently)
      const symbolDigits = symbol.match(/\d+$/)?.[0];
      if (!symbolDigits || !rawText.includes(symbolDigits)) {
        return null;
      }
    }

    return buffer;
  } catch {
    return null;
  }
}

export async function pvDocumentExists(
  symbol: string,
  lang: string = "en",
): Promise<boolean> {
  try {
    const url = `https://documents.un.org/api/symbol/access?s=${encodeURIComponent(symbol)}&l=${encodeURIComponent(lang)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return false;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("pdf")) return false;

    // Basic validation: must be a real PDF
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.length >= 100 && buffer.subarray(0, 5).toString().startsWith("%PDF");
  } catch {
    return false;
  }
}
