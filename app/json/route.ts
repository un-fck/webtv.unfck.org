import { NextResponse } from "next/server";
import { getScheduleVideos } from "@/lib/un-api";
import { scheduleLookbackDays } from "@/lib/config";

export async function GET() {
  try {
    const videos = await getScheduleVideos(scheduleLookbackDays);

    // Filter to only videos with transcripts
    const videosWithTranscripts = videos.filter((v) => v.hasTranscript);

    const response = NextResponse.json({
      count: videosWithTranscripts.length,
      videos: videosWithTranscripts.map((video) => ({
        id: video.id,
        title: video.title,
        clean_title: video.cleanTitle,
        url: video.url,
        json_url: `/json/${encodeURIComponent(video.id)}`,
        date: video.date,
        scheduled_time: video.scheduledTime,
        status: video.status,
        duration: video.duration,
        category: video.category,
        body: video.body,
        event_code: video.eventCode,
        event_type: video.eventType,
        session_number: video.sessionNumber,
        part_number: video.partNumber,
      })),
    });

    response.headers.set("Content-Type", "application/json; charset=utf-8");
    return response;
  } catch (error) {
    console.error("JSON list API error:", error);
    const response = NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
    response.headers.set("Content-Type", "application/json; charset=utf-8");
    return response;
  }
}
