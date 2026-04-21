"use client";

import { useState, useEffect, useRef } from "react";
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
  checking: boolean;
  stage: Stage;
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
  checking,
  stage,
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

  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Transcript
      </h2>

      {availableLanguages.length > 0 && (
        <div className="relative" ref={languageButtonRef}>
          <button
            onClick={() => setShowLanguageMenu(!showLanguageMenu)}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted/50"
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
                  {lang.available &&
                    lang.transcriptStatus === "completed" && (
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

      {(pvSymbol ||
        (hasSegments && (hasPropositions || hasTopics))) && (
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
        {!hasSegments && !hasRawParagraphs && !checking && stage === "idle" && (
          <>
            <button
              onClick={onTranscribe}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Generate
            </button>
            {(videoStatus === "live" || videoStatus === "scheduled") && (
              <button
                onClick={onSchedule}
                className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
                title="Queue transcript to start automatically when recording ends"
              >
                Schedule
              </button>
            )}
          </>
        )}
        {!hasSegments &&
          !hasRawParagraphs &&
          !checking &&
          stage === "scheduled" && (
            <span className="text-xs text-muted-foreground">
              Transcript scheduled — starts automatically when recording ends
            </span>
          )}
        {(hasSegments || hasRawParagraphs) && (
          <>
            <div className="relative">
              <button
                onClick={handleShare}
                className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
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
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
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
