import { NextRequest, NextResponse } from "next/server";
import { getPVContent, savePVContent } from "@/lib/turso";
import { fetchPVDocument } from "@/lib/pv-documents";
import { parsePVDocument } from "@/lib/pv-parser";

export const maxDuration = 25;

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const lang = request.nextUrl.searchParams.get("lang") || "en";

  if (!symbol) {
    return NextResponse.json(
      { error: "Missing required parameter: symbol" },
      { status: 400 },
    );
  }

  // Check cache first
  const cached = await getPVContent(symbol, lang);
  if (cached) {
    return NextResponse.json(JSON.parse(cached.content));
  }

  // Fetch and parse
  const pdfBuffer = await fetchPVDocument(symbol, lang);
  if (!pdfBuffer) {
    return NextResponse.json(
      { error: "PV document not found or not available" },
      { status: 404 },
    );
  }

  try {
    const pvDoc = await parsePVDocument(pdfBuffer, lang);
    const content = JSON.stringify(pvDoc);

    // Save to cache
    await savePVContent(symbol, lang, content);

    return NextResponse.json(pvDoc);
  } catch (err) {
    console.error("Failed to parse PV document:", err);
    return NextResponse.json(
      { error: "Failed to parse PV document" },
      { status: 500 },
    );
  }
}
