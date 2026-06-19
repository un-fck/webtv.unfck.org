"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { VideoPlayer } from "./video-player";
import {
  TranscriptionPanel,
  getTopicColor,
  type TranscriptionPanelData,
  type LanguageOption,
  type InitialTranscript,
} from "./transcription-panel";
import { SpeakerToc, hasMeaningfulSpeakerInfo } from "./speaker-toc";
import { PVSpeakerToc } from "./pv-panel";
import { SiteHeader } from "./site-header";
import { ExternalLink } from "./external-link";
import { CategoryPill } from "./category-pill";
import { FoldVertical, UnfoldVertical, ChevronDown } from "lucide-react";
import type { Video, VideoMetadata } from "@/lib/un-api";
import { useMeetingFormat } from "@/lib/hooks/use-meeting-format";
import { getPVDocumentUrl } from "@/lib/pv-documents";
import { UN_LANGUAGES } from "@/lib/languages";
import { getScheduleReturnUrl } from "@/lib/schedule-return";
import { localizeWebtvAssetUrl } from "@/lib/un-links";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";
import { widePageWidth } from "@/lib/layout";

interface VideoPageClientProps {
  kalturaId: string;
  video: Video;
  metadata: VideoMetadata;
  isLoggedIn: boolean;
  /**
   * Pre-fetched transcript for the URL locale. Server-rendered so a no-JS
   * agent (Bing/Copilot snippet pipeline, etc.) sees the transcript text in
   * the initial HTML payload. When supplied, the panel skips its on-mount
   * /api/transcripts/check round-trip — the first paint matches the SSR
   * output exactly, no re-fetch flash.
   */
  initialTranscript?: InitialTranscript | null;
}

