// Fetches and parses a UN PV or SR document PDF to structured JSON.
import { NextRequest, NextResponse } from "next/server";
import { getPVContent, savePVContent } from "@/lib/db";
import { fetchPVDocument, isValidPVSymbol } from "@/lib/pv-documents";
import { parsePVDocument } from "@/lib/pv-parser";
import { apiError } from "@/lib/api-error";
import { enforceIpLimit, enforceGlobalDailyLimit } from "@/lib/rate-limit";
import { routing } from "@/i18n/routing";

export const maxDuration = 25;

// Only the six UN languages are valid PV document languages. Validating guards
// the pv_contents cache table (composite PK (symbol, lang)) against an
// arbitrary `lang` inflating it with junk rows.
const VALID_LANGS = new Set<string>(routing.locales);

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const lang = request.nextUrl.searchParams.get("lang") || "en";

  if (!symbol) {
    return apiError(
      400,
      "missing_parameter",
      "Missing required parameter: symbol",
    );
  }
  if (!VALID_LANGS.has(lang)) {
    return apiError(400, "invalid_parameter", "Unsupported language");
  }
  // Same reasoning as VALID_LANGS above, for the other half of the
  // (symbol, lang) composite key — and it keeps unbounded input out of the
  // cache read below, which runs before the rate limiter.
  if (!isValidPVSymbol(symbol)) {
    return apiError(400, "invalid_parameter", "Malformed document symbol");
  }

  // PV documents are public UN reference data. Cached reads are cheap, so serve
  // them unmetered.
  const cached = await getPVContent(symbol, lang);
  if (cached) {
    return NextResponse.json(cached.content);
  }

  // Cache miss = the expensive path (outbound PDF fetch + pdfjs parse). Gate it
  // with a per-IP hourly cap and a global daily ceiling (the spoof-proof
  // backstop) so anonymous callers can't drive unbounded fetch/parse cost.
  const ipLimited = await enforceIpLimit(request, "pv", 30);
  if (ipLimited) return ipLimited;
  const globalLimited = await enforceGlobalDailyLimit("pv-parse", 1000);
  if (globalLimited) return globalLimited;

  // Fetch and parse
  const pdfBuffer = await fetchPVDocument(symbol, lang);
  if (!pdfBuffer) {
    return apiError(404, "not_found", "PV document not found or not available");
  }

  try {
    const pvDoc = await parsePVDocument(pdfBuffer, lang);

    // Save to cache (content stored as JSONB — pass object directly)
    await savePVContent(symbol, lang, pvDoc as object);

    return NextResponse.json(pvDoc);
  } catch (err) {
    console.error("Failed to parse PV document:", err);
    return apiError(500, "parse_error", "Failed to parse PV document");
  }
}
