// All content-search hits inside one meeting — backs the "show all N
// matches" expansion of the schedule's transcript-search sub-rows.
import { NextRequest, NextResponse } from "next/server";
import { getStatementMatches } from "@/lib/db";

const LIMIT = 100;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const assetId = sp.get("assetId");
  const q = sp.get("q")?.trim();
  if (!assetId || !q) {
    return NextResponse.json(
      { error: "assetId and q are required" },
      { status: 400 },
    );
  }
  const language = sp.get("locale") || "en";
  const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10) || 0);

  const result = await getStatementMatches(assetId, language, q, offset, LIMIT);

  const response = NextResponse.json(result);
  response.headers.set(
    "Cache-Control",
    "s-maxage=30, stale-while-revalidate=60",
  );
  return response;
}
