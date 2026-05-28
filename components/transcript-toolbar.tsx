"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  FileText,
  BarChart3,
  Globe,
  BookOpen,
} from "lucide-react";
import type { LanguageOption } from "@/components/transcription-panel";
import type { Stage } from "@/components/stage-progress";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";
import { SubscribeToggle } from "@/components/subscribe-toggle";

export type ViewMode = "transcript" | "analysis" | "pv";

interface TranscriptToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  selectedLanguage: string;
  availableLanguages: LanguageOption[];
  onLanguageChange: (language: string) => void;
  pvSymbol?: string;
  hasSegments: boolean;
  hasRawParagraphs: boolean;
  hasPropositions: boolean;
  hasTopics: boolean;
  isLoggedIn: boolean;
  checking: boolean;
  stage: Stage;
  starting: boolean;
  kalturaId: string;
  videoStatus?: string;
  videoSlug?: string;
  onTranscribe: () => void;
  onSchedule: () => void;
  onShare: () => void;
  onDownloadDocx: () => void;
  onDownloadExcel: () => void;
}

export function TranscriptToolbar({
  viewMode,
  onViewModeChange,
  selectedLanguage,
  availableLanguages,
  onLanguageChange,
  pvSymbol,
  hasSegments,
  hasRawParagraphs,
  hasPropositions,
  hasTopics,
  isLoggedIn,
  checking,
  stage,
  starting,
  kalturaId,
  videoStatus,
  videoSlug,
  onTranscribe,
  onSchedule,
  onShare,
  onDownloadDocx,
  onDownloadExcel,
}: TranscriptToolbarProps) {
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [showCopied, setShowCopied] = useState(false);
  const languageButtonRef = useRef<HTMLDivElement>(null);
  const downloadButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        downloadButtonRef.current &&
        !downloadButtonRef.current.contains(event.target as Node)
      ) {
        setShowDownloadMenu(false);
      }
      if (
        languageButtonRef.current &&
        !languageButtonRef.current.contains(event.target as Node)
      ) {
        setShowLanguageMenu(false);
      }
    };

    if (showDownloadMenu || showLanguageMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showDownloadMenu, showLanguageMenu]);

  const selectedLangName =
    availableLanguages.find((l) => l.code === selectedLanguage)?.name ??
    (selectedLanguage === "en" ? "English" : selectedLanguage.toUpperCase());

  const handleShare = async () => {
    await onShare();
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 4000);
  };

  // No recording yet → can only queue ("generate when available"); otherwise
  // generate now.
  const audioAvailable = videoStatus !== "live" && videoStatus !== "scheduled";

  const hasContent = hasSegments || hasRawParagraphs;
  // The bell is a pure subscribe toggle, shown only when a transcript is
  // genuinely pending (queued or running) — that's the only time a "notify me
  // when ready" promise can actually resolve. Logged-in users only.
  const isPending =
    stage === "scheduled" ||
    stage === "transcribing" ||
    stage === "identifying_speakers" ||
    stage === "analyzing_topics";
  const showBell = isLoggedIn && !hasContent && !checking && isPending;

  // View tabs that will actually render: Transcript (always) + Analysis
  // (signed-in only) + Verbatim/Summary record (when a PV symbol exists).
  // Hide the toggle entirely when it would offer only a single option.
  const viewTabCount = 1 + (isLoggedIn ? 1 : 0) + (pvSymbol ? 1 : 0);

  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className={typography.sectionTitle}>Transcript</h2>

      {availableLanguages.length > 0 && (
        <div className="relative" ref={languageButtonRef}>
          <button
            onClick={() => setShowLanguageMenu(!showLanguageMenu)}
            className={cn(
              typography.label,
              "flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 transition-colors hover:bg-muted/50",
            )}
          >
            <Globe className="h-3 w-3" />
            {selectedLangName}
            <ChevronDown className="h-3 w-3" />
          </button>
          {showLanguageMenu && (
            <div className="absolute left-0 z-10 mt-1 w-52 overflow-hidden rounded-md border border-border bg-background shadow-md">
              {availableLanguages.map((lang) => (
                <button
                  key={lang.code}
                  disabled={!lang.available}
                  onClick={() => {
                    if (lang.available) {
                      onLanguageChange(lang.code);
                      setShowLanguageMenu(false);
                    }
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                    !lang.available
                      ? "cursor-not-allowed text-muted-foreground/40"
                      : lang.code === selectedLanguage
                        ? "bg-muted/50 font-medium"
                        : "hover:bg-muted"
                  }`}
                >
                  <span className="flex-1">{lang.name}</span>
                  {!lang.available && (
                    <span className="text-[10px] text-muted-foreground/40">
                      No audio
                    </span>
                  )}
                  {lang.code === selectedLanguage && (
                    <Check className="h-3 w-3 text-primary" />
                  )}
                  {lang.available && lang.transcriptStatus === "completed" && (
                    <span
                      className="h-2 w-2 rounded-full bg-green-500"
                      title="Transcript available"
                    />
                  )}
                  {lang.available &&
                    lang.transcriptStatus &&
                    lang.transcriptStatus !== "completed" &&
                    lang.transcriptStatus !== "error" && (
                      <span
                        className="h-2 w-2 animate-pulse rounded-full bg-amber-500"
                        title="In progress"
                      />
                    )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {(pvSymbol || (hasSegments && (hasPropositions || hasTopics))) &&
        viewTabCount >= 2 && (
          <div className="flex rounded-md border border-border bg-muted">
            <button
              onClick={() => onViewModeChange("transcript")}
              className={`flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-xs transition-colors ${
                viewMode === "transcript"
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="h-3 w-3" />
              Transcript
            </button>
            {isLoggedIn && (
              <button
                onClick={() => onViewModeChange("analysis")}
                className={`flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-xs transition-colors ${
                  viewMode === "analysis"
                    ? "bg-background text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                disabled={stage !== "completed" && !hasPropositions}
                title={
                  stage !== "completed" && !hasPropositions
                    ? "Transcription must complete before analysis"
                    : undefined
                }
              >
                <BarChart3 className="h-3 w-3" />
                Analysis
              </button>
            )}
            {pvSymbol && (
              <button
                onClick={() => onViewModeChange("pv")}
                className={`flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-xs transition-colors ${
                  viewMode === "pv"
                    ? "bg-background text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <BookOpen className="h-3 w-3" />
                {pvSymbol?.includes("/SR.")
                  ? "Summary Record"
                  : "Verbatim Record"}
              </button>
            )}
          </div>
        )}

      <div className="ml-auto flex gap-2">
        {starting && (
          <button
            disabled
            className={cn(
              typography.label,
              "flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-primary-foreground opacity-70",
            )}
          >
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Generating…
          </button>
        )}

        {/* Idle: production trigger. Generate now if the recording exists,
            else queue it to run automatically once it does. Anonymous users
            see a sign-in prompt instead — generation requires login so it can
            be attributed and counted against the per-user daily cap. */}
        {!hasContent && !checking && stage === "idle" && !starting && (
          isLoggedIn ? (
            <button
              onClick={audioAvailable ? onTranscribe : onSchedule}
              className={cn(
                typography.label,
                "rounded-md bg-primary px-2.5 py-1 text-primary-foreground transition-opacity hover:opacity-90",
              )}
              title={
                audioAvailable
                  ? undefined
                  : "Queues the transcript to be generated automatically once the recording is available"
              }
            >
              {audioAvailable ? "Generate transcript" : "Generate when available"}
            </button>
          ) : (
            <Link
              href="/login"
              className={cn(
                typography.label,
                "rounded-md bg-primary px-2.5 py-1 text-primary-foreground transition-opacity hover:opacity-90",
              )}
              title="Generating a transcript requires a free account"
            >
              Sign in to transcribe
            </Link>
          )
        )}

        {/* Bell: pure subscribe toggle, only while a transcript is pending. */}
        {showBell && (
          <SubscribeToggle kalturaId={kalturaId} language={selectedLanguage} />
        )}
        {(hasSegments || hasRawParagraphs) && (
          <>
            <div className="relative">
              <button
                onClick={handleShare}
                className={cn(
                  typography.label,
                  "rounded-md border border-border px-2.5 py-1 transition-colors hover:bg-muted",
                )}
              >
                Share
              </button>
              {showCopied && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background">
                  Link copied to clipboard!
                </div>
              )}
            </div>
            <div className="relative" ref={downloadButtonRef}>
              <button
                onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                className={cn(
                  typography.label,
                  "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 transition-colors hover:bg-muted",
                )}
              >
                Download
                <ChevronDown className="h-3 w-3" />
              </button>
              {showDownloadMenu && (
                <div className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-md border border-border bg-background shadow-md">
                  <button
                    onClick={() => {
                      onDownloadDocx();
                      setShowDownloadMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                  >
                    Text Document
                  </button>
                  <button
                    onClick={() => {
                      onDownloadExcel();
                      setShowDownloadMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                  >
                    Excel Table
                  </button>
                  <button
                    onClick={() => {
                      window.open(`/json/${videoSlug}`, "_blank");
                      setShowDownloadMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                  >
                    JSON API
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
