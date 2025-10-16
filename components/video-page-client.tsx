'use client';

import { useState } from 'react';
import { VideoPlayer } from './video-player';
import { TranscriptionPanel } from './transcription-panel';
import type { Video } from '@/lib/un-api';
import Link from 'next/link';
import Image from 'next/image';

interface VideoPageClientProps {
  kalturaId: string;
  video: Video;
}

export function VideoPageClient({ kalturaId, video }: VideoPageClientProps) {
  const [player, setPlayer] = useState<{ currentTime: number; play: () => void }>();

  return (
    <div className="flex gap-6 items-start">
      <div className="w-1/2 sticky top-0 pt-8 h-screen">
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
        
        <div className="aspect-video bg-black rounded-lg overflow-hidden" id="video-player">
          <VideoPlayer
            kalturaId={kalturaId}
            partnerId={2503451}
            uiConfId={49754663}
            onPlayerReady={setPlayer}
          />
        </div>
      </div>

      <div className="w-1/2 pt-8">
        <TranscriptionPanel kalturaId={kalturaId} player={player} />
      </div>
    </div>
  );
}

