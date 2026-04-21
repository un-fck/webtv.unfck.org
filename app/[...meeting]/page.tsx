import { getVideoBySlug, getAllTranscriptedEntries } from "@/lib/turso";
import { notFound } from "next/navigation";
import { VideoPageClient } from "@/components/video-page-client";
import { extractKalturaId } from "@/lib/kaltura";
import { getVideoMetadata, recordToVideo } from "@/lib/un-api";
import { symbolFromSlug } from "@/lib/meeting-slug";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ meeting: string[] }>;
}) {
  const { meeting } = await params;
  const slug = meeting.map(decodeURIComponent).join("/");

  // Validate that the slug matches a known pattern
  const isValidPattern =
    symbolFromSlug(slug) !== null || slug.startsWith("meeting/");
  if (!isValidPattern) {
    notFound();
  }

  const record = await getVideoBySlug(slug);
  if (!record) {
    notFound();
  }

  const kalturaId = extractKalturaId(record.asset_id);

  if (!kalturaId) {
    return (
      <main className="min-h-screen bg-background px-4 sm:px-6">
        <div className="mx-auto max-w-5xl py-8">
          <Link
            href="/"
            className="mb-4 inline-block text-primary hover:underline"
          >
            &larr; Back to Schedule
          </Link>
          <div className="space-y-2">
            <p className="text-red-600">Unable to extract video ID</p>
            <p className="text-sm text-muted-foreground">
              Asset ID: {record.asset_id}
            </p>
            <a
              href={record.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-primary hover:underline"
            >
              View on UN Web TV &rarr;
            </a>
          </div>
        </div>
      </main>
    );
  }

  // Check if this video has a transcript
  const transcriptedEntries = await getAllTranscriptedEntries();
  const hasTranscript =
    record.entry_id !== null &&
    transcriptedEntries.includes(record.entry_id);

  const video = recordToVideo(record, hasTranscript);
  const metadata = await getVideoMetadata(record.asset_id);

  return (
    <main className="min-h-screen bg-background">
      <VideoPageClient
        kalturaId={kalturaId}
        video={video}
        metadata={metadata}
      />
    </main>
  );
}
