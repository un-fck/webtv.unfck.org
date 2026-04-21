"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { SpeakerMapping } from "@/lib/speakers";
import type { Video } from "@/lib/un-api";
import { getCountryName } from "@/lib/country-lookup";
import { BarChart3 } from "lucide-react";
import { PVPanel, type PVSpeakerEntry } from "@/components/pv-panel";
import ExcelJS from "exceljs";
import type { Proposition } from "@/lib/speaker-identification";
import { StageProgress, type Stage } from "@/components/stage-progress";
import { AnalysisView } from "@/components/analysis-view";
import { usePlaybackTracking } from "@/lib/hooks/use-playback-tracking";
import { TranscriptToolbar, type ViewMode } from "@/components/transcript-toolbar";
import { TranscriptView } from "@/components/transcript-view";
import { RawTranscriptView } from "@/components/raw-transcript-view";

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

export const TOPIC_COLOR_PALETTE = [
  "#5b8dc9",
  "#5eb87d",
  "#9b7ac9",
  "#e67c5a",
  "#4db8d4",
  "#d4a834",
  "#7aad6f",
  "#d46ba3",
  "#5aa7d4",
  "#c98d4d",
];

export function getTopicColor(topicKey: string, allTopicKeys: string[]): string {
  const index = allTopicKeys.indexOf(topicKey);
  return TOPIC_COLOR_PALETTE[index % TOPIC_COLOR_PALETTE.length];
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
  pvSymbol,
}: TranscriptionPanelProps) {
  const [segments, setSegments] = useState<SpeakerSegment[] | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [speakerMappings, setSpeakerMappings] = useState<SpeakerMapping>({});
  const [countryNames, setCountryNames] = useState<Map<string, string>>(new Map());
  const [topics, setTopics] = useState<
    Record<string, { key: string; label: string; description: string }>
  >({});
  const [statements, setStatements] = useState<Statement[] | null>(null);
  const [rawParagraphs, setRawParagraphs] = useState<RawParagraph[] | null>(null);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [pvSpeakers, setPvSpeakers] = useState<PVSpeakerEntry[] | null>(null);
  const [pvActiveTurnIndex, setPvActiveTurnIndex] = useState<number>(-1);
  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("transcript");
  const [analyzingPropositions, setAnalyzingPropositions] = useState(false);

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

  const formatTime = (seconds: number | null | undefined): string => {
    if (seconds === null || seconds === undefined || isNaN(seconds)) return "";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const getSpeakerText = (statementIndex: number | undefined): string => {
    if (statementIndex === undefined) return "Speaker";
    const info = speakerMappings[statementIndex.toString()];
    if (!info || (!info.affiliation && !info.group && !info.function && !info.name)) {
      return `Speaker ${statementIndex + 1}`;
    }
    const parts: string[] = [];
    if (info.affiliation) parts.push(countryNames.get(info.affiliation) || info.affiliation);
    if (info.group) parts.push(info.group);
    if (info.function && info.function.toLowerCase() !== "representative") parts.push(info.function);
    if (info.name) parts.push(info.name);
    return parts.join(" · ");
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

  const groupStatementsBySpeaker = useCallback(
    (statementsData: Statement[], mappings: SpeakerMapping): SpeakerSegment[] => {
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
          currentSegment = { speaker: speakerId, statementIndices: [index], timestamp };
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
      if (info.affiliation && info.affiliation.length === 3) iso3Codes.add(info.affiliation);
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
  }, [segments, speakerMappings, countryNames, topics, activeSegmentIndex, propositions, stage, checking, rawParagraphs, onDataChange, pvSpeakers, pvActiveTurnIndex, viewMode]);

  const handleTranscribe = async (force = false) => {
    setStage("transcribing");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kalturaId, force, language: selectedLanguage }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || errorData.error || "Transcription failed");
      }
      const data = await response.json();
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
      if (data.transcriptId) await pollForCompletion(data.transcriptId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to transcribe");
      setStage("error");
    }
  };

  const handleSchedule = async () => {
    try {
      const response = await fetch("/api/transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kalturaId, assetId: video.id, schedule: true }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || errorData.error || "Failed to schedule transcript");
      }
      setStage("scheduled");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to schedule transcript");
      setStage("error");
    }
  };

  const pollForCompletion = async (tid: string) => {
    let pollCount = 0;
    const maxTranscriptionPolls = 200;

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      pollCount++;

      const pollResponse = await fetch(`/api/transcripts/${encodeURIComponent(tid)}`);
      if (!pollResponse.ok) throw new Error("Failed to poll transcript status");

      const data = await pollResponse.json();
      if (data.stage) setStage(data.stage);
      if (data.raw_paragraphs && !rawParagraphs) setRawParagraphs(data.raw_paragraphs);

      if (data.statements?.length > 0) {
        setStatements(data.statements);
        if (data.speakerMappings && Object.keys(data.speakerMappings).length > 0) {
          setSpeakerMappings(data.speakerMappings);
          await loadCountryNames(data.speakerMappings);
        }
      }

      if (data.topics && Object.keys(data.topics).length > 0) setTopics(data.topics);
      if (data.propositions && data.propositions.length > 0) setPropositions(data.propositions);

      if (data.stage === "completed") break;
      if (data.stage === "error") throw new Error(data.error_message || "Pipeline failed");
      if (data.stage === "transcribing" && pollCount >= maxTranscriptionPolls) {
        throw new Error("Transcription timeout - audio processing took too long");
      }
    }
  };

  const handleRetry = () => {
    if (transcriptId) {
      setStage("transcribing");
      setErrorMessage(null);
      pollForCompletion(transcriptId).catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : "Retry failed");
        setStage("error");
      });
    } else {
      handleTranscribe(true);
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
      if (segment.timestamp !== null) rtf += ` [${formatTime(segment.timestamp)}]`;
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
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
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
              rowData[`topic_${topic.key}`] = paragraphTopics.has(topic.key) ? "Yes" : "";
            });
            const row = worksheet.addRow(rowData);
            row.eachCell((cell) => {
              cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
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

    const checkCache = async () => {
      try {
        const response = await fetch(
          `/api/transcripts/check?kalturaId=${encodeURIComponent(kalturaId)}&language=${encodeURIComponent(selectedLanguage)}`,
        );
        if (response.ok) {
          const data = await response.json();
          if (data.transcriptId) setTranscriptId(data.transcriptId);
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
          } else if (data.raw_paragraphs) {
            setRawParagraphs(data.raw_paragraphs);
            if (data.stage) setStage(data.stage);
            if (data.transcriptId) {
              pollForCompletion(data.transcriptId).catch((err) => {
                setErrorMessage(err instanceof Error ? err.message : "Pipeline failed");
                setStage("error");
              });
            }
          }
        }
      } catch (err) {
        console.log("Cache check failed:", err);
      } finally {
        setChecking(false);
      }
    };

    checkCache();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kalturaId, selectedLanguage, loadCountryNames]);

  // Auto-scroll to active paragraph
  const lastScrolledKey = useRef<string | null>(null);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (activeStatementIndex < 0 || activeParagraphIndex < 0) return;

    const key = `${activeStatementIndex}-${activeParagraphIndex}`;
    if (lastScrolledKey.current === key) return;

    const element = document.querySelector<HTMLElement>(
      `[data-paragraph-key="${key}"]`,
    );
    if (!element) return;

    const time = currentTimeRef.current;
    const timeDelta = Math.abs(time - lastTimeRef.current);
    const isJump = timeDelta > 5;
    lastTimeRef.current = time;

    const scrollContainer = element.closest(".overflow-y-auto");

    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const elementTopInContainer =
        elementRect.top - containerRect.top + scrollContainer.scrollTop;
      const containerHeight = scrollContainer.clientHeight;

      const relativeTop = elementRect.top - containerRect.top;
      const isRoughlyInView =
        relativeTop > -containerHeight * 1.5 && relativeTop < containerHeight * 2.5;

      if (isJump || isRoughlyInView) {
        const offset = containerHeight / 3;
        scrollContainer.scrollTo({
          top: elementTopInContainer - offset,
          behavior: isJump ? "instant" : "smooth",
        });
        lastScrolledKey.current = key;
      }
    } else {
      const elementRect = element.getBoundingClientRect();
      const absoluteTop = elementRect.top + window.scrollY;
      const viewportHeight = window.innerHeight;
      const relativeTop = elementRect.top;
      const isRoughlyInView =
        relativeTop > -viewportHeight * 1.5 && relativeTop < viewportHeight * 2.5;

      if (isJump || isRoughlyInView) {
        window.scrollTo({
          top: absoluteTop - viewportHeight / 3,
          behavior: isJump ? "instant" : "smooth",
        });
        lastScrolledKey.current = key;
      }
    }
  }, [activeStatementIndex, activeParagraphIndex]);

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
        checking={checking}
        stage={stage}
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
          <span>Checking for existing transcript...</span>
        </div>
      )}

      {isLoading && <StageProgress currentStage={stage} />}

      {stage === "error" && (
        <StageProgress
          currentStage={stage}
          errorMessage={errorMessage || undefined}
          onRetry={handleRetry}
        />
      )}

      {viewMode === "analysis" && propositions.length > 0 && (
        <AnalysisView
          propositions={propositions}
          statements={statements}
          speakerMappings={speakerMappings}
          countryNames={countryNames}
          onJumpToTimestamp={(ms) => seekToTimestamp(ms / 1000)}
        />
      )}

      {viewMode === "analysis" && propositions.length === 0 && stage === "completed" && (
        <div className="mt-8 flex flex-col items-center gap-4 text-center">
          <BarChart3 className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium">No analysis yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Identify key propositions and stakeholder positions across the transcript.
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
                Analyzing...
              </span>
            ) : (
              "Run Analysis"
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
        <RawTranscriptView rawParagraphs={rawParagraphs} onSeek={seekToTimestamp} />
      )}

      {!segments && !rawParagraphs && stage === "idle" && !checking && viewMode !== "pv" && (
        <div className="mt-2 rounded-lg border border-border bg-muted/30 px-5 py-6">
          <p className="mb-1 text-sm font-medium text-foreground">
            No transcript available yet
          </p>
          <p className="text-sm text-muted-foreground">
            Generate an AI transcript to read along with speaker identification,
            topic tagging, and analysis.
          </p>
        </div>
      )}
    </div>
  );
}
