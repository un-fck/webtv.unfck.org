import { NextRequest, NextResponse } from "next/server";
import { getVideoBySlug, getTranscriptByKalturaId } from "@/lib/db";
import { getVideoMetadata, recordToVideo } from "@/lib/un-api";
import {
  getSpeakerMapping,
  SpeakerInfo,
  formatSpeakerInfo,
} from "@/lib/speakers";
import { getCountryName } from "@/lib/country-lookup";
import { symbolFromSlug } from "@/lib/meeting-slug";
import { TRANSCRIPT_DISCLAIMER } from "@/lib/config";
import {
  buildSpeakerSegments,
  formatTranscriptAsPlainText,
  formatSpeakerText,
  formatTimecode,
} from "@/lib/transcript-formatting";

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
      return NextResponse.json(
        { error: "Invalid meeting path" },
        { status: 404 },
      );
    }

    const record = await getVideoBySlug(slug);
    if (!record) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const video = recordToVideo(record, false);
    const metadata = await getVideoMetadata(record.asset_id);

    const language = request.nextUrl.searchParams.get("language") || undefined;

    // Look up by the stable player ID. kaltura_id is the canonical pivot
    // (migration 015), so a single equality covers every transcript.
    const transcript = await getTranscriptByKalturaId(
      record.kaltura_id,
      language,
    );

    if (!transcript) {
      const response = NextResponse.json({
        disclaimer: TRANSCRIPT_DISCLAIMER,
        video,
        metadata,
        transcript: null,
        message: "No transcript available",
      });
      response.headers.set("Content-Type", "application/json; charset=utf-8");
      return response;
    }

    if (transcript.transcription_status !== "completed") {
      const response = NextResponse.json({
        disclaimer: TRANSCRIPT_DISCLAIMER,
        video,
        metadata,
        transcript: {
          status: transcript.transcription_status,
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

    for (const code of iso3Codes) {
      const name = getCountryName(code);
      if (name) countryNames.set(code, name);
    }

    const topics = transcript.content.topics || {};

    const format = request.nextUrl.searchParams.get("format");
    if (format === "text") {
      const segments = buildSpeakerSegments(
        transcript.content.statements,
        speakerMappings,
      );
      const body = formatTranscriptAsPlainText(
        segments,
        transcript.content.statements,
        (idx) => formatSpeakerText(idx, speakerMappings, countryNames),
        formatTimecode,
      );
      const title = video.cleanTitle || video.title;
      const date = video.date
        ? new Date(video.date).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "";
      const header = [
        `UN Transcripts — https://transcripts.un.org/en/${slug}`,
        [title, video.body, date].filter(Boolean).join(" — "),
        `Language: ${transcript.language_code}`,
        TRANSCRIPT_DISCLAIMER,
        "",
        "---",
        "",
      ].join("\n");
      return new Response(header + body, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
        },
      });
    }

    // Timestamps are already realignment-shifted by the display getter
    // (getTranscriptByKalturaId).
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
              ...(sent.words && sent.words.length > 0
                ? {
                    words: sent.words.map((w) => ({
                      text: w.text,
                      start: w.start / 1000,
                      end: w.end / 1000,
                    })),
                  }
                : {}),
            })),
          })),
          speaker: formatSpeakerInfo(info, countryNames),
        };
      },
    );

    const response = NextResponse.json({
      disclaimer: TRANSCRIPT_DISCLAIMER,
      video: {
        id: record.asset_id,
        kaltura_id: record.kaltura_id,
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
