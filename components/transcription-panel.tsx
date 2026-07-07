"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { setUrlParam } from "@/lib/url-params";
import type { SpeakerMapping } from "@/lib/speakers";
import type { Video } from "@/lib/un-api";
import { getCountryName } from "@/lib/country-lookup";
import { useScrollToActive } from "@/lib/hooks/use-scroll-to-active";
import { BarChart3 } from "lucide-react";
import { PVPanel, type PVSpeakerEntry } from "@/components/pv-panel";
import { useMeetingState } from "@/components/meeting-state/meeting-state";
import { TranscriptSkeleton } from "@/components/transcript-skeleton";
import ExcelJS from "exceljs";
import type { Proposition } from "@/lib/pipeline";
import { StageProgress, type Stage } from "@/components/stage-progress";
import { AnalysisView } from "@/components/analysis-view";
import { usePlaybackTracking } from "@/lib/hooks/use-playback-tracking";
import { useMeetingFormat } from "@/lib/hooks/use-meeting-format";
import {
  formatTimecode,
  formatSpeakerText,
  formatTranscriptAsPlainText,
  buildSpeakerSegments,
} from "@/lib/transcript-formatting";
import {
  TranscriptToolbar,
  type ViewMode,
} from "@/components/transcript-toolbar";
import { TranscriptView } from "@/components/transcript-view";
import { RawTranscriptView } from "@/components/raw-transcript-view";
import { FlaggedTranscriptBanner } from "@/components/flagged-transcript-banner";
import { Link } from "@/i18n/navigation";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

export interface LanguageOption {
  code: string;
  name: string;
  available: boolean;
  transcriptStatus: string | null;
}

interface RawParagraph {
  text: string;
  start: number;
  end: number;
  words: Array<{ text: string; start: number; end: number; speaker?: string }>;
}

// Official UN accent palette ("True Values" from un_brand_colour_palette.pdf).
// Used here per the guide: accents are intended for "instances when large
// amounts of information need to be differentiated by colour, such as in
// charts, graphs or maps." Assignment is by index (no semantic mapping).
export const TOPIC_COLOR_PALETTE = [
  "#009EDB", // UN Blue
  "#72BF44", // Green
  "#FFC800", // Yellow
  "#F58220", // Orange
  "#ED1847", // Red
  "#A05FB4", // Purple
  "#AEA29A", // Gray
];

export function getTopicColor(
  _topicKey: string,
  _allTopicKeys: string[],
): string {
  return TOPIC_COLOR_PALETTE[0];
}

export interface TranscriptionPanelData {
  segments: SpeakerSegment[] | null;
  statements: Statement[] | null;
  speakerMappings: SpeakerMapping;
  countryNames: Map<string, string>;
  topics: Record<string, { key: string; label: string; description: string }>;
  activeSegmentIndex: number;
  hasPropositions: boolean;
  stage: Stage;
  checking: boolean;
  hasSegments: boolean;
  hasRawParagraphs: boolean;
  pvSpeakers?: PVSpeakerEntry[] | null;
  pvActiveTurnIndex?: number;
  viewMode?: string;
}

/**
 * Pre-loaded transcript data the meeting page can pass when it was already
 * fetched server-side. When this is supplied, the panel skips its first
 * /api/transcripts/check round-trip on mount; the transcript is in the
 * initial HTML payload (visible to no-JS crawlers) and the first paint
 * happens at hydration instead of after a network call.
 *
 * Word-level timing is intentionally absent — the panel fetches it lazily
 * from /api/transcripts/[id]/words, same as the /check fast path.
 */
export interface InitialTranscript {
  statements: Statement[];
  speakerMappings: SpeakerMapping;
  topics: Record<string, { key: string; label: string; description: string }>;
  propositions: Proposition[];
  transcriptId: string;
  language: string;
  analysisStatus: "none" | "analyzing" | "completed" | "error" | "interrupted";
}

interface TranscriptionPanelProps {
  kalturaId: string;
  video: Video;
  isLoggedIn: boolean;
  pvSymbol?: string;
  initialTranscript?: InitialTranscript | null;
}

interface Word {
  text: string;
  speaker?: string | null;
  start: number;
  end: number;
}

interface SpeakerSegment {
  speaker: string;
  statementIndices: number[];
  timestamp: number;
}

interface Statement {
  paragraphs: Array<{
    sentences: Array<{
      text: string;
      start: number;
      end: number;
      topic_keys?: string[];
      words?: Word[];
    }>;
    start: number;
    end: number;
    // Words are optional at every level: the /api/transcripts/check fast
    // path and the SSR pre-load both strip them for speed, and the panel
    // re-merges them in once /api/transcripts/[id]/words returns.
    words?: Word[];
  }>;
  start: number;
  end: number;
  words?: Word[];
}