export function VideoPageClient({
  kalturaId,
  video,
  metadata,
  isLoggedIn,
  initialTranscript,
}: VideoPageClientProps) {
  const { formatMeetingDate, formatMeetingTime } = useMeetingFormat();
  const t = useTranslations("transcript");
  const tVideo = useTranslations("video");
  const tCategory = useTranslations("schedule.categoryNames");
  const uiLocale = useLocale();
  const [player, setPlayer] = useState<{
    currentTime: number;
    play: () => void;
  }>();

  // Back link: return to the last filtered schedule view if we have one,
  // otherwise the plain homepage. Read after mount to avoid SSR mismatch.
  const [backHref, setBackHref] = useState("/");
  useEffect(() => {
    setBackHref(getScheduleReturnUrl());
  }, []);

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
  // Default to the user's UI locale — same language they chose for the site
  // is the natural first guess for what they want to read/listen to. If that
  // language isn't actually available for this meeting, the validation effect
  // below falls back to floor (original audio) or the first available track.
  // No localStorage: each new meeting starts from the UI-locale default and
  // resets per-meeting picks.
  const [selectedLanguage, setSelectedLanguage] = useState<string>(uiLocale);
  const [availableLanguages, setAvailableLanguages] = useState<
    LanguageOption[]
  >([]);

  // Once we know what's actually available for this meeting, validate that
  // `selectedLanguage` is one of the available codes. If not, fall back:
  //   UI locale → floor (original audio) → first available track.
  // Only fires when availableLanguages updates and the selection is invalid,
  // so a user's manual pick of an available language is never overridden.
  useEffect(() => {
    if (availableLanguages.length === 0) return;
    const currentIsAvailable = availableLanguages.some(
      (l) => l.code === selectedLanguage && l.available,
    );
    if (currentIsAvailable) return;
    const floor = availableLanguages.find(
      (l) => l.code === "floor" && l.available,
    );
    const firstAvailable = availableLanguages.find((l) => l.available);
    const fallback = floor?.code ?? firstAvailable?.code;
    if (fallback && fallback !== selectedLanguage) {
      setSelectedLanguage(fallback);
    }
  }, [availableLanguages, selectedLanguage]);

  // Update available languages based on tracks the player actually has
  const handleAudioTracksReady = useCallback(
    (
      tracks: {
        id: number;
        language: string;
        label: string;
        active: boolean;
      }[],
    ) => {
      const FLOOR_CODES = new Set(["ia"]);
      const availableFromPlayer = new Set<string>();
      for (const track of tracks) {
        if (FLOOR_CODES.has(track.language)) {
          availableFromPlayer.add("floor");
        } else if (track.language) {
          availableFromPlayer.add(track.language);
        }
      }
      if (availableFromPlayer.size === 0) return;

      setAvailableLanguages((prev) => {
        const base =
          prev.length > 0
            ? prev
            : UN_LANGUAGES.map((l) => ({
                code: l.code,
                name: l.name,
                available: false,
                transcriptStatus: null as string | null,
              }));
        return base.map((lang) => ({
          ...lang,
          available: lang.available || availableFromPlayer.has(lang.code),
        }));
      });
    },
    [],
  );

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
    if (panelData?.viewMode === "analysis") return null;
    if (!panelData?.topics || Object.keys(panelData.topics).length === 0)
      return null;

    const allTopicKeys = Object.keys(panelData.topics);
    const usedTopics = Object.values(panelData.topics);
    if (usedTopics.length === 0) return null;

    return (
      <div className="mb-4">
        <button
          onClick={() => setTopicsOpen((v) => !v)}
          className={cn(
            typography.speakerLabel,
            "mb-1 flex w-full items-center gap-1",
          )}
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
                      if (newTopic) setTopicCollapsed(true);
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
                  <span>{t("highlightsOnly")}</span>
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
                  <span>{t("allContent")}</span>
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
      <SiteHeader wide />

      <div className={cn("mx-auto px-4 pb-16 sm:px-8", widePageWidth)}>
        <nav className="py-3">
          <a
            href={backHref}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {tVideo("backToHomepage")}
          </a>
        </nav>

        {/* Video + metadata row: same column ratio as below */}
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Video — left column width */}
          <div
            ref={videoPlaceholderRef}
            className="aspect-video min-w-0 bg-black lg:flex-3"
          >
            <div ref={videoWrapperRef} className="h-full w-full">
              {video.removed ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-6 text-center text-white">
                  <p className={typography.body}>{tVideo("removed")}</p>
                  <p className={cn(typography.caption, "text-white/70")}>
                    {video.hasTranscript
                      ? tVideo("removedHadTranscript")
                      : tVideo("removedNoTranscript")}
                  </p>
                </div>
              ) : (
                <VideoPlayer
                  kalturaId={kalturaId}
                  partnerId={2503451}
                  uiConfId={49754663}
                  audioLanguage={selectedLanguage}
                  onPlayerReady={setPlayer}
                  onAudioTracksReady={handleAudioTracksReady}
                />
              )}
            </div>
          </div>

          {/* Metadata — right column width */}
          <div className="lg:flex-2">
            <h1 className={cn(typography.sectionTitle, "leading-tight")}>
              {video.cleanTitle}
            </h1>

            <div
              className={cn(
                typography.meta,
                "mt-1.5 flex flex-wrap items-center gap-x-2",
              )}
            >
              {(() => {
                const items = [
                  video.date &&
                    formatMeetingDate(video.scheduledTime ?? video.date, {
                      weekday: "none",
                      relative: "prefix",
                    }),
                  video.scheduledTime && formatMeetingTime(video.scheduledTime),
                  video.duration,
                ].filter(Boolean);
                return (
                  <>
                    {items.map((item, i) => (
                      <span key={i} className="flex items-center gap-2">
                        {item}
                        {i < items.length - 1 && (
                          <span className="opacity-30">·</span>
                        )}
                      </span>
                    ))}
                    {video.category && (
                      <span className="ml-1">
                        <CategoryPill
                          category={video.category}
                          label={
                            tCategory.has(video.category)
                              ? tCategory(video.category)
                              : video.category
                          }
                          href={`/?category=${encodeURIComponent(video.category)}`}
                        />
                      </span>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 text-sm">
              <ExternalLink
                href={localizeWebtvAssetUrl(video.url, uiLocale)}
                className="text-primary hover:underline"
              >
                UN Web TV →
              </ExternalLink>
              {video.pvSymbol && video.pvAvailable && (
                <ExternalLink
                  href={getPVDocumentUrl(video.pvSymbol)}
                  className="text-primary hover:underline"
                >
                  {video.pvSymbol} (PDF) →
                </ExternalLink>
              )}
            </div>

            {metadata.summary && (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
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
              isLoggedIn={isLoggedIn}
              pvSymbol={
                video.pvAvailable && video.pvSymbol ? video.pvSymbol : undefined
              }
              initialTranscript={initialTranscript}
            />
          </div>

          {/* RIGHT — sticky sidebar */}
          <div className="hidden lg:block lg:flex-[2]">
            <div className="lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-2rem)] lg:flex-col">
              {/* Mini-player title — shown only when docked.
                  Wrapped in a div: a bare h2 here would be a direct flex
                  child of the sticky container, and flex blockifies the
                  `display: -webkit-box` that line-clamp-2 needs to
                  `display: flow-root`, collapsing the title to ~5px. */}
              {isVideoDocked && (
                <div className="shrink-0">
                  <h2
                    className={cn(
                      typography.speakerLabel,
                      "mb-1.5 line-clamp-2 leading-snug",
                    )}
                  >
                    {video.cleanTitle}
                  </h2>
                </div>
              )}

              {/* Landing zone: video docks here when scrolled past */}
              <div
                ref={landingZoneRef}
                className={`shrink-0 overflow-hidden rounded-lg bg-black ${
                  isVideoDocked ? "mb-2 aspect-video w-full" : "h-0"
                }`}
              />

              {/* Topics — offset so header aligns with first speaker label,
                  pills align with paragraph box. The transcript disclaimer
                  bubble adds 60.75px above the first speech bubble (2px
                  borders + 24px padding + one 22.75px body line + 12px mb-3
                  below; its mt-2 collapses into the toolbar's mb-3), so
                  mirror its visibility condition (see TranscriptionPanel)
                  and grow the offset by exactly that amount. Measured with
                  Playwright at 1440px. */}
              <div
                className={`shrink-0 ${
                  isVideoDocked
                    ? "mt-2"
                    : panelData?.viewMode !== "pv" &&
                        (panelData?.hasSegments || panelData?.hasRawParagraphs)
                      ? "mt-[108.75px]"
                      : "mt-[48px]"
                }`}
              >
                {topicPills}
              </div>

              {/* Speakers — collapsible, scrollable. Shows speakers for the active tab only. */}
              {((panelData?.viewMode === "pv" &&
                (panelData.pvSpeakers?.length ?? 0) > 0) ||
                (panelData?.viewMode === "transcript" &&
                  panelData.segments?.some((segment) =>
                    hasMeaningfulSpeakerInfo(
                      panelData.speakerMappings[
                        (segment.statementIndices[0] ?? 0).toString()
                      ],
                    ),
                  ))) && (
                <div className="flex min-h-0 flex-1 flex-col">
                  <button
                    onClick={() => setSpeakersOpen((v) => !v)}
                    className={cn(
                      typography.speakerLabel,
                      "mb-1 flex shrink-0 items-center gap-1",
                    )}
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
                      ) : panelData?.viewMode === "transcript" &&
                        panelData?.segments ? (
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
