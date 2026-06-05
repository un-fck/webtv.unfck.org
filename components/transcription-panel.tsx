"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { SpeakerMapping } from "@/lib/speakers";
import type { Video } from "@/lib/un-api";
import { getCountryName } from "@/lib/country-lookup";
import { useScrollToActive } from "@/lib/hooks/use-scroll-to-active";
import { BarChart3 } from "lucide-react";
import { PVPanel, type PVSpeakerEntry } from "@/components/pv-panel";
import ExcelJS from "exceljs";
import type { Proposition } from "@/lib/pipeline";
import { StageProgress, type Stage } from "@/components/stage-progress";
import { AnalysisView } from "@/components/analysis-view";
import { usePlaybackTracking } from "@/lib/hooks/use-playback-tracking";
import { formatTimecode, formatSpeakerText } from "@/lib/transcript-formatting";
import {
  TranscriptToolbar,
  type ViewMode,
} from "@/components/transcript-toolbar";
import { TranscriptView } from "@/components/transcript-view";
import { RawTranscriptView } from "@/components/raw-transcript-view";
import { FlaggedTranscriptBanner } from "@/components/flagged-transcript-banner";

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

interface TranscriptionPanelProps {
  kalturaId: string;
  player?: {
    currentTime: number;
    play: () => void;
  };
  video: Video;
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  availableLanguages: LanguageOption[];
  onLanguagesRefresh?: () => void;
  selectedTopic: string | null;
  onTopicSelect: (topic: string | null) => void;
  topicCollapsed: boolean;
  onTopicCollapsedChange: (collapsed: boolean) => void;
  onDataChange?: (data: TranscriptionPanelData) => void;
  isLoggedIn: boolean;
  pvSymbol?: string;
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
    words: Word[];
  }>;
  start: number;
  end: number;
  words: Word[];
}

export function TranscriptionPanel({
  kalturaId,
  player,
  video,
  selectedLanguage,
  onLanguageChange,
  availableLanguages,
  onLanguagesRefresh,
  selectedTopic,
  onTopicSelect,
  topicCollapsed,
  onTopicCollapsedChange,
  onDataChange,
  isLoggedIn,
  pvSymbol,
}: TranscriptionPanelProps) {
  const [segments, setSegments] = useState<SpeakerSegment[] | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [speakerMappings, setSpeakerMappings] = useState<SpeakerMapping>({});
  const [countryNames, setCountryNames] = useState<Map<string, string>>(
    new Map(),
  );
  const [topics, setTopics] = useState<
    Record<string, { key: string; label: string; description: string }>
  >({});
  const [statements, setStatements] = useState<Statement[] | null>(null);
  const [rawParagraphs, setRawParagraphs] = useState<RawParagraph[] | null>(
    null,
  );
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [pvSpeakers, setPvSpeakers] = useState<PVSpeakerEntry[] | null>(null);
  const [pvActiveTurnIndex, setPvActiveTurnIndex] = useState<number>(-1);
  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("transcript");
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

  const getSpeakerText = (statementIndex: number | undefined): string =>
    formatSpeakerText(statementIndex, speakerMappings, countryNames);

  const seekToTimestamp = (timestamp: number) => {
    if (!player) return;
    try {
      player.currentTime = timestamp;
      player.play();
    } catch (err) {
      console.error("Failed to seek:", err);
    }
  };

  const groupStatementsBySpeaker = useCallback(
    (
      statementsData: Statement[],
      mappings: SpeakerMapping,
    ): SpeakerSegment[] => {
      const segs: SpeakerSegment[] = [];
      if (statementsData.length === 0) return segs;

      let currentSegment: SpeakerSegment | null = null;
      statementsData.forEach((stmt, index) => {
        const speakerInfo = mappings[index.toString()];
        const speakerId = JSON.stringify(speakerInfo || {});
        const timestamp = stmt.paragraphs[0]?.sentences[0]?.start
          ? stmt.paragraphs[0].sentences[0].start / 1000
          : 0;

        if (!currentSegment || currentSegment.speaker !== speakerId) {
          if (currentSegment) segs.push(currentSegment);
          currentSegment = {
            speaker: speakerId,
            statementIndices: [index],
            timestamp,
          };
        } else {
          currentSegment.statementIndices.push(index);
        }
      });
      if (currentSegment) segs.push(currentSegment);
      return segs;
    },
    [],
  );

  const loadCountryNames = useCallback(async (mapping: SpeakerMapping) => {
    const names = new Map<string, string>();
    const iso3Codes = new Set<string>();
    Object.values(mapping).forEach((info) => {
      if (info.affiliation && info.affiliation.length === 3)
        iso3Codes.add(info.affiliation);
    });
    for (const code of iso3Codes) {
      const name = await getCountryName(code);
      if (name) names.set(code, name);
    }
    setCountryNames(names);
  }, []);

  useEffect(() => {
    if (statements && Object.keys(speakerMappings).length > 0) {
      setSegments(groupStatementsBySpeaker(statements, speakerMappings));
    }
  }, [statements, speakerMappings, groupStatementsBySpeaker]);

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
        if (data.speakerMappings) {
          setSpeakerMappings(data.speakerMappings);
          await loadCountryNames(data.speakerMappings);
        }
        setStage("completed");
        onLanguagesRefresh?.();
        return;
      }
      if (data.stage) setStage(data.stage);
      if (data.raw_paragraphs) setRawParagraphs(data.raw_paragraphs);
      if (data.transcriptId) {
        // Bind to the active language's controller so a tab switch aborts the
        // long-running poll instead of leaking state into the new language.
        const signal = pollAbortRef.current?.signal ?? new AbortController().signal;
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
          await loadCountryNames(data.speakerMappings);
          if (signal.aborted) return;
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
        setRetranscribeError(data.error_message || "Fresh transcription failed");
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
        if (data.speakerMappings) {
          setSpeakerMappings(data.speakerMappings);
          await loadCountryNames(data.speakerMappings);
        }
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
        err instanceof Error ? err.message : "Failed to start fresh transcription",
      );
    } finally {
      setRetranscribeStarting(false);
    }
  };

  const handleRetry = () => {
    if (transcriptId) {
      setStage("transcribing");
      setErrorMessage(null);
      const signal = pollAbortRef.current?.signal ?? new AbortController().signal;
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
    a.download = `${video.date}_${video.cleanTitle.slice(0, 50).replace(/[^a-z0-9]/gi, "_")}.rtf`;
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

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${video.date}_${video.cleanTitle.slice(0, 50).replace(/[^a-z0-9]/gi, "_")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Check cache on mount and language change
  useEffect(() => {
    setSegments(null);
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
            if (data.topics) setTopics(data.topics);
            if (data.propositions) setPropositions(data.propositions);
            if (data.speakerMappings) {
              setSpeakerMappings(data.speakerMappings);
              await loadCountryNames(data.speakerMappings);
              if (signal.aborted) return;
            }
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
  }, [kalturaId, selectedLanguage, loadCountryNames]);

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
        onViewModeChange={setViewMode}
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
      />

      {checking && stage === "idle" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{t("checkingForTranscript")}</span>
        </div>
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