export function TranscriptionPanel({
  kalturaId,
  video,
  isLoggedIn,
  pvSymbol,
  initialTranscript,
}: TranscriptionPanelProps) {
  // Chrome-side state (player, language switcher, topic filter, sidebar
  // data) lives in MeetingStateContext so we can stay in sync with
  // VideoPageClient now that the panel is its sibling, not its child.
  const {
    player,
    selectedLanguage,
    selectLanguage: onLanguageChange,
    availableLanguages,
    refreshLanguages: onLanguagesRefresh,
    selectedTopic,
    setSelectedTopic: onTopicSelect,
    topicCollapsed,
    setTopicCollapsed: onTopicCollapsedChange,
    setPanelData: onDataChange,
  } = useMeetingState();
  // Server-fetched data is only "initial" when it matches the URL locale.
  // After a language switch the panel falls back to the /check fast path,
  // and the initial value is no longer relevant.
  const hasMatchingInitial =
    !!initialTranscript && initialTranscript.language === selectedLanguage;

  const [stage, setStage] = useState<Stage>(
    hasMatchingInitial ? "completed" : "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(!hasMatchingInitial);
  const [speakerMappings, setSpeakerMappings] = useState<SpeakerMapping>(
    hasMatchingInitial ? initialTranscript!.speakerMappings : {},
  );
  const [topics, setTopics] = useState<
    Record<string, { key: string; label: string; description: string }>
  >(hasMatchingInitial ? initialTranscript!.topics : {});
  const [statements, setStatements] = useState<Statement[] | null>(
    hasMatchingInitial ? initialTranscript!.statements : null,
  );
  const [rawParagraphs, setRawParagraphs] = useState<RawParagraph[] | null>(
    null,
  );
  const [transcriptId, setTranscriptId] = useState<string | null>(
    hasMatchingInitial ? initialTranscript!.transcriptId : null,
  );
  const [pvSpeakers, setPvSpeakers] = useState<PVSpeakerEntry[] | null>(null);
  const [pvActiveTurnIndex, setPvActiveTurnIndex] = useState<number>(-1);
  const [propositions, setPropositions] = useState<Proposition[]>(
    hasMatchingInitial ? initialTranscript!.propositions : [],
  );
  // Deep-linkable view: `?view=pv` / `?view=analysis` (transcript is the
  // default and carries no param). Gate the initial read against what actually
  // exists for this viewer — a `pv` link needs a PV symbol, an `analysis` link
  // needs a signed-in user (the analysis tab isn't rendered otherwise) — so a
  // stale/forged param falls back to the transcript rather than an empty tab.
  const searchParams = useSearchParams();
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const v = searchParams.get("view");
    if (v === "pv" && pvSymbol) return "pv";
    if (v === "analysis" && isLoggedIn) return "analysis";
    return "transcript";
  });
  // Wrap the setter so a tab switch reflects into `?view=`, dropping the param
  // for the transcript default. Pure client state — replaceState only, no
  // navigation (see lib/url-params.ts).
  const changeViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setUrlParam("view", mode === "transcript" ? undefined : mode);
  }, []);
  const [analyzingPropositions, setAnalyzingPropositions] = useState(false);
  // Realignment-flagged state — set when the displayed transcript is a
  // completed row whose audio was re-cut by WebTV in a way no single offset
  // could fix. Drives the disclaimer banner above the transcript.
  const [flagged, setFlagged] = useState(false);
  const [sourceDurationMs, setSourceDurationMs] = useState<number | null>(null);
  const [alignedDurationMs, setAlignedDurationMs] = useState<number | null>(
    null,
  );
  // When a fresh transcription has been requested for this flagged row, the
  // in-flight transcript id + its stage label drive the banner's "in progress"
  // state. Polling for this id runs separately from the main display state so
  // the old completed content stays visible until the new run finishes.
  const [pendingRetranscribeId, setPendingRetranscribeId] = useState<
    string | null
  >(null);
  const [pendingRetranscribeStage, setPendingRetranscribeStage] =
    useState<Stage | null>(null);
  const [retranscribeStarting, setRetranscribeStarting] = useState(false);
  const [retranscribeError, setRetranscribeError] = useState<string | null>(
    null,
  );
  const t = useTranslations("transcript.panel");
  const locale = useLocale();
  // Covers the POST round-trip (click → response) so the Generate button can
  // show instant feedback before the server resolves Kaltura and starts polling.
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  // Cancels any in-flight cache check + polling when the language tab changes,
  // the kalturaId switches, or the component unmounts. Without this, a poll
  // loop started for `zh` keeps writing `setStage` / `setRawParagraphs` /
  // `setStatements` into the freshly-reset panel after the user switches to
  // `en`, so the new tab inherits the previous language's progress + preview.
  const pollAbortRef = useRef<AbortController | null>(null);

  // Derived from statements + speakerMappings. Computed during render so
  // it's part of the SSR output — without this, segments stays null until
  // hydration, the panel renders empty markup server-side, and the user
  // sees the skeleton swap to a near-blank panel for a frame before the
  // transcript appears. Cheap enough to recompute (a single pass over
  // statements grouping by speaker identity).
  const segments = useMemo<SpeakerSegment[] | null>(() => {
    if (!statements || Object.keys(speakerMappings).length === 0) return null;
    return buildSpeakerSegments(
      statements,
      speakerMappings,
    ) as SpeakerSegment[];
  }, [statements, speakerMappings]);

  const {
    activeSegmentIndex,
    activeStatementIndex,
    activeParagraphIndex,
    activeSentenceIndex,
    activeWordIndex,
    currentTimeRef,
  } = usePlaybackTracking(player, segments, statements);

  const handlePvSpeakersChange = useCallback(
    (speakers: PVSpeakerEntry[], activeIdx: number) => {
      setPvSpeakers(speakers);
      setPvActiveTurnIndex(activeIdx);
    },
    [],
  );

  const isLoading =
    stage !== "idle" &&
    stage !== "scheduled" &&
    stage !== "completed" &&
    stage !== "error";

  const formatTime = formatTimecode;
  const { meetingIsoDay, formatMeetingDate, formatMeetingTime } =
    useMeetingFormat();

  // Derived from speakerMappings + active UI locale. Computed during
  // render so it's in the SSR output. getCountryName is a pure lookup
  // against the vendored ISO snapshot (lib/country-lookup), no I/O.
  // Declared before its first use (getSpeakerText, below) so the React
  // Compiler can preserve this manual memoization — a useMemo referenced
  // before its source-order declaration triggers a compile bailout.
  const countryNames = useMemo<Map<string, string>>(() => {
    const names = new Map<string, string>();
    const iso3Codes = new Set<string>();
    Object.values(speakerMappings).forEach((info) => {
      if (info.affiliation && info.affiliation.length === 3)
        iso3Codes.add(info.affiliation);
    });
    for (const code of iso3Codes) {
      const name = getCountryName(code, locale);
      if (name) names.set(code, name);
    }
    return names;
  }, [speakerMappings, locale]);

  const getSpeakerText = (statementIndex: number | undefined): string =>
    formatSpeakerText(statementIndex, speakerMappings, countryNames);

  // Build a download filename whose date prefix matches what the page header
  // shows: derived from `scheduledTime` (a full UTC-ish ISO) interpreted in
  // the user's selected timezone, falling back to the WebTV schedule date
  // string when a meeting has no scheduled time. The slug keeps Unicode
  // letters/digits (so French/Arabic/Chinese titles survive) and collapses
  // every other run into a single underscore. Adds HH-MM when known, and
  // tags the active language track so en/fr/etc. don't collide.
  const baseFileName = () => {
    const dateSource = video.scheduledTime ?? video.date;
    const datePart = meetingIsoDay(dateSource);
    const timePart = video.scheduledTime
      ? `_${formatMeetingTime(video.scheduledTime).replace(":", "-")}`
      : "";
    const titlePart = video.cleanTitle
      .slice(0, 50)
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "");
    return `${datePart}${timePart}_${titlePart}_${selectedLanguage}`;
  };

  const seekToTimestamp = (timestamp: number) => {
    if (!player) return;
    try {
      player.currentTime = timestamp;
      player.play();
    } catch (err) {
      console.error("Failed to seek:", err);
    }
  };

  // Lazy word-level timestamps. The /api/transcripts/check fast path strips
  // words[] from its response (63% of payload) so first paint is fast; this
  // pulls them in once the transcript is on screen and merges by index so
  // sentence-level karaoke highlight + click-to-seek light up after a beat.
  // The polling paths (pollForCompletion / pollRetranscribeUntilDone) still
  // receive full word data, so we only fire this after the /check fast path.
  const loadWords = useCallback(async (tid: string, signal: AbortSignal) => {
    try {
      const res = await fetch(
        `/api/transcripts/${encodeURIComponent(tid)}/words`,
        { signal },
      );
      if (signal.aborted) return;
      if (!res.ok) return;
      const { statements: wordsByStatement } = (await res.json()) as {
        statements: Array<{
          words?: Word[];
          paragraphs: Array<{
            words?: Word[];
            sentences: Array<{ words?: Word[] }>;
          }>;
        }>;
      };
      if (signal.aborted || !wordsByStatement) return;
      setStatements((prev) => {
        if (!prev) return prev;
        return prev.map((stmt, si) => {
          const wstmt = wordsByStatement[si];
          if (!wstmt) return stmt;
          return {
            ...stmt,
            ...(wstmt.words ? { words: wstmt.words } : {}),
            paragraphs: stmt.paragraphs.map((para, pi) => {
              const wpara = wstmt.paragraphs[pi];
              if (!wpara) return para;
              return {
                ...para,
                ...(wpara.words ? { words: wpara.words } : {}),
                sentences: para.sentences.map((sent, sei) => {
                  const wsent = wpara.sentences[sei];
                  if (!wsent?.words) return sent;
                  return { ...sent, words: wsent.words };
                }),
              };
            }),
          };
        });
      });
    } catch {
      // Network error or aborted; the panel keeps working with
      // sentence-level seeks only.
    }
  }, []);

  useEffect(() => {
    onDataChange?.({
      segments,
      statements,
      speakerMappings,
      countryNames,
      topics,
      activeSegmentIndex,
      hasPropositions: propositions.length > 0,
      stage,
      checking,
      hasSegments: !!segments,
      hasRawParagraphs: !!rawParagraphs,
      pvSpeakers,
      pvActiveTurnIndex,
      viewMode,
    });
  }, [
    segments,
    speakerMappings,
    countryNames,
    topics,
    activeSegmentIndex,
    propositions,
    stage,
    checking,
    rawParagraphs,
    onDataChange,
    pvSpeakers,
    pvActiveTurnIndex,
    viewMode,
  ]);

  const handleTranscribe = async () => {
    // Guard against a double-click firing a second POST while one is in flight.
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setStage("transcribing");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kalturaId, language: selectedLanguage }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || errorData.error || "Transcription failed",
        );
      }
      const data = await response.json();
      // POST resolved — hand off to the stage list / polling. Clear before the
      // awaited pollForCompletion below (a finally would keep it set for the
      // entire transcription).
      startingRef.current = false;
      setStarting(false);
      setTranscriptId(data.transcriptId);
      if (data.statements && data.statements.length > 0) {
        setStatements(data.statements);
        if (data.topics) setTopics(data.topics);
        if (data.propositions) setPropositions(data.propositions);
        if (data.speakerMappings) setSpeakerMappings(data.speakerMappings);
        setStage("completed");
        onLanguagesRefresh?.();
        return;
      }
      if (data.stage) setStage(data.stage);
      if (data.raw_paragraphs) setRawParagraphs(data.raw_paragraphs);
      if (data.transcriptId) {
        // Bind to the active language's controller so a tab switch aborts the
        // long-running poll instead of leaking state into the new language.
        const signal =
          pollAbortRef.current?.signal ?? new AbortController().signal;
        await pollForCompletion(data.transcriptId, signal);
      }
    } catch (err) {
      startingRef.current = false;
      setStarting(false);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to transcribe",
      );
      setStage("error");
    }
  };

  const handleSchedule = async () => {
    try {
      const response = await fetch("/api/transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kalturaId,
          assetId: video.id,
          schedule: true,
          language: selectedLanguage,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message ||
            errorData.error ||
            "Failed to schedule transcript",
        );
      }
      setStage("scheduled");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to schedule transcript",
      );
      setStage("error");
    }
  };

  const pollForCompletion = async (tid: string, signal: AbortSignal) => {
    let pollCount = 0;
    const maxTranscriptionPolls = 200;

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (signal.aborted) return;
      pollCount++;

      let pollResponse: Response;
      try {
        pollResponse = await fetch(
          `/api/transcripts/${encodeURIComponent(tid)}`,
          { signal },
        );
      } catch (err) {
        if (signal.aborted) return;
        throw err;
      }
      if (!pollResponse.ok) throw new Error("Failed to poll transcript status");

      const data = await pollResponse.json();
      // Re-check after every await: language could have changed while the
      // response was in flight, in which case nothing on this row applies to
      // the now-visible panel.
      if (signal.aborted) return;
      if (data.stage) setStage(data.stage);
      if (data.raw_paragraphs && !rawParagraphs)
        setRawParagraphs(data.raw_paragraphs);

      if (data.statements?.length > 0) {
        setStatements(data.statements);
        if (
          data.speakerMappings &&
          Object.keys(data.speakerMappings).length > 0
        ) {
          setSpeakerMappings(data.speakerMappings);
        }
      }

      if (data.topics && Object.keys(data.topics).length > 0)
        setTopics(data.topics);
      if (data.propositions && data.propositions.length > 0)
        setPropositions(data.propositions);

      if (data.stage === "completed") break;
      if (data.stage === "error")
        throw new Error(data.error_message || "Pipeline failed");
      if (data.stage === "transcribing" && pollCount >= maxTranscriptionPolls) {
        throw new Error(
          "Transcription timeout - audio processing took too long",
        );
      }
    }
  };

  // Background poll for a fresh retranscribe kicked off against a flagged
  // row. Updates only the banner's stage label until the new transcript
  // completes; then swaps the main display state to the new content and
  // clears the flagged banner. Errors surface as `retranscribeError` without
  // touching the existing transcript display.
  const pollRetranscribeUntilDone = async (
    tid: string,
    signal: AbortSignal,
  ): Promise<void> => {
    let pollCount = 0;
    const maxPolls = 200;
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (signal.aborted) return;
      pollCount++;
      let res: Response;
      try {
        res = await fetch(`/api/transcripts/${encodeURIComponent(tid)}`, {
          signal,
        });
      } catch (err) {
        if (signal.aborted) return;
        throw err;
      }
      if (!res.ok) {
        setRetranscribeError("Failed to poll fresh transcription");
        setPendingRetranscribeId(null);
        setPendingRetranscribeStage(null);
        return;
      }
      const data = await res.json();
      if (signal.aborted) return;
      if (data.stage && data.stage !== "completed") {
        setPendingRetranscribeStage(data.stage);
      }
      if (data.stage === "error") {
        setRetranscribeError(
          data.error_message || "Fresh transcription failed",
        );
        setPendingRetranscribeId(null);
        setPendingRetranscribeStage(null);
        return;
      }
      if (data.stage === "completed" && data.statements?.length > 0) {
        // Swap the displayed transcript to the freshly produced one and clear
        // the flagged banner. (The new row was made from the current audio so
        // its source_duration_ms matches; the cron won't re-flag it.)
        setStatements(data.statements);
        if (data.topics) setTopics(data.topics);
        if (data.propositions) setPropositions(data.propositions);
        if (data.speakerMappings) setSpeakerMappings(data.speakerMappings);
        setTranscriptId(tid);
        setFlagged(false);
        setSourceDurationMs(null);
        setAlignedDurationMs(null);
        setPendingRetranscribeId(null);
        setPendingRetranscribeStage(null);
        setRetranscribeError(null);
        return;
      }
      if (pollCount >= maxPolls) {
        setRetranscribeError("Fresh transcription timeout");
        setPendingRetranscribeId(null);
        setPendingRetranscribeStage(null);
        return;
      }
    }
  };

  const handleRetranscribe = async () => {
    if (retranscribeStarting || pendingRetranscribeId) return;
    setRetranscribeStarting(true);
    setRetranscribeError(null);
    try {
      const res = await fetch("/api/transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kalturaId,
          language: selectedLanguage,
          retranscribe: true,
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message ||
            errorData.error ||
            "Failed to start fresh transcription",
        );
      }
      const data = await res.json();
      if (data.transcriptId) {
        setPendingRetranscribeId(data.transcriptId);
        setPendingRetranscribeStage(data.stage || "transcribing");
        const signal =
          pollAbortRef.current?.signal ?? new AbortController().signal;
        pollRetranscribeUntilDone(data.transcriptId, signal).catch(() => {
          // handled inside
        });
      }
    } catch (err) {
      setRetranscribeError(
        err instanceof Error
          ? err.message
          : "Failed to start fresh transcription",
      );
    } finally {
      setRetranscribeStarting(false);
    }
  };

  const handleRetry = () => {
    if (transcriptId) {
      setStage("transcribing");
      setErrorMessage(null);
      const signal =
        pollAbortRef.current?.signal ?? new AbortController().signal;
      pollForCompletion(transcriptId, signal).catch((err) => {
        if (signal.aborted) return;
        setErrorMessage(err instanceof Error ? err.message : "Retry failed");
        setStage("error");
      });
    } else {
      handleTranscribe();
    }
  };

  const handleRunAnalysis = async () => {
    if (!transcriptId) return;
    setAnalyzingPropositions(true);
    try {
      const response = await fetch(
        `/api/transcripts/${encodeURIComponent(transcriptId)}/analysis`,
        { method: "POST" },
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || data.error || "Analysis failed");
      }
      const data = await response.json();
      if (data.propositions) setPropositions(data.propositions);
    } catch (err) {
      console.error("Analysis failed:", err);
      setErrorMessage(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzingPropositions(false);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch (err) {
      console.error("Failed to copy URL:", err);
    }
  };

  const escapeRtf = (text: string): string => {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/{/g, "\\{")
      .replace(/}/g, "\\}")
      .replace(/[\u0080-\uffff]/g, (char) => {
        const code = char.charCodeAt(0);
        return `\\u${code}?`;
      });
  };

  const downloadDocx = () => {
    if (!segments || !statements) return;
    let rtf = "{\\rtf1\\ansi\\deff0\n";
    rtf += `{\\i ${escapeRtf(t("exportDisclaimer"))}}\\line\\line\n`;
    segments.forEach((segment) => {
      const firstStmtIndex = segment.statementIndices[0] ?? 0;
      rtf += `{\\b ${escapeRtf(getSpeakerText(firstStmtIndex))}`;
      if (segment.timestamp !== null)
        rtf += ` [${formatTime(segment.timestamp)}]`;
      rtf += ":}\\line\\line\n";
      segment.statementIndices.forEach((stmtIdx) => {
        const stmt = statements[stmtIdx];
        if (stmt) {
          stmt.paragraphs.forEach((para) => {
            const text = para.sentences.map((s) => s.text).join(" ");
            rtf += escapeRtf(text) + "\\line\\line\n";
          });
        }
      });
    });
    rtf += "}";
    const blob = new Blob([rtf], { type: "application/rtf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseFileName()}.rtf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = async () => {
    if (!segments) return;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Transcript");
    const topicList = Object.values(topics);
    const baseColumns = [
      { header: "Date", key: "date", width: 12 },
      { header: "Source Type", key: "source_type", width: 12 },
      { header: "Title", key: "title", width: 40 },
      { header: "URL", key: "url", width: 35 },
      { header: "Paragraph Number", key: "paragraph_number", width: 15 },
      { header: "Speaker Affiliation", key: "speaker_affiliation", width: 20 },
      { header: "Speaker Group", key: "speaker_group", width: 20 },
      { header: "Function", key: "function", width: 20 },
      { header: "Text", key: "text", width: 60 },
    ];
    const topicColumns = topicList.map((topic) => ({
      header: `Topic ${topic.label}`,
      key: `topic_${topic.key}`,
      width: 15,
    }));
    worksheet.columns = [...baseColumns, ...topicColumns];
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9D9D9" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "left" };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    let paragraphNumber = 1;
    segments.forEach((segment) => {
      segment.statementIndices.forEach((stmtIdx) => {
        const info = speakerMappings[stmtIdx.toString()];
        const stmt = statements?.[stmtIdx];
        if (stmt) {
          stmt.paragraphs.forEach((para) => {
            const text = para.sentences.map((s) => s.text).join(" ");
            const paragraphTopics = new Set<string>();
            para.sentences.forEach((sent) => {
              sent.topic_keys?.forEach((key) => paragraphTopics.add(key));
            });
            const rowData: Record<string, string | number> = {
              date: video.date,
              source_type: "WebTV",
              title: video.cleanTitle,
              url: video.url,
              paragraph_number: paragraphNumber++,
              speaker_affiliation: info?.affiliation
                ? countryNames.get(info.affiliation) || info.affiliation
                : "",
              speaker_group: info?.group || "",
              function: info?.function || "",
              text,
            };
            topicList.forEach((topic) => {
              rowData[`topic_${topic.key}`] = paragraphTopics.has(topic.key)
                ? "Yes"
                : "";
            });
            const row = worksheet.addRow(rowData);
            row.eachCell((cell) => {
              cell.alignment = {
                vertical: "top",
                horizontal: "left",
                wrapText: true,
              };
            });
          });
        }
      });
    });

    // Keep the disclaimer off the data sheet (row 1 stays the header for
    // anyone piping the file into pandas etc.) — it gets its own sheet.
    const notesSheet = workbook.addWorksheet("Notes");
    notesSheet.getColumn(1).width = 110;
    notesSheet.getCell("A1").value = t("exportDisclaimer");
    notesSheet.getCell("A2").value = window.location.href;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseFileName()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const triggerDownload = (
    text: string,
    extension: string,
    mimeType: string,
  ) => {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseFileName()}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildPlainTextBody = (): string | null => {
    if (!segments || !statements) return null;
    return formatTranscriptAsPlainText(
      segments,
      statements,
      (idx) => getSpeakerText(idx),
      formatTime,
    );
  };

  const downloadTxt = () => {
    const body = buildPlainTextBody();
    if (body === null) return;
    triggerDownload(
      `${t("exportDisclaimer")}\n\n---\n\n${body}`,
      "txt",
      "text/plain;charset=utf-8",
    );
  };

  // Returns true on a successful clipboard write so the toolbar can decide
  // whether to flash its "Copied to clipboard" toast.
  const copyToClipboard = async (): Promise<boolean> => {
    const body = buildPlainTextBody();
    if (body === null) return false;
    const pageUrl = window.location.href;
    const jsonUrl = `${window.location.origin}/${locale}/${video.slug}.json`;
    // Clipboard line is plain text, no schedule context — show the absolute
    // date only ("15 June 2026"), no weekday, no "Today" relative label.
    const dateDisplay = formatMeetingDate(video.scheduledTime ?? video.date, {
      weekday: "none",
      relative: "off",
    });
    const timeDisplay = video.scheduledTime
      ? formatMeetingTime(video.scheduledTime)
      : null;
    const whenLine = timeDisplay
      ? `Date: ${dateDisplay}, ${timeDisplay}`
      : `Date: ${dateDisplay}`;
    const header = [
      video.cleanTitle,
      whenLine,
      `Language: ${selectedLanguage}`,
      `Transcript: ${pageUrl}`,
      `JSON API: ${jsonUrl}`,
      t("exportDisclaimer"),
    ].join("\n");
    const text = `${header}\n\n---\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error("Failed to copy transcript to clipboard:", err);
      return false;
    }
  };

  // Format milliseconds as `HH:MM:SS,mmm` (SRT) or `HH:MM:SS.mmm` (VTT).
  const formatCueTime = (ms: number, separator: "," | ".") => {
    const safe = Math.max(0, Math.round(ms));
    const h = Math.floor(safe / 3600000);
    const m = Math.floor((safe % 3600000) / 60000);
    const s = Math.floor((safe % 60000) / 1000);
    const milli = safe % 1000;
    const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(milli, 3)}`;
  };

  type CaptionCue = { start: number; end: number; text: string };

  const buildCaptionCues = (): CaptionCue[] => {
    if (!segments || !statements) return [];
    const cues: CaptionCue[] = [];
    segments.forEach((segment) => {
      const speaker = getSpeakerText(segment.statementIndices[0] ?? 0);
      let isFirstSentenceOfSegment = true;
      segment.statementIndices.forEach((stmtIdx) => {
        const stmt = statements[stmtIdx];
        if (!stmt) return;
        stmt.paragraphs.forEach((para) => {
          para.sentences.forEach((sent) => {
            if (!sent.text.trim()) return;
            if (sent.end <= sent.start) return;
            const prefix = isFirstSentenceOfSegment ? `${speaker}: ` : "";
            cues.push({
              start: sent.start,
              end: sent.end,
              text: `${prefix}${sent.text.trim()}`,
            });
            isFirstSentenceOfSegment = false;
          });
        });
      });
    });
    return cues;
  };

  const downloadSrt = () => {
    const cues = buildCaptionCues();
    if (cues.length === 0) return;
    // SRT has no comment syntax, so the disclaimer rides as a short cue at
    // the very start (briefly visible in the player).
    const disclaimerEnd = Math.max(1000, Math.min(2000, cues[0].start));
    const disclaimerCue = `1\n${formatCueTime(0, ",")} --> ${formatCueTime(disclaimerEnd, ",")}\n[${t("exportDisclaimer")}]\n`;
    const body = [
      disclaimerCue,
      ...cues.map(
        (cue, i) =>
          `${i + 2}\n${formatCueTime(cue.start, ",")} --> ${formatCueTime(cue.end, ",")}\n${cue.text}\n`,
      ),
    ].join("\n");
    triggerDownload(body, "srt", "application/x-subrip;charset=utf-8");
  };

  const downloadVtt = () => {
    const cues = buildCaptionCues();
    if (cues.length === 0) return;
    const body =
      "WEBVTT\n\n" +
      `NOTE ${t("exportDisclaimer")}\n\n` +
      cues
        .map(
          (cue) =>
            `${formatCueTime(cue.start, ".")} --> ${formatCueTime(cue.end, ".")}\n${cue.text}\n`,
        )
        .join("\n");
    triggerDownload(body, "vtt", "text/vtt;charset=utf-8");
  };

  // Tracks the language we've already wired the panel for, so the effect
  // is a no-op when it re-fires with the same (kalturaId, selectedLanguage).
  // Critical for React Strict Mode dev double-invocation: a naive "consumed
  // once" boolean ran the skip-branch on the first invoke then the reset+
  // fetch branch on Strict Mode's second invoke, flipping `checking` true
  // for a frame and producing a spurious "Checking for existing transcript"
  // spinner even on pages whose SSR'd transcript was fully populated.
  // Compare against the actual deps instead — only do work when they
  // actually changed.
  const wiredKeyRef = useRef<string | null>(null);

  // Check cache on mount and language change
  useEffect(() => {
    const key = `${kalturaId}|${selectedLanguage}`;
    if (wiredKeyRef.current === key) return;
    const firstWire = wiredKeyRef.current === null;
    wiredKeyRef.current = key;

    if (firstWire && hasMatchingInitial) {
      // SSR pre-loaded statements, speakerMappings, topics, propositions
      // (and segments + countryNames are computed inline via useMemo, so
      // they're already in the SSR DOM). Only side-effect left to do is
      // pulling word-level timestamps for karaoke/click-to-seek.
      const ctrl = new AbortController();
      pollAbortRef.current = ctrl;
      setChecking(false);
      void loadWords(initialTranscript!.transcriptId, ctrl.signal);
      return () => ctrl.abort();
    }

    setStatements(null);
    setRawParagraphs(null);
    setTopics({});
    setPropositions([]);
    setSpeakerMappings({});
    setTranscriptId(null);
    setErrorMessage(null);
    setStage("idle");
    setChecking(true);
    setFlagged(false);
    setSourceDurationMs(null);
    setAlignedDurationMs(null);
    setPendingRetranscribeId(null);
    setPendingRetranscribeStage(null);
    setRetranscribeStarting(false);
    setRetranscribeError(null);

    const ctrl = new AbortController();
    pollAbortRef.current = ctrl;
    const signal = ctrl.signal;

    const checkCache = async () => {
      try {
        const response = await fetch(
          `/api/transcripts/check?kalturaId=${encodeURIComponent(kalturaId)}&language=${encodeURIComponent(selectedLanguage)}`,
          { signal },
        );
        if (signal.aborted) return;
        if (response.ok) {
          const data = await response.json();
          if (signal.aborted) return;
          if (data.transcriptId) setTranscriptId(data.transcriptId);
          if (data.statements && data.statements.length > 0) {
            setStatements(data.statements);
            // /api/transcripts/check returns statements WITHOUT word-level
            // timestamps for speed. Kick off the words fetch in parallel —
            // the transcript renders immediately with sentence-level seeks;
            // word-level karaoke/click lights up once /words arrives.
            if (data.transcriptId) {
              void loadWords(data.transcriptId, signal);
            }
            if (data.topics) setTopics(data.topics);
            if (data.propositions) setPropositions(data.propositions);
            if (data.speakerMappings) setSpeakerMappings(data.speakerMappings);
            // Analysis runs on its own axis — surface in-progress analysis so a
            // viewer who loads mid-analysis sees "Analyzing…" rather than the
            // Run button (and the transcript itself stays visible).
            setAnalyzingPropositions(data.analysis_status === "analyzing");
            setStage("completed");
            // Realignment-flagged state from the server (see lib/db.ts
            // isTranscriptFlagged). If a fresh retranscribe is already in
            // flight (any user kicked one off), surface that and start polling
            // so this viewer sees stage progress and the new transcript swaps
            // in automatically when it completes.
            if (data.flagged) {
              setFlagged(true);
              setSourceDurationMs(data.sourceDurationMs ?? null);
              setAlignedDurationMs(data.alignedDurationMs ?? null);
              if (data.pendingRetranscribeId) {
                setPendingRetranscribeId(data.pendingRetranscribeId);
                setPendingRetranscribeStage(
                  data.pendingRetranscribeStage ?? "transcribing",
                );
                pollRetranscribeUntilDone(
                  data.pendingRetranscribeId,
                  signal,
                ).catch(() => {
                  // pollRetranscribeUntilDone manages its own error state.
                });
              }
            }
            onLanguagesRefresh?.();
          } else if (data.raw_paragraphs) {
            setRawParagraphs(data.raw_paragraphs);
            if (data.stage) setStage(data.stage);
            if (data.transcriptId) {
              pollForCompletion(data.transcriptId, signal).catch((err) => {
                if (signal.aborted) return;
                setErrorMessage(
                  err instanceof Error ? err.message : "Pipeline failed",
                );
                setStage("error");
              });
            }
          } else if (data.stage === "scheduled") {
            // Queued — the cron starts it once audio is available. Show the
            // queued state to everyone but don't poll (nothing progresses yet).
            setStage("scheduled");
          } else if (
            data.stage &&
            data.stage !== "completed" &&
            data.transcriptId
          ) {
            // Transcription is in progress (started by anyone) — show its stage
            // and poll, so this viewer doesn't start a duplicate.
            setStage(data.stage);
            pollForCompletion(data.transcriptId, signal).catch((err) => {
              if (signal.aborted) return;
              setErrorMessage(
                err instanceof Error ? err.message : "Pipeline failed",
              );
              setStage("error");
            });
          }
        }
      } catch (err) {
        if (signal.aborted) return;
        console.log("Cache check failed:", err);
      } finally {
        if (!signal.aborted) setChecking(false);
      }
    };

    checkCache();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kalturaId, selectedLanguage]);

  // Auto-scroll to the active paragraph as playback advances. Respects manual
  // scrolling: won't yank the view if the user has scrolled the active
  // paragraph far out of view during continuous playback.
  useScrollToActive({
    activeKey:
      activeStatementIndex < 0 || activeParagraphIndex < 0
        ? null
        : `${activeStatementIndex}-${activeParagraphIndex}`,
    getElement: (key) =>
      document.querySelector<HTMLElement>(`[data-paragraph-key="${key}"]`),
    currentTimeRef,
    respectManualScroll: true,
  });

  return (
    <div>
      <TranscriptToolbar
        viewMode={viewMode}
        onViewModeChange={changeViewMode}
        selectedLanguage={selectedLanguage}
        availableLanguages={availableLanguages}
        onLanguageChange={onLanguageChange}
        pvSymbol={pvSymbol}
        hasSegments={!!segments}
        hasRawParagraphs={!!rawParagraphs}
        hasPropositions={propositions.length > 0}
        hasTopics={Object.keys(topics).length > 0}
        isLoggedIn={isLoggedIn}
        checking={checking}
        stage={stage}
        starting={starting}
        kalturaId={kalturaId}
        videoStatus={video.status}
        videoSlug={video.slug}
        onTranscribe={() => handleTranscribe()}
        onSchedule={handleSchedule}
        onShare={handleShare}
        onDownloadDocx={downloadDocx}
        onDownloadExcel={downloadExcel}
        onDownloadTxt={downloadTxt}
        onDownloadSrt={downloadSrt}
        onDownloadVtt={downloadVtt}
        onCopyToClipboard={copyToClipboard}
      />

      {/* Permanent provenance note for automatic transcripts, styled like the
          panel's other notification bubbles (FlaggedTranscriptBanner, the
          no-transcript hint) but in the neutral register since it is not an
          exceptional state. Scoped like the FlaggedTranscriptBanner: hidden in
          the PV view, where the content actually is the official record. */}
      {viewMode !== "pv" &&
        (segments || (rawParagraphs && rawParagraphs.length > 0)) && (
          <div className="mt-2 mb-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className={cn(typography.body, "text-muted-foreground")}>
              {t.rich("transcriptDisclaimer", {
                aboutLink: (chunks) => (
                  <Link
                    href="/about"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
        )}

      {checking && stage === "idle" && (
        // No spinner: show the same shape the Suspense fallback uses so the
        // transition from "panel mounted, still checking" to "panel has
        // transcript" doesn't look like a different kind of loading state.
        <TranscriptSkeleton />
      )}

      {stage === "scheduled" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/60" />
          <span>{t("queuedForTranscription")}</span>
        </div>
      )}

      {isLoading && !starting && <StageProgress currentStage={stage} />}

      {stage === "error" && (
        <StageProgress
          currentStage={stage}
          errorMessage={errorMessage || undefined}
          onRetry={handleRetry}
        />
      )}

      {flagged && viewMode !== "pv" && (
        <FlaggedTranscriptBanner
          sourceDurationMs={sourceDurationMs}
          alignedDurationMs={alignedDurationMs}
          isLoggedIn={isLoggedIn}
          pendingStage={pendingRetranscribeStage}
          starting={retranscribeStarting}
          error={retranscribeError}
          onRetranscribe={handleRetranscribe}
        />
      )}

      {isLoggedIn && viewMode === "analysis" && propositions.length > 0 && (
        <AnalysisView
          propositions={propositions}
          statements={statements}
          speakerMappings={speakerMappings}
          countryNames={countryNames}
          onJumpToTimestamp={(ms) => seekToTimestamp(ms / 1000)}
        />
      )}

      {isLoggedIn &&
        viewMode === "analysis" &&
        propositions.length === 0 &&
        stage === "completed" && (
          <div className="mt-8 flex flex-col items-center gap-4 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">{t("noAnalysisYet")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("noAnalysisBody")}
              </p>
            </div>
            <button
              onClick={handleRunAnalysis}
              disabled={analyzingPropositions}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {analyzingPropositions ? (
                <span className="flex items-center gap-2">
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {t("analyzing")}
                </span>
              ) : (
                t("runAnalysis")
              )}
            </button>
          </div>
        )}

      {viewMode === "pv" && pvSymbol && (
        <PVPanel
          pvSymbol={pvSymbol}
          language={selectedLanguage}
          player={player}
          kalturaId={kalturaId}
          onSpeakersChange={handlePvSpeakersChange}
        />
      )}

      {viewMode === "transcript" && segments && (
        <TranscriptView
          segments={segments}
          statements={statements}
          speakerMappings={speakerMappings}
          countryNames={countryNames}
          topics={topics}
          activeSegmentIndex={activeSegmentIndex}
          activeStatementIndex={activeStatementIndex}
          activeParagraphIndex={activeParagraphIndex}
          activeSentenceIndex={activeSentenceIndex}
          activeWordIndex={activeWordIndex}
          selectedTopic={selectedTopic}
          topicCollapsed={topicCollapsed}
          onSeek={seekToTimestamp}
        />
      )}

      {!segments && rawParagraphs && rawParagraphs.length > 0 && (
        <RawTranscriptView
          rawParagraphs={rawParagraphs}
          onSeek={seekToTimestamp}
        />
      )}

      {!segments &&
        !rawParagraphs &&
        stage === "idle" &&
        !checking &&
        viewMode !== "pv" && (
          <div className="mt-2 rounded-lg border border-border bg-muted/30 px-5 py-6">
            {video.status === "live" || video.status === "scheduled" ? (
              <>
                <p className="mb-1 text-sm font-medium text-foreground">
                  {t("noTranscriptYet")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t.rich("noTranscriptHintPending", {
                    strong: (chunks) => (
                      <span className="font-medium">{chunks}</span>
                    ),
                  })}
                </p>
              </>
            ) : (
              <>
                <p className="mb-1 text-sm font-medium text-foreground">
                  {t("noTranscriptYet")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("noTranscriptHintFinished")}
                </p>
              </>
            )}
          </div>
        )}
    </div>
  );
}
