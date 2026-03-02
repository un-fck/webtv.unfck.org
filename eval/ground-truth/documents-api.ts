import { DOC_LANG_CODES } from '../config';

/** Fetch a UN verbatim record PDF as a Buffer, validating it matches the expected symbol */
export async function fetchPVDocument(symbol: string, language = 'en'): Promise<Buffer> {
  const langCode = DOC_LANG_CODES[language] || language;
  const url = `https://documents.un.org/api/symbol/access?s=${encodeURIComponent(symbol)}&l=${langCode}`;

  console.log(`  Fetching PV: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch PV document ${symbol} (${language}): ${res.status}`);

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('pdf')) {
    throw new Error(`Expected PDF but got ${contentType} for ${symbol} (${language})`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  // Validate: check that the PDF bytes contain the expected symbol.
  // The symbol (e.g. "S/PV.10100") appears in the PDF text of the correct document.
  // The documents API occasionally returns a nearby document instead of the requested one.
  const pdfText = buffer.toString('latin1'); // PDF is binary but symbol is ASCII
  if (!pdfText.includes(symbol)) {
    throw new Error(`PDF returned for ${symbol} (${language}) does not contain the expected symbol — wrong document returned by API`);
  }

  return buffer;
}

/** Check if a PV document exists for a given symbol and language */
export async function pvDocumentExists(symbol: string, language = 'en'): Promise<boolean> {
  try {
    const buffer = await fetchPVDocument(symbol, language);
    return buffer.length > 0;
  } catch {
    return false;
  }
}
