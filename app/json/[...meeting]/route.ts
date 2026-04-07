import { NextRequest, NextResponse } from "next/server";
import { getVideoBySlug, getTranscript } from "@/lib/turso";
import { getVideoMetadata, recordToVideo } from "@/lib/un-api";
import {
  getSpeakerMapping,
  SpeakerInfo,
  formatSpeakerInfo,
} from "@/lib/speakers";
import { getCountryName } from "@/lib/country-lookup";
import { resolveEntryId } from "@/lib/kaltura-helpers";
import { extractKalturaId } from "@/lib/kaltura";
import { symbolFromSlug } from "@/lib/meeting-slug";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ meeting: string[] }> },
) {
  try {
    const { meeting } = await context.params;
    const slug = meeting.map(decodeURIComponent).join("/");

    // Validate pattern
    const isValidPattern =
      symbolFromSlug(slug) !== null || slug.startsWith("meeting/");
    if (!isValidPattern) {
      return NextResponse.json({ error: "Invalid meeting path" }, { status: 404 });
    }

    const record = await getVideoBySlug(slug);
    if (!record) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const video = recordToVideo(record, false);
    const kalturaId = extractKalturaId(record.asset_id);
    const metadata = await getVideoMetadata(record.asset_id);

    // Resolve entry ID
    const entryId = await resolveEntryId(record.asset_id, record.entry_id);

    if (!entryId) {
      const response = NextResponse.json({
        video,
        metadata,
        transcript: null,
        error: "Unable to resolve video entry ID",
      });
      response.headers.set("Content-Type", "application/json; charset=utf-8");
      return response;
    }

    // Check Turso for transcript (optional language filter)
    const language = request.nextUrl.searchParams.get("language") || undefined;
    const transcript = await getTranscript(entryId, undefined, undefined, true, language);

    if (!transcript) {
      const response = NextResponse.json({
        video,
        metadata,
        transcript: null,
        message: "No transcript available",
      });
      response.headers.set("Content-Type", "application/json; charset=utf-8");
      return response;
    }

    if (transcript.status !== "completed") {
      const response = NextResponse.json({
        video,
        metadata,
        transcript: {
          status: transcript.status,
          transcriptId: transcript.transcript_id,
        },
        message: "Transcript not completed",
      });
      response.headers.set("Content-Type", "application/json; charset=utf-8");
      return response;
    }

    // Get speaker mappings
    const speakerMappings =
      (await getSpeakerMapping(transcript.transcript_id)) || {};

    // Load country names for affiliations
    const countryNames = new Map<string, string>();
    const iso3Codes = new Set<string>();
    Object.values(speakerMappings).forEach((info: SpeakerInfo) => {
      if (info.affiliation && info.affiliation.length === 3) {
        iso3Codes.add(info.affiliation);
      }
    });

    await Promise.all(
      Array.from(iso3Codes).map(async (code) => {
        const name = await getCountryName(code);
        if (name) countryNames.set(code, name);
      }),
    );

    const topics = transcript.content.topics || {};

    const transcriptData = transcript.content.statements.map(
      (stmt, index: number) => {
        const info = speakerMappings[index.toString()];

        return {
          statement_number: index + 1,
          paragraphs: stmt.paragraphs.map((para) => ({
            sentences: para.sentences.map((sent) => ({
              text: sent.text,
              start: sent.start / 1000,
              end: sent.end / 1000,
              topics:
                sent.topic_keys?.map((key) => ({
                  key,
                  label: topics[key]?.label || key,
                  description: topics[key]?.description || "",
                })) || [],
            })),
          })),
          speaker: formatSpeakerInfo(info, countryNames),
        };
      },
    );

    const response = NextResponse.json({
      video: {
        id: record.asset_id,
        kaltura_id: kalturaId,
        title: video.title,
        clean_title: video.cleanTitle,
        url: video.url,
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
        slug,
      },
      metadata: {
        summary: metadata.summary,
        description: metadata.description,
        categories: metadata.categories,
        geographic_subject: metadata.geographicSubject,
        subject_topical: metadata.subjectTopical,
        corporate_name: metadata.corporateName,
        speaker_affiliation: metadata.speakerAffiliation,
        related_documents: metadata.relatedDocuments,
      },
      transcript: {
        transcript_id: transcript.transcript_id,
        language: transcript.language_code,
        data: transcriptData,
        topics: Object.values(topics).map((t) => ({
          key: t.key,
          label: t.label,
          description: t.description,
        })),
      },
    });

    response.headers.set("Content-Type", "application/json; charset=utf-8");
    response.headers.set(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=300",
    );
    return response;
  } catch (error) {
    console.error("JSON API error:", error);
    const response = NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
    response.headers.set("Content-Type", "application/json; charset=utf-8");
    return response;
  }
}
