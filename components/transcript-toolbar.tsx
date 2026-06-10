"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Check,
  ChevronDown,
  FileText,
  BarChart3,
  Globe,
  BookOpen,
  Share2,
  Download,
} from "lucide-react";
import type { LanguageOption } from "@/components/transcription-panel";
import type { Stage } from "@/components/stage-progress";
import { useLanguageDisplayName } from "@/lib/hooks/use-language-display-name";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  onDownloadTxt: () => void;
  onDownloadSrt: () => void;
  onDownloadVtt: () => void;
  onCopyToClipboard: () => Promise<boolean>;
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
  onDownloadTxt,
  onDownloadSrt,
  onDownloadVtt,
  onCopyToClipboard,
}: TranscriptToolbarProps) {
  const [languageOpen, setLanguageOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  // null when no toast is showing; "link" after Share copies the page URL;
  // "transcript" after the "Copy to clipboard" menu item copies the full text.
  // Two states + one shared 4s dismiss keeps the toast slot single while
  // letting each action surface its own label.
  const [copyToast, setCopyToast] = useState<"link" | "transcript" | null>(
    null,
  );
  const t = useTranslations("transcript.toolbar");
  const displayName = useLanguageDisplayName();

  const selectedLangName = displayName(selectedLanguage);

  const flashToast = (kind: "link" | "transcript") => {
    setCopyToast(kind);
    setTimeout(() => setCopyToast(null), 4000);
  };

  const handleShare = async () => {
    await onShare();
    flashToast("link");
  };

  const handleCopyToClipboard = async () => {
    const ok = await onCopyToClipboard();
    if (ok) flashToast("transcript");
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
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={typography.sectionTitle}>{t("transcript")}</h2>
        {availableLanguages.length > 0 && (
        <Popover open={languageOpen} onOpenChange={setLanguageOpen}>
          <PopoverTrigger
            className={cn(
              typography.label,
              "flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            <Globe className="h-3 w-3" />
            {selectedLangName}
            <ChevronDown className="h-3 w-3" />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-52 overflow-hidden p-0"
          >
            <ul role="menu" className="flex flex-col">
              {availableLanguages.map((lang) => (
                <li key={lang.code} role="none">
                  <button
                    role="menuitem"
                    disabled={!lang.available}
                    onClick={() => {
                      if (lang.available) {
                        onLanguageChange(lang.code);
                        setLanguageOpen(false);
                      }
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                      !lang.available
                        ? "cursor-not-allowed text-muted-foreground/40"
                        : lang.code === selectedLanguage
                          ? "bg-muted/50 font-medium"
                          : "hover:bg-muted",
                    )}
                  >
                    <span className="flex-1">{displayName(lang.code)}</span>
                    {!lang.available && (
                      <span className="text-[10px] text-muted-foreground/40">
                        {t("noAudio")}
                      </span>
                    )}
                    {lang.code === selectedLanguage && (
                      <Check className="h-3 w-3 text-primary" />
                    )}
                    {lang.available && lang.transcriptStatus === "completed" && (
                      <span
                        className="h-2 w-2 rounded-full bg-green-500"
                        title={t("transcriptAvailable")}
                      />
                    )}
                    {lang.available &&
                      lang.transcriptStatus &&
                      lang.transcriptStatus !== "completed" &&
                      lang.transcriptStatus !== "error" && (
                        <span
                          className="h-2 w-2 animate-pulse rounded-full bg-amber-500"
                          title={t("inProgress")}
                        />
                      )}
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}

      {(pvSymbol || (hasSegments && (hasPropositions || hasTopics))) &&
        viewTabCount >= 2 && (
          <div
            role="tablist"
            className="flex rounded-md border border-border bg-muted"
          >
            <button
              role="tab"
              aria-selected={viewMode === "transcript"}
              onClick={() => onViewModeChange("transcript")}
              className={cn(
                "flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                viewMode === "transcript"
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <FileText className="h-3 w-3" />
              {t("transcript")}
            </button>
            {isLoggedIn && (
              <button
                role="tab"
                aria-selected={viewMode === "analysis"}
                onClick={() => onViewModeChange("analysis")}
                className={cn(
                  "flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  viewMode === "analysis"
                    ? "bg-background text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                disabled={stage !== "completed" && !hasPropositions}
                title={
                  stage !== "completed" && !hasPropositions
                    ? t("transcriptionMustComplete")
                    : undefined
                }
              >
                <BarChart3 className="h-3 w-3" />
                {t("analysis")}
              </button>
            )}
            {pvSymbol && (
              <button
                role="tab"
                aria-selected={viewMode === "pv"}
                onClick={() => onViewModeChange("pv")}
                className={cn(
                  "flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  viewMode === "pv"
                    ? "bg-background text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <BookOpen className="h-3 w-3" />
                {pvSymbol?.includes("/SR.")
                  ? t("summaryRecord")
                  : t("verbatimRecord")}
              </button>
            )}
          </div>
        )}

        </div>
        <div className="flex items-center gap-2">
        {starting && (
          <button
            disabled
            className={cn(
              typography.label,
              "flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-primary-foreground opacity-70",
            )}
          >
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {t("generating")}
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
                "rounded-md bg-primary px-2.5 py-1 text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
              title={
                audioAvailable ? undefined : t("generateWhenAvailableTooltip")
              }
            >
              {audioAvailable
                ? t("generateTranscript")
                : t("generateWhenAvailable")}
            </button>
          ) : (
            <Link
              href="/login"
              className={cn(
                typography.label,
                "rounded-md bg-primary px-2.5 py-1 text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
              title={t("signInRequiredTooltip")}
            >
              {t("signInToTranscribe")}
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
                aria-label={t("share")}
                className={cn(
                  typography.label,
                  "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <Share2 className="h-3.5 w-3.5 sm:hidden" />
                <span className="hidden sm:inline">{t("share")}</span>
              </button>
              {/* Toast: announce to AT via aria-live, visible toast above.
                  Same slot for both Share ("link") and Copy ("transcript") —
                  they never fire simultaneously. */}
              <div
                role="status"
                aria-live="polite"
                className="sr-only"
              >
                {copyToast === "link"
                  ? t("linkCopied")
                  : copyToast === "transcript"
                    ? t("copiedToClipboard")
                    : ""}
              </div>
              {copyToast !== null && (
                <div
                  aria-hidden="true"
                  className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background"
                >
                  {copyToast === "link"
                    ? t("linkCopied")
                    : t("copiedToClipboard")}
                </div>
              )}
            </div>
            <Popover open={downloadOpen} onOpenChange={setDownloadOpen}>
              <PopoverTrigger
                aria-label={t("download")}
                className={cn(
                  typography.label,
                  "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <Download className="h-3.5 w-3.5 sm:hidden" />
                <span className="hidden sm:inline">{t("download")}</span>
                <ChevronDown className="h-3 w-3" />
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-44 overflow-hidden p-0"
              >
                <ul role="menu" className="flex flex-col">
                  <li role="none">
                    <button
                      role="menuitem"
                      onClick={() => {
                        handleCopyToClipboard();
                        setDownloadOpen(false);
                      }}
                      className="w-full border-b border-border px-3 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      {t("copyToClipboard")}
                    </button>
                  </li>
                  <li role="none">
                    <button
                      role="menuitem"
                      onClick={() => {
                        onDownloadDocx();
                        setDownloadOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      {t("downloadDocx")}
                    </button>
                  </li>
                  <li role="none">
                    <button
                      role="menuitem"
                      onClick={() => {
                        onDownloadTxt();
                        setDownloadOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      {t("downloadTxt")}
                    </button>
                  </li>
                  <li role="none">
                    <button
                      role="menuitem"
                      onClick={() => {
                        onDownloadExcel();
                        setDownloadOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      {t("downloadExcel")}
                    </button>
                  </li>
                  <li role="none">
                    <button
                      role="menuitem"
                      onClick={() => {
                        onDownloadSrt();
                        setDownloadOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      {t("downloadSrt")}
                    </button>
                  </li>
                  <li role="none">
                    <button
                      role="menuitem"
                      onClick={() => {
                        onDownloadVtt();
                        setDownloadOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      {t("downloadVtt")}
                    </button>
                  </li>
                  <li role="none">
                    <button
                      role="menuitem"
                      onClick={() => {
                        window.open(`/json/${videoSlug}`, "_blank");
                        setDownloadOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      {t("downloadJson")}
                    </button>
                  </li>
                </ul>
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>
    </div>
  );
}
