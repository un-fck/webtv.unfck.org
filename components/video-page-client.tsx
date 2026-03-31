"use client";

import { useState, useRef, useCallback } from "react";
import { VideoPlayer } from "./video-player";
import { TranscriptionPanel } from "./transcription-panel";
import { LiveTranscription } from "./live-transcription";
import { SiteHeader } from "./site-header";
import type { Video, VideoMetadata } from "@/lib/un-api";

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

  const [leftPct, setLeftPct] = useState(() => {
    if (typeof window === "undefined") return 38;
    return Number(localStorage.getItem("videoPageSplit") ?? 38);
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const { left, width } = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - left) / width) * 100;
      const next = Math.min(Math.max(pct, 20), 80);
      setLeftPct(next);
      localStorage.setItem("videoPageSplit", String(next));
    };

    const onMouseUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SiteHeader variant="nav" backHref="/" />

      {/* Mobile: single column. Desktop: resizable two-column */}
      <div ref={containerRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* LEFT COLUMN */}
        <div
          className="flex shrink-0 flex-col overflow-y-auto lg:border-r lg:border-border"
          style={{ width: `${leftPct}%` }}
        >
          <div className="aspect-video w-full shrink-0 bg-black">
            <VideoPlayer
              kalturaId={kalturaId}
              partnerId={2503451}
              uiConfId={49754663}
              onPlayerReady={setPlayer}
            />
          </div>

          <div className="px-5 py-4">
            <h1 className="mb-2 text-base leading-snug font-semibold">
              {video.cleanTitle}
            </h1>

            <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {video.date && (
                <span>
                  {new Date(video.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              )}
              {video.date && video.scheduledTime && <span>·</span>}
              {video.scheduledTime && (
                <span>
                  {new Date(video.scheduledTime).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZoneName: "short",
                  })}
                </span>
              )}
              {video.scheduledTime && video.body && <span>·</span>}
              {video.body && <span>{video.body}</span>}
              {video.body && video.category && <span>·</span>}
              {video.category && <span>{video.category}</span>}
              {video.category && video.duration && <span>·</span>}
              {video.duration && <span>{video.duration}</span>}
              {(video.duration ||
                video.category ||
                video.body ||
                video.scheduledTime ||
                video.date) && <span>·</span>}
              <a
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                UN Web TV →
              </a>
            </div>

            <div className="mb-4 border-t border-border" />

            {metadata.summary && (
              <div className="mb-3">
                <h3 className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Summary
                </h3>
                <p className="text-sm leading-relaxed">{metadata.summary}</p>
              </div>
            )}

            {metadata.description && (
              <div className="mb-3">
                <h3 className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Description
                </h3>
                <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                  {metadata.description}
                </p>
              </div>
            )}

            {metadata.categories.length > 0 && (
              <div className="mb-3">
                <h3 className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Categories
                </h3>
                <p className="text-sm text-muted-foreground">
                  {metadata.categories.join(" → ")}
                </p>
              </div>
            )}

            {metadata.subjectTopical.length > 0 && (
              <div className="mb-3">
                <h3 className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Topics
                </h3>
                <p className="text-sm text-muted-foreground">
                  {metadata.subjectTopical.join(", ")}
                </p>
              </div>
            )}

            {metadata.corporateName.length > 0 && (
              <div className="mb-3">
                <h3 className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Organizations
                </h3>
                <p className="text-sm text-muted-foreground">
                  {metadata.corporateName.join(", ")}
                </p>
              </div>
            )}

            {metadata.relatedDocuments.length > 0 && (
              <div className="mb-3">
                <h3 className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Related Documents
                </h3>
                <ul className="space-y-1">
                  {metadata.relatedDocuments.map((doc, i) => (
                    <li key={i}>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
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

        {/* DRAG HANDLE */}
        <div
          onMouseDown={onMouseDown}
          className="hidden lg:flex w-1 cursor-col-resize items-center justify-center bg-border hover:bg-primary/40 active:bg-primary/60 transition-colors"
        />

        {/* RIGHT COLUMN */}
        <div className="min-h-0 flex-1 overflow-y-auto px-8 pt-5 pb-10">
          <div className="mx-auto max-w-2xl">
            {isLive ? (
              <LiveTranscription player={player} />
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
    </div>
  );
}
