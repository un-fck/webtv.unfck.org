'use client';

import { useState } from 'react';
import { VideoPlayer } from './video-player';
import { TranscriptionPanel } from './transcription-panel';
import type { Video, VideoMetadata } from '@/lib/un-api';
import Link from 'next/link';
import Image from 'next/image';

interface VideoPageClientProps {
  kalturaId: string;
  video: Video;
  metadata: VideoMetadata;
}

export function VideoPageClient({ kalturaId, video, metadata }: VideoPageClientProps) {
  const [player, setPlayer] = useState<{ currentTime: number; play: () => void }>();

  return (
    <div className="flex gap-6 items-start">
      <div className="w-1/2">
        <div className="sticky top-0 pt-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6 hover:opacity-80">
            <Image
              src="/images/UN Logo_Horizontal_English/Colour/UN Logo_Horizontal_Colour_English.svg"
              alt="UN Logo"
              width={150}
              height={30}
              className="h-8 w-auto"
            />
          </Link>

          <div className="mb-4">
            <Link href="/" className="text-primary hover:underline text-sm">
              ← Back to Schedule
            </Link>
          </div>
          
          <div className="mb-3">
            <h1 className="text-xl font-semibold mb-2">{video.cleanTitle}</h1>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
              {video.body && <span>{video.body}</span>}
              {video.body && (video.category || video.duration) && <span>•</span>}
              {video.category && <span>{video.category}</span>}
              {video.category && video.duration && <span>•</span>}
              <span>{video.duration}</span>
            </div>
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline text-xs"
            >
              View on UN Web TV →
            </a>
          </div>
          
          <div className="aspect-video bg-black rounded-lg overflow-hidden mb-6" id="video-player">
            <VideoPlayer
              kalturaId={kalturaId}
              partnerId={2503451}
              uiConfId={49754663}
              onPlayerReady={setPlayer}
            />
          </div>

          {/* Metadata section */}
          <div className="space-y-4 text-sm pb-8">
            {metadata.summary && (
              <div>
                <h3 className="font-semibold mb-1">Summary</h3>
                <p className="text-muted-foreground">{metadata.summary}</p>
              </div>
            )}

            {metadata.description && (
              <div>
                <h3 className="font-semibold mb-1">Description</h3>
                <p className="text-muted-foreground whitespace-pre-line">{metadata.description}</p>
              </div>
            )}

            {metadata.categories.length > 0 && (
              <div>
                <h3 className="font-semibold mb-1">Categories</h3>
                <p className="text-muted-foreground">{metadata.categories.join(' → ')}</p>
              </div>
            )}

            {metadata.geographicSubject.length > 0 && (
              <div>
                <h3 className="font-semibold mb-1">Geographic Subject</h3>
                <p className="text-muted-foreground">{metadata.geographicSubject.join(', ')}</p>
              </div>
            )}

            {metadata.subjectTopical.length > 0 && (
              <div>
                <h3 className="font-semibold mb-1">Topics</h3>
                <p className="text-muted-foreground">{metadata.subjectTopical.join(', ')}</p>
              </div>
            )}

            {metadata.corporateName.length > 0 && (
              <div>
                <h3 className="font-semibold mb-1">Organizations</h3>
                <p className="text-muted-foreground">{metadata.corporateName.join(', ')}</p>
              </div>
            )}

            {metadata.speakerAffiliation.length > 0 && (
              <div>
                <h3 className="font-semibold mb-1">Speaker Affiliation</h3>
                <p className="text-muted-foreground">{metadata.speakerAffiliation.join(', ')}</p>
              </div>
            )}

            {metadata.relatedDocuments.length > 0 && (
              <div>
                <h3 className="font-semibold mb-1">Related Documents</h3>
                <ul className="space-y-1">
                  {metadata.relatedDocuments.map((doc, i) => (
                    <li key={i}>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {doc.title} →
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="w-1/2 pt-8">
        <TranscriptionPanel kalturaId={kalturaId} player={player} />
      </div>
    </div>
  );
}

