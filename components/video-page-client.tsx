"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { VideoPlayer } from "./video-player";
import {
  TranscriptionPanel,
  getTopicColor,
  type TranscriptionPanelData,
  type LanguageOption,
} from "./transcription-panel";
import { SpeakerToc } from "./speaker-toc";
import { PVSpeakerToc } from "./pv-panel";
import { SiteHeader } from "./site-header";
import { FoldVertical, UnfoldVertical, ChevronDown } from "lucide-react";
import type { Video, VideoMetadata } from "@/lib/un-api";
import { getPVDocumentUrl } from "@/lib/pv-documents";

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

  // Video docking: when main video scrolls out, dock into sidebar
  const [isVideoDocked, setIsVideoDocked] = useState(false);
  const videoPlaceholderRef = useRef<HTMLDivElement>(null);
  const landingZoneRef = useRef<HTMLDivElement>(null);
  const videoWrapperRef = useRef<HTMLDivElement>(null);

  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [topicCollapsed, setTopicCollapsed] = useState(true);
  const [panelData, setPanelData] = useState<TranscriptionPanelData | null>(
    null,
  );
  const [topicsOpen, setTopicsOpen] = useState(true);
  const [speakersOpen, setSpeakersOpen] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selectedLanguage") || "en";
    }
    return "en";
  });

  useEffect(() => {
    localStorage.setItem("selectedLanguage", selectedLanguage);
  }, [selectedLanguage]);
  const [availableLanguages, setAvailableLanguages] = useState<LanguageOption[]>([]);

  // Fetch available audio languages
  const refreshLanguages = useCallback(() => {
    fetch(`/api/languages?kalturaId=${encodeURIComponent(kalturaId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.languages) setAvailableLanguages(data.languages);
      })
      .catch(() => {});
  }, [kalturaId]);

  useEffect(() => {
    refreshLanguages();
  }, [refreshLanguages]);

  // IntersectionObserver: detect when the main video leaves viewport
  useEffect(() => {
    const placeholder = videoPlaceholderRef.current;
    if (!placeholder) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVideoDocked(!entry.isIntersecting),
      { threshold: 0.1 },
    );
    observer.observe(placeholder);
    return () => observer.disconnect();
  }, []);

  // Position video into the sidebar landing zone when docked
  const updateDockedPosition = useCallback(() => {
    const videoWrapper = videoWrapperRef.current;
    const landingZone = landingZoneRef.current;
    if (!videoWrapper || !landingZone || !isVideoDocked) return;

    const rect = landingZone.getBoundingClientRect();
    videoWrapper.style.position = "fixed";
    videoWrapper.style.top = `${rect.top}px`;
    videoWrapper.style.left = `${rect.left}px`;
    videoWrapper.style.width = `${rect.width}px`;
    videoWrapper.style.height = `${rect.height}px`;
    videoWrapper.style.zIndex = "40";
  }, [isVideoDocked]);

  useEffect(() => {
    const videoWrapper = videoWrapperRef.current;
    if (!videoWrapper) return;

    if (isVideoDocked) {
      updateDockedPosition();
    } else {
      videoWrapper.style.position = "relative";
      videoWrapper.style.top = "";
      videoWrapper.style.left = "";
      videoWrapper.style.width = "100%";
      videoWrapper.style.height = "100%";
      videoWrapper.style.zIndex = "";
    }
  }, [isVideoDocked, updateDockedPosition]);

  // Keep docked position fresh on scroll/resize
  useEffect(() => {
    if (!isVideoDocked) return;

    const landingZone = landingZoneRef.current;
    if (!landingZone) return;

    const resizeObs = new ResizeObserver(updateDockedPosition);
    resizeObs.observe(landingZone);

    window.addEventListener("scroll", updateDockedPosition, true);
    window.addEventListener("resize", updateDockedPosition);

    return () => {
      resizeObs.disconnect();
      window.removeEventListener("scroll", updateDockedPosition, true);
      window.removeEventListener("resize", updateDockedPosition);
    };
  }, [isVideoDocked, updateDockedPosition]);

  const seekToTimestamp = useCallback(
    (seconds: number) => {
      if (!player) return;
      player.currentTime = seconds;
      player.play();
    },
    [player],
  );

  const topicPills = (() => {
    if (!panelData?.topics || Object.keys(panelData.topics).length === 0)
      return null;

    const allTopicKeys = Object.keys(panelData.topics);
    const usedTopics = Object.values(panelData.topics);
    if (usedTopics.length === 0) return null;

    return (
      <div className="mb-4">
        <button
          onClick={() => setTopicsOpen((v) => !v)}
          className="mb-1 flex w-full items-center gap-1 text-sm font-semibold tracking-wide text-foreground"
        >
          <ChevronDown
            className={`h-3 w-3 transition-transform ${topicsOpen ? "" : "-rotate-90"}`}
          />
          Topics
        </button>
        {topicsOpen && (
          <>
            <div className="flex flex-wrap gap-x-1 gap-y-1.5">
              {usedTopics.map((topic) => {
                const color = getTopicColor(topic.key, allTopicKeys);
                return (
                  <button
                    key={topic.key}
                    onClick={() => {
                      const newTopic =
                        selectedTopic === topic.key ? null : topic.key;
                      setSelectedTopic(newTopic);
                      if (!newTopic) setTopicCollapsed(false);
                    }}
                    className={`inline-block rounded-full border px-2 py-0.5 text-left text-xs transition-all ${
                      selectedTopic === topic.key
                        ? "font-medium"
                        : "border-transparent font-normal opacity-70 hover:opacity-100"
                    }`}
                    style={{
                      backgroundColor: color + "30",
                      color: "#374151",
                      ...(selectedTopic === topic.key && {
                        backgroundColor: color + "50",
                        borderColor: color,
                      }),
                    }}
                    title={topic.description}
                  >
                    {topic.label}
                  </button>
                );
              })}
            </div>
            {selectedTopic && (
              <div className="mt-2 inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5 text-xs">
                <button
                  onClick={() => setTopicCollapsed(true)}
                  className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${
                    topicCollapsed
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FoldVertical className="h-3 w-3" />
                  <span>Highlights only</span>
                </button>
                <button
                  onClick={() => setTopicCollapsed(false)}
                  className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${
                    !topicCollapsed
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <UnfoldVertical className="h-3 w-3" />
                  <span>All content</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  })();

  return (
    <>
      <SiteHeader />

      <div className="mx-auto max-w-7xl px-6 pb-16 sm:px-8">
        <nav className="py-3">
          <a href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← Back to schedule
          </a>
        </nav>

        {/* Video + metadata row: same column ratio as below */}
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Video — left column width */}
          <div
            ref={videoPlaceholderRef}
            className="aspect-video min-w-0 bg-black lg:flex-[3]"
          >
            <div
              ref={videoWrapperRef}
              className="h-full w-full"
            >
              <VideoPlayer
                kalturaId={kalturaId}
                partnerId={2503451}
                uiConfId={49754663}
                audioLanguage={selectedLanguage}
                onPlayerReady={setPlayer}
              />
            </div>
          </div>

          {/* Metadata — right column width */}
          <div className="lg:flex-[2]">
            <h1 className="mb-1 text-base leading-snug font-semibold">
              {video.cleanTitle}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
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
                  {new Date(video.scheduledTime).toLocaleTimeString("en-GB", {
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
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <a
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                UN Web TV →
              </a>
              {video.pvSymbol && video.pvAvailable && (
                <a
                  href={getPVDocumentUrl(video.pvSymbol)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {video.pvSymbol} (PDF) →
                </a>
              )}
            </div>
            {metadata.summary && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {metadata.summary}
              </p>
            )}
          </div>
        </div>

        {/* Two columns: transcript left, sticky sidebar right */}
        <div className="mt-6 flex flex-col gap-6 lg:flex-row">
          {/* LEFT — transcript */}
          <div className="min-w-0 lg:flex-[3]">
            <TranscriptionPanel
              kalturaId={kalturaId}
              player={player}
              video={video}
              selectedLanguage={selectedLanguage}
              onLanguageChange={setSelectedLanguage}
              availableLanguages={availableLanguages}
              onLanguagesRefresh={refreshLanguages}
              selectedTopic={selectedTopic}
              onTopicSelect={setSelectedTopic}
              topicCollapsed={topicCollapsed}
              onTopicCollapsedChange={setTopicCollapsed}
              onDataChange={setPanelData}
              pvSymbol={video.pvAvailable && video.pvSymbol ? video.pvSymbol : undefined}
            />
          </div>

          {/* RIGHT — sticky sidebar */}
          <div className="hidden lg:block lg:flex-[2]">
            <div className="lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-2rem)] lg:flex-col">
              {/* Landing zone: video docks here when scrolled past */}
              <div
                ref={landingZoneRef}
                className={`shrink-0 overflow-hidden rounded-lg bg-black ${
                  isVideoDocked ? "mb-2 aspect-video w-full" : "h-0"
                }`}
              />

              {/* Topics — offset so header aligns with first speaker label, pills align with paragraph box */}
              <div className={`shrink-0 ${isVideoDocked ? "mt-2" : "mt-[48px]"}`}>
                {topicPills}
              </div>

              {/* Speakers — collapsible, scrollable. Shows speakers for the active tab only. */}
              {((panelData?.viewMode === "pv" && panelData?.pvSpeakers) ||
                (panelData?.viewMode === "transcript" && panelData?.segments)) && (
                <div className="flex min-h-0 flex-1 flex-col">
                  <button
                    onClick={() => setSpeakersOpen((v) => !v)}
                    className="mb-1 flex shrink-0 items-center gap-1 text-sm font-semibold tracking-wide text-foreground"
                  >
                    <ChevronDown
                      className={`h-3 w-3 transition-transform ${speakersOpen ? "" : "-rotate-90"}`}
                    />
                    Speakers
                  </button>
                  {speakersOpen && (
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      {panelData?.viewMode === "pv" && panelData?.pvSpeakers ? (
                        <PVSpeakerToc
                          speakers={panelData.pvSpeakers}
                          activeTurnIndex={panelData.pvActiveTurnIndex ?? -1}
                          onSeek={(ms) => seekToTimestamp(ms / 1000)}
                        />
                      ) : panelData?.viewMode === "transcript" && panelData?.segments ? (
                        <SpeakerToc
                          segments={panelData.segments}
                          speakerMappings={panelData.speakerMappings}
                          countryNames={panelData.countryNames}
                          activeSegmentIndex={panelData.activeSegmentIndex}
                          onSeek={seekToTimestamp}
                          selectedTopic={selectedTopic}
                          topicColor={
                            selectedTopic && panelData.topics
                              ? getTopicColor(
                                  selectedTopic,
                                  Object.keys(panelData.topics),
                                )
                              : null
                          }
                          statements={panelData.statements}
                        />
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
