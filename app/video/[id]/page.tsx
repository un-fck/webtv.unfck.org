import { getVideoById, getVideoMetadata } from "@/lib/un-api";
import { notFound } from "next/navigation";
import Link from "next/link";
import { VideoPageClient } from "@/components/video-page-client";
import { extractKalturaId } from "@/lib/kaltura";

export const dynamic = "force-dynamic";

export default async function VideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  // Search backwards from today to find the video (much faster than loading 365 days)
  const video = await getVideoById(decodedId);

  if (!video) {
    notFound();
  }

  const kalturaId = extractKalturaId(video.id);

  if (!kalturaId) {
    return (
      <main className="min-h-screen bg-background px-4 sm:px-6">
        <div className="mx-auto max-w-5xl py-8">
          <Link
            href="/"
            className="mb-4 inline-block text-primary hover:underline"
          >
            ← Back to Schedule
          </Link>
          <div className="space-y-2">
            <p className="text-red-600">Unable to extract video ID</p>
            <p className="text-sm text-muted-foreground">
              Asset ID: {video.id}
            </p>
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-primary hover:underline"
            >
              View on UN Web TV →
            </a>
          </div>
        </div>
      </main>
    );
  }

  const metadata = await getVideoMetadata(video.id);

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
