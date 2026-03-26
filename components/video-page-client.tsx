"use client";

import { useState } from "react";
import { VideoPlayer } from "./video-player";
import { TranscriptionPanel } from "./transcription-panel";
import { LiveTranscription } from "./live-transcription";
import type { Video, VideoMetadata } from "@/lib/un-api";
import Link from "next/link";
import Image from "next/image";

interface VideoPageClientProps {
  kalturaId: string;
  video: Video;
  metadata: VideoMetadata;
}

export function VideoPageClient({
  kalturaId,
  video,
  metadata,
}: VideoPageClientProps) {
  const [player, setPlayer] = useState<{
    currentTime: number;
    play: () => void;
  }>();
  const isLive = video.status === "live";

  return (
    <div className="flex h-full flex-col overflow-y-auto lg:flex-row lg:gap-6 lg:overflow-hidden">
      {/* Video & metadata column - scrollable on desktop, contains sticky video on mobile */}
      <div className="w-full lg:h-full lg:w-1/2 lg:overflow-y-auto">
        {/* Sticky video container on mobile */}
        <div className="sticky top-0 z-10 bg-background lg:relative lg:top-auto">
          <div className="pt-4 lg:pt-8">
            <Link
              href="/"
              className="mb-4 inline-flex items-center gap-2 hover:opacity-80 lg:mb-6"
            >
              <Image
                src="/images/UN Logo_Horizontal_English/Colour/UN Logo_Horizontal_Colour_English.svg"
                alt="UN Logo"
                width={150}
                height={30}
                className="h-6 w-auto lg:h-8"
              />
            </Link>

            <div className="mb-4">
              <Link href="/" className="text-sm text-primary hover:underline">
                ← Back to Schedule
              </Link>
            </div>

            <div className="mb-3">
              <h1 className="mb-2 text-lg font-semibold lg:text-xl">
                {video.cleanTitle}
              </h1>
              <div className="mb-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {video.date && (
                  <>
                    <span>
                      {new Date(video.date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                    {video.scheduledTime && <span>•</span>}
                  </>
                )}
                {video.scheduledTime && (
                  <>
                    <span>
                      {new Date(video.scheduledTime).toLocaleTimeString(
                        "en-US",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZoneName: "short",
                        },
                      )}
                    </span>
                    {(video.body || video.category || video.duration) && (
                      <span>•</span>
                    )}
                  </>
                )}
                {video.body && <span>{video.body}</span>}
                {video.body && (video.category || video.duration) && (
                  <span>•</span>
                )}
                {video.category && <span>{video.category}</span>}
                {video.category && video.duration && <span>•</span>}
                {video.duration && <span>{video.duration}</span>}
              </div>
            </div>

            <div
              className="mb-4 aspect-video overflow-hidden rounded-lg bg-black lg:mb-6"
              id="video-player"
            >
              <VideoPlayer
                kalturaId={kalturaId}
                partnerId={2503451}
                uiConfId={49754663}
                onPlayerReady={setPlayer}
              />
            </div>
          </div>
        </div>

        {/* Metadata section */}
        <div className="lg:pr-4">
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            View on UN Web TV →
          </a>

          <div className="space-y-4 py-6 text-sm">
            {metadata.summary && (
              <div>
                <h3 className="mb-1 font-semibold">Summary</h3>
                <p className="text-muted-foreground">{metadata.summary}</p>
              </div>
            )}

            {metadata.description && (
              <div>
                <h3 className="mb-1 font-semibold">Description</h3>
                <p className="whitespace-pre-line text-muted-foreground">
                  {metadata.description}
                </p>
              </div>
            )}

            {metadata.categories.length > 0 && (
              <div>
                <h3 className="mb-1 font-semibold">Categories</h3>
                <p className="text-muted-foreground">
                  {metadata.categories.join(" → ")}
                </p>
              </div>
            )}

            {metadata.geographicSubject.length > 0 && (
              <div>
                <h3 className="mb-1 font-semibold">Geographic Subject</h3>
                <p className="text-muted-foreground">
                  {metadata.geographicSubject.join(", ")}
                </p>
              </div>
            )}

            {metadata.subjectTopical.length > 0 && (
              <div>
                <h3 className="mb-1 font-semibold">Topics</h3>
                <p className="text-muted-foreground">
                  {metadata.subjectTopical.join(", ")}
                </p>
              </div>
            )}

            {metadata.corporateName.length > 0 && (
              <div>
                <h3 className="mb-1 font-semibold">Organizations</h3>
                <p className="text-muted-foreground">
                  {metadata.corporateName.join(", ")}
                </p>
              </div>
            )}

            {metadata.speakerAffiliation.length > 0 && (
              <div>
                <h3 className="mb-1 font-semibold">Speaker Affiliation</h3>
                <p className="text-muted-foreground">
                  {metadata.speakerAffiliation.join(", ")}
                </p>
              </div>
            )}

            {metadata.relatedDocuments.length > 0 && (
              <div>
                <h3 className="mb-1 font-semibold">Related Documents</h3>
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

      {/* Transcript column */}
      <div className="w-full lg:h-full lg:w-1/2 lg:overflow-y-auto">
        <div className="pt-4 pb-8 lg:pt-8 lg:pl-4">
          {isLive ? (
            <LiveTranscription
              player={player}
              isLive={isLive}
              kalturaId={kalturaId}
            />
          ) : (
            <TranscriptionPanel
              kalturaId={kalturaId}
              player={player}
              video={video}
              metadata={metadata}
            />
          )}
        </div>
      </div>
    </div>
  );
}
