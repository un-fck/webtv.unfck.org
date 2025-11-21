import { getScheduleVideos, getVideoMetadata } from '@/lib/un-api';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { VideoPageClient } from '@/components/video-page-client';

export const dynamic = 'force-dynamic';

function extractKalturaId(assetId: string): string | null {
  // Try different patterns to extract Kaltura entry ID
  
  // Pattern 1: ID in parentheses - e.g., "something(1_abc123)"
  let match = assetId.match(/\(([^)]+)\)/);
  if (match) return match[1];
  
  // Pattern 2: ID in /id/ path - e.g., "something/id/1_abc123"
  match = assetId.match(/\/id\/([^/]+)/);
  if (match) return match[1];
  
  // Pattern 3: Check if it's already a Kaltura ID format (1_xxxxxx)
  if (assetId.match(/^1_[a-z0-9]+$/i)) {
    return assetId;
  }
  
  // Pattern 4: UN format like "k1a/k1a7f1gn3l" -> convert to "1_a7f1gn3l"
  // Simply extract everything after "/k1" and prepend "1_"
  match = assetId.match(/\/k1(\w+)$/);
  if (match) {
    return `1_${match[1]}`;
  }
  
  // Pattern 5: Just "k1a7f1gn3l" -> convert to "1_a7f1gn3l"
  match = assetId.match(/^k1(\w+)$/);
  if (match) {
    return `1_${match[1]}`;
  }
  
  return null;
}

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const videos = await getScheduleVideos(90);
  const video = videos.find(v => v.id === decodedId);

  if (!video) {
    notFound();
  }

  const kalturaId = extractKalturaId(video.id);
  
  if (!kalturaId) {
    return (
      <main className="min-h-screen bg-background px-4 sm:px-6">
        <div className="max-w-5xl mx-auto py-8">
          <Link href="/" className="text-primary hover:underline mb-4 inline-block">
            ← Back to Schedule
          </Link>
          <div className="space-y-2">
            <p className="text-red-600">Unable to extract video ID</p>
            <p className="text-sm text-muted-foreground">Asset ID: {video.id}</p>
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline text-sm block"
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
    <main className="min-h-screen bg-background px-4 sm:px-6">
      <div className="max-w-5xl mx-auto py-8">
        <VideoPageClient kalturaId={kalturaId} video={video} metadata={metadata} />
      </div>
    </main>
  );
}

