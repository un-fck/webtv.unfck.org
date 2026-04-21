import { NextRequest, NextResponse } from "next/server";
import { getPVContent, savePVContent } from "@/lib/turso";
import { fetchPVDocument } from "@/lib/pv-documents";
import { parsePVDocument } from "@/lib/pv-parser";
import { apiError } from "@/lib/api-error";

export const maxDuration = 25;

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const lang = request.nextUrl.searchParams.get("lang") || "en";

  if (!symbol) {
    return apiError(400, "missing_parameter", "Missing required parameter: symbol");
  }

  // Check cache first
  const cached = await getPVContent(symbol, lang);
  if (cached) {
    return NextResponse.json(JSON.parse(cached.content));
  }

  // Fetch and parse
  const pdfBuffer = await fetchPVDocument(symbol, lang);
  if (!pdfBuffer) {
    return apiError(404, "not_found", "PV document not found or not available");
  }

  try {
    const pvDoc = await parsePVDocument(pdfBuffer, lang);
    const content = JSON.stringify(pvDoc);

    // Save to cache
    await savePVContent(symbol, lang, content);

    return NextResponse.json(pvDoc);
  } catch (err) {
    console.error("Failed to parse PV document:", err);
    return apiError(500, "parse_error", "Failed to parse PV document");
  }
}
