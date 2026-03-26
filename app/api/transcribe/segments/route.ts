import { NextRequest, NextResponse } from "next/server";
import { getAllTranscriptsForEntry } from "@/lib/turso";
import { resolveEntryId } from "@/lib/kaltura-helpers";

interface Gap {
  start: number;
  end: number;
}

interface Word {
  text: string;
  speaker?: string | null;
  start: number;
  end: number;
}

interface Paragraph {
  text: string;
  start: number;
  end: number;
  words: Word[];
}

export async function POST(request: NextRequest) {
  try {
    const { kalturaId, currentTime, totalDuration, isComplete } =
      await request.json();

    if (!kalturaId) {
      return NextResponse.json(
        { error: "Kaltura ID is required" },
        { status: 400 },
      );
    }

    // Resolve Kaltura ID to actual entry ID (checks cache first)
    const entryId = await resolveEntryId(kalturaId);

    if (!entryId) {
      return NextResponse.json(
        { error: "Unable to resolve entry ID" },
        { status: 404 },
      );
    }

    // Get existing segments from Turso
    const existingSegments = await getAllTranscriptsForEntry(entryId);

    // Convert to paragraphs with adjusted timestamps
    const existingParagraphs: Paragraph[] = existingSegments
      .filter((seg) => seg.status === "completed")
      .flatMap((seg) => {
        const startOffset = seg.start_time || 0;
        const statements = seg.content.statements || [];
        return statements.flatMap((stmt) =>
          stmt.paragraphs.map((para) => ({
            text: para.sentences.map((s) => s.text).join(" "),
            start: para.start / 1000 + startOffset,
            end: para.end / 1000 + startOffset,
            words: para.words.map(
              (w: { text: string; start: number; end: number }) => ({
                text: w.text,
                speaker: null,
                start: w.start / 1000 + startOffset,
                end: w.end / 1000 + startOffset,
              }),
            ),
          })),
        );
      })
      .sort((a, b) => a.start - b.start);

    // For finished videos, check if we have a complete transcript
    if (isComplete) {
      const hasCompleteTranscript = existingSegments.some(
        (seg) =>
          (seg.start_time === null || seg.start_time === 0) &&
          (seg.end_time === null || seg.end_time >= (totalDuration || 0)),
      );

      if (hasCompleteTranscript) {
        return NextResponse.json({
          existingSegments: existingParagraphs,
          gaps: [],
          needsFullRetranscription: false,
        });
      } else if (existingSegments.length > 0) {
        // Has partial transcripts but no complete one
        return NextResponse.json({
          existingSegments: existingParagraphs,
          gaps: [],
          needsFullRetranscription: true,
        });
      } else {
        // No transcripts at all
        return NextResponse.json({
          existingSegments: [],
          gaps: [{ start: 0, end: totalDuration || 0 }],
          needsFullRetranscription: false,
        });
      }
    }

    // For live videos, find gaps up to current time
    const targetEnd = currentTime || totalDuration || 0;
    const gaps: Gap[] = [];

    const completedSegments = existingSegments
      .filter((seg) => seg.status === "completed")
      .map((seg) => ({
        start: seg.start_time || 0,
        end: seg.end_time || 0,
      }))
      .sort((a, b) => a.start - b.start);

    if (completedSegments.length === 0) {
      // No transcripts at all
      gaps.push({ start: 0, end: targetEnd });
    } else {
      // Check for gap at the start
      if (completedSegments[0].start > 0) {
        gaps.push({ start: 0, end: completedSegments[0].start });
      }

      // Check for gaps between segments
      for (let i = 0; i < completedSegments.length - 1; i++) {
        const currentEnd = completedSegments[i].end;
        const nextStart = completedSegments[i + 1].start;

        if (nextStart > currentEnd) {
          gaps.push({ start: currentEnd, end: nextStart });
        }
      }

      // Check for gap at the end
      const lastSegment = completedSegments[completedSegments.length - 1];
      if (lastSegment.end < targetEnd) {
        gaps.push({ start: lastSegment.end, end: targetEnd });
      }
    }

    return NextResponse.json({
      existingSegments: existingParagraphs,
      gaps,
      needsFullRetranscription: false,
    });
  } catch (error) {
    console.error("Segment analysis error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
