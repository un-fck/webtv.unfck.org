import { NextRequest, NextResponse } from "next/server";
import { searchVideos } from "@/lib/db";
import { getCachedTranscriptedEntries } from "@/lib/cached-db";
import { recordToVideo } from "@/lib/un-api";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const offset = parseInt(
    request.nextUrl.searchParams.get("offset") || "0",
    10,
  );

  if (!q || q.length < 2) {
    return NextResponse.json({ videos: [], hasMore: false });
  }

  const PAGE_SIZE = 50;
  const [records, transcriptedEntries] = await Promise.all([
    searchVideos(q, PAGE_SIZE + 1, offset), // fetch one extra to detect if more exist
    getCachedTranscriptedEntries(),
  ]);

  const hasMore = records.length > PAGE_SIZE;
  if (hasMore) records.pop(); // remove the extra sentinel

  const transcriptedSet = new Set(transcriptedEntries);
  const videos = records.map((record) =>
    recordToVideo(
      record,
      record.entry_id ? transcriptedSet.has(record.entry_id) : false,
    ),
  );

  const response = NextResponse.json({ videos, hasMore });
  response.headers.set(
    "Cache-Control",
    "s-maxage=30, stale-while-revalidate=60",
  );
  return response;
}
