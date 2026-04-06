"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { SpeakerMapping } from "@/lib/speakers";
import type { Video } from "@/lib/un-api";
import { getCountryName } from "@/lib/country-lookup";
import {
  ChevronDown,
  Check,
  RotateCcw,
  FileText,
  BarChart3,
  Globe,
  BookOpen,
} from "lucide-react";
import { PVPanel, type PVSpeakerEntry } from "@/components/pv-panel";
import ExcelJS from "exceljs";
import type { Proposition } from "@/lib/speaker-identification";

export interface LanguageOption {
  code: string;
  name: string;
  available: boolean;
  transcriptStatus: string | null;
}

type Stage =
  | "idle"
  | "scheduled"
  | "transcribing"
  | "transcribed"
  | "identifying_speakers"
  | "analyzing_topics"
  | "analyzing_propositions"
  | "completed"
  | "error";
type ViewMode = "transcript" | "analysis" | "pv";

const STAGES: { key: Stage; label: string }[] = [
  { key: "transcribing", label: "Transcribing audio" },
  { key: "analyzing_topics", label: "Analyzing topics" },
];

function getStageIndex(stage: Stage): number {
  // transcribed and identifying_speakers are transient — map to "just finished transcribing"
  if (stage === "transcribed" || stage === "identifying_speakers") return 0;
  return STAGES.findIndex((s) => s.key === stage);
}

function StageProgress({
  currentStage,
  errorMessage,
  onRetry,
}: {
  currentStage: Stage;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  const currentIndex =
    currentStage === "completed" ? STAGES.length : getStageIndex(currentStage);

  return (
    <div className="mb-4 space-y-2">
      {STAGES.map((stage, idx) => {
        const isDone = currentStage === "completed" || idx < currentIndex;
        const isActive =
          idx === currentIndex &&
          currentStage !== "completed" &&
          currentStage !== "error";
        const isError = currentStage === "error" && idx === currentIndex;

        return (
          <div key={stage.key} className="flex items-center gap-2 text-sm">
            {isDone ? (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
                <Check className="h-3 w-3 text-white" />
              </div>
            ) : isActive ? (
              <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-primary">
                <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              </div>
            ) : isError ? (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500">
                <span className="text-xs text-white">!</span>
              </div>
            ) : (
              <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
            )}
            <span
              className={`${isDone ? "text-foreground" : isActive ? "font-medium text-foreground" : isError ? "text-red-600" : "text-muted-foreground"}`}
            >
              {stage.label}
              {isActive && (
                <span className="ml-2 text-muted-foreground">...</span>
              )}
            </span>
          </div>
        );
      })}
      {currentStage === "error" && errorMessage && (
        <div className="mt-3 flex items-center justify-between rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{errorMessage}</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-xs hover:bg-red-200"
            >
              <RotateCcw className="h-3 w-3" /> Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
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
  start: number; // Milliseconds
  end: number; // Milliseconds
}

interface SpeakerSegment {
  speaker: string; // Stringified speaker info for identity comparison
  statementIndices: number[]; // Direct references to statements
  timestamp: number;
}

interface Statement {
  paragraphs: Array<{
    sentences: Array<{
      text: string;
      start: number; // Milliseconds
      end: number; // Milliseconds
      topic_keys?: string[];
      words?: Word[];
    }>;
    start: number; // Milliseconds
    end: number; // Milliseconds
    words: Word[];
  }>;
  start: number; // Milliseconds - overall statement timing
  end: number; // Milliseconds - overall statement timing
  words: Word[]; // All words for the statement
}

// Stance colors
const STANCE_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  support: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
  },
  oppose: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  conditional: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  neutral: {
    bg: "bg-gray-50",
    text: "text-gray-600",
    border: "border-gray-200",
  },
};

const STANCE_LABELS: Record<string, string> = {
  support: "Support",
  oppose: "Oppose",
  conditional: "Conditional",
  neutral: "Neutral",
};

interface AnalysisViewProps {
  propositions: Proposition[];
  statements: Statement[] | null;
  speakerMappings: SpeakerMapping;
  countryNames: Map<string, string>;
  onJumpToTimestamp: (ms: number) => void;
}

function AnalysisView({
  propositions,
  statements,
  speakerMappings,
  countryNames,
  onJumpToTimestamp,
}: AnalysisViewProps) {
  const [expandedProps, setExpandedProps] = useState<Set<string>>(new Set());
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(
    new Set(),
  );

  const toggleProp = (key: string) => {
    setExpandedProps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const togglePosition = (key: string) => {
    setExpandedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  // Get statement data - LLM paragraph index = statement index
  const getStatementData = (
    statementIndex: number,
  ): { text: string; start: number; statementIndex: number } | null => {
    if (!statements || statementIndex >= statements.length) return null;
    const stmt = statements[statementIndex];
    const text = stmt.paragraphs
      .flatMap((p) => p.sentences.map((s) => s.text))
      .join(" ");
    return { text, start: stmt.start, statementIndex };
  };

  // Reuse speaker rendering logic from transcript view
  const renderSpeakerInfo = (statementIndex: number) => {
    const info = speakerMappings[statementIndex.toString()];
    if (
      !info ||
      (!info.affiliation && !info.group && !info.function && !info.name)
    ) {
      return (
        <span className="text-sm font-medium">
          Speaker {statementIndex + 1}
        </span>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {info.affiliation && (
          <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            {countryNames.get(info.affiliation) || info.affiliation}
          </span>
        )}
        {info.group && (
          <span className="inline-flex items-center rounded-md bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
            {info.group}
          </span>
        )}
        {info.function && info.function.toLowerCase() !== "representative" && (
          <span className="text-sm font-medium text-muted-foreground">
            {info.function}
          </span>
        )}
        {info.name && (
          <span className="text-sm font-semibold">{info.name}</span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {propositions.map((prop) => {
        const isExpanded = expandedProps.has(prop.key);

        return (
          <div key={prop.key} className="overflow-hidden rounded-lg border">
            {/* Proposition header */}
            <button
              onClick={() => toggleProp(prop.key)}
              className="w-full bg-muted/30 px-4 py-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium">{prop.title}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {prop.statement}
                  </p>
                </div>
                <ChevronDown
                  className={`mt-1 h-4 w-4 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
              </div>
              {/* Position summary badges */}
              <div className="mt-2 flex flex-wrap gap-2">
                {prop.positions.map((pos) => (
                  <span
                    key={pos.stance}
                    className={`rounded-full px-2 py-0.5 text-xs ${STANCE_COLORS[pos.stance].bg} ${STANCE_COLORS[pos.stance].text}`}
                  >
                    {STANCE_LABELS[pos.stance]}: {pos.stakeholders.length}
                  </span>
                ))}
              </div>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="divide-y">
                {prop.positions.map((pos) => {
                  const posKey = `${prop.key}-${pos.stance}`;
                  const isPosExpanded = expandedPositions.has(posKey);
                  const colors = STANCE_COLORS[pos.stance];

                  return (
                    <div key={pos.stance} className={`${colors.bg}`}>
                      <div className="px-4 py-3">
                        <div className="mb-1 flex items-center gap-2">
                          <span
                            className={`text-xs font-medium uppercase ${colors.text}`}
                          >
                            {STANCE_LABELS[pos.stance]}
                          </span>
                        </div>
                        <div className="mb-1 text-sm font-medium">
                          {pos.stakeholders.join(", ")}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {pos.summary}
                        </p>

                        {/* View evidence button */}
                        {pos.evidence && pos.evidence.length > 0 && (
                          <button
                            onClick={() => togglePosition(posKey)}
                            className="mt-2 text-xs text-primary hover:underline"
                          >
                            {isPosExpanded
                              ? "Hide quotes"
                              : `View quotes (${pos.evidence.length})`}
                          </button>
                        )}

                        {/* Evidence quotes */}
                        {isPosExpanded && pos.evidence && (
                          <div className="mt-3 space-y-3">
                            {pos.evidence.map((ev, idx) => {
                              const stmtData = getStatementData(
                                ev.statementIndex,
                              );
                              if (!stmtData) return null;

                              return (
                                <div key={idx} className="space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="text-sm font-semibold">
                                      {renderSpeakerInfo(ev.statementIndex)}
                                    </div>
                                    <button
                                      onClick={() =>
                                        onJumpToTimestamp(stmtData.start)
                                      }
                                      className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-primary hover:underline"
                                      title="Jump to this timestamp"
                                    >
                                      [{formatTime(stmtData.start)}]
                                    </button>
                                  </div>
                                  <div
                                    className="cursor-pointer rounded-lg border border-border/50 bg-background/50 p-3 transition-colors hover:bg-background/80"
                                    onClick={() =>
                                      onJumpToTimestamp(stmtData.start)
                                    }
                                    title="Click to jump to video"
                                  >
                                    <p dir="auto" className="text-start text-sm leading-relaxed text-foreground italic">
                                      &ldquo;{ev.quote}&rdquo;
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
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
  const currentTimeRef = useRef<number>(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1);
  const [showCopied, setShowCopied] = useState(false);
  const [speakerMappings, setSpeakerMappings] = useState<SpeakerMapping>({});
  const [countryNames, setCountryNames] = useState<Map<string, string>>(
    new Map(),
  );
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
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
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const languageButtonRef = useRef<HTMLDivElement>(null);
  const [activeStatementIndex, setActiveStatementIndex] = useState<number>(-1);
  const [activeParagraphIndex, setActiveParagraphIndex] = useState<number>(-1);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number>(-1);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const downloadButtonRef = useRef<HTMLDivElement>(null);

  const handlePvSpeakersChange = useCallback((speakers: PVSpeakerEntry[], activeIdx: number) => {
    setPvSpeakers(speakers);
    setPvActiveTurnIndex(activeIdx);
  }, []);

  const isLoading =
    stage !== "idle" &&
    stage !== "scheduled" &&
    stage !== "completed" &&
    stage !== "error";

  // Filter segments by selected topic

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
    if (statementIndex === undefined) {
      return "Speaker";
    }

    const info = speakerMappings[statementIndex.toString()];

    if (
      !info ||
      (!info.affiliation && !info.group && !info.function && !info.name)
    ) {
      return `Speaker ${statementIndex + 1}`;
    }

    const parts: string[] = [];

    if (info.affiliation) {
      parts.push(countryNames.get(info.affiliation) || info.affiliation);
    }

    if (info.group) {
      parts.push(info.group);
    }

    // Skip "Representative" as it's not very informative
    if (info.function && info.function.toLowerCase() !== "representative") {
      parts.push(info.function);
    }

    if (info.name) {
      parts.push(info.name);
    }

    return parts.join(" · ");
  };

  const renderSpeakerInfo = (statementIndex: number | undefined) => {
    if (statementIndex === undefined) {
      return <span>Speaker</span>;
    }

    const info = speakerMappings[statementIndex.toString()];

    if (
      !info ||
      (!info.affiliation && !info.group && !info.function && !info.name)
    ) {
      return <span>Speaker {statementIndex + 1}</span>;
    }

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Affiliation badge */}
        {info.affiliation && (
          <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            {countryNames.get(info.affiliation) || info.affiliation}
          </span>
        )}

        {/* Group badge */}
        {info.group && (
          <span className="inline-flex items-center rounded-md bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
            {info.group}
          </span>
        )}

        {/* Function (skip if just "Representative") */}
        {info.function && info.function.toLowerCase() !== "representative" && (
          <span className="text-sm font-medium text-muted-foreground">
            {info.function}
          </span>
        )}

        {/* Name */}
        {info.name && (
          <span className="text-sm font-semibold">{info.name}</span>
        )}
      </div>
    );
  };

  const speakerHeaderClass =
    "text-sm font-semibold tracking-wide text-foreground";

  const seekToTimestamp = (timestamp: number) => {
    if (!player) {
      console.log("Player not ready yet");
      return;
    }

    // Use Kaltura Player API directly
    try {
      console.log("Seeking to timestamp:", timestamp);
      player.currentTime = timestamp;
      player.play();
    } catch (err) {
      console.error("Failed to seek:", err);
    }
  };

  // Helper to insert paragraph breaks within a speaker's words
  // Group statements by consecutive same speaker
  const groupStatementsBySpeaker = useCallback(
    (
      statementsData: Statement[],
      mappings: SpeakerMapping,
    ): SpeakerSegment[] => {
      const segments: SpeakerSegment[] = [];

      if (statementsData.length === 0) return segments;

      let currentSegment: SpeakerSegment | null = null;

      statementsData.forEach((stmt, index) => {
        const speakerInfo = mappings[index.toString()];
        const speakerId = JSON.stringify(speakerInfo || {}); // Use stringified info as unique ID

        // Get timestamp from first paragraph's first sentence
        const timestamp = stmt.paragraphs[0]?.sentences[0]?.start
          ? stmt.paragraphs[0].sentences[0].start / 1000
          : 0;

        if (!currentSegment || currentSegment.speaker !== speakerId) {
          // Start a new segment
          if (currentSegment) {
            segments.push(currentSegment);
          }
          currentSegment = {
            speaker: speakerId,
            statementIndices: [index],
            timestamp,
          };
        } else {
          // Add to current segment
          currentSegment.statementIndices.push(index);
        }
      });

      // Add final segment
      if (currentSegment) {
        segments.push(currentSegment);
      }

      return segments;
    },
    [],
  );

  const loadCountryNames = useCallback(async (mapping: SpeakerMapping) => {
    const names = new Map<string, string>();

    // Collect all ISO3 codes
    const iso3Codes = new Set<string>();
    Object.values(mapping).forEach((info) => {
      if (info.affiliation && info.affiliation.length === 3) {
        iso3Codes.add(info.affiliation);
      }
    });

    // Load country names
    for (const code of iso3Codes) {
      const name = await getCountryName(code);
      if (name) {
        names.set(code, name);
      }
    }

    setCountryNames(names);
  }, []);

  // Regenerate segments when speaker mappings or statements change
  useEffect(() => {
    if (statements && Object.keys(speakerMappings).length > 0) {
      setSegments(groupStatementsBySpeaker(statements, speakerMappings));
    }
  }, [statements, speakerMappings, groupStatementsBySpeaker]);

  // Pass data up to parent for sidebar rendering
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
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kalturaId, force, language: selectedLanguage }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Transcription failed");
      }

      const data = await response.json();
      setTranscriptId(data.transcriptId);

      // If we got statements directly (cached/completed), use them
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

      // Set initial stage and raw paragraphs if available
      if (data.stage) setStage(data.stage);
      if (data.raw_paragraphs) setRawParagraphs(data.raw_paragraphs);

      // Start polling
      if (data.transcriptId) {
        await pollForCompletion(data.transcriptId);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to transcribe",
      );
      setStage("error");
    }
  };

  const handleSchedule = async () => {
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kalturaId,
          assetId: video.id,
          action: "schedule",
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to schedule transcript");
      }
      setStage("scheduled");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to schedule transcript",
      );
      setStage("error");
    }
  };

  const pollForCompletion = async (tid: string) => {
    let pollCount = 0;
    const maxTranscriptionPolls = 200;


    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      pollCount++;

      const pollResponse = await fetch("/api/transcribe/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptId: tid }),
      });

      if (!pollResponse.ok) throw new Error("Failed to poll transcript status");

      const data = await pollResponse.json();

      // Update stage
      if (data.stage) setStage(data.stage);

      // Update raw paragraphs as soon as available
      if (data.raw_paragraphs && !rawParagraphs) {
        setRawParagraphs(data.raw_paragraphs);
      }

      // Update statements when available (even before topics)
      if (data.statements?.length > 0) {
        setStatements(data.statements);
        if (
          data.speakerMappings &&
          Object.keys(data.speakerMappings).length > 0
        ) {
          setSpeakerMappings(data.speakerMappings);
          await loadCountryNames(data.speakerMappings);
        }
      }

      // Update topics and propositions when available
      if (data.topics && Object.keys(data.topics).length > 0) {
        setTopics(data.topics);
      }
      if (data.propositions && data.propositions.length > 0) {
        setPropositions(data.propositions);
      }

      // Check for completion or error
      if (data.stage === "completed") {
        break;
      } else if (data.stage === "error") {
        throw new Error(data.error_message || "Pipeline failed");
      } else if (
        data.stage === "transcribing" &&
        pollCount >= maxTranscriptionPolls
      ) {
        throw new Error(
          "Transcription timeout - audio processing took too long",
        );
      }
    }
  };

  const handleRetry = () => {
    if (transcriptId) {
      // Retry from where we left off
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

  const [analyzingPropositions, setAnalyzingPropositions] = useState(false);

  const handleRunAnalysis = async () => {
    if (!transcriptId) return;
    setAnalyzingPropositions(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptId }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Analysis failed");
      }
      const data = await response.json();
      if (data.propositions) {
        setPropositions(data.propositions);
      }
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
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
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
        // Encode Unicode characters as \uN? where N is the decimal code point
        const code = char.charCodeAt(0);
        return `\\u${code}?`;
      });
  };

  const downloadDocx = () => {
    if (!segments || !statements) return;

    // Simple RTF format (opens in Word)
    let rtf = "{\\rtf1\\ansi\\deff0\n";
    segments.forEach((segment) => {
      const firstStmtIndex = segment.statementIndices[0] ?? 0;
      rtf += `{\\b ${escapeRtf(getSpeakerText(firstStmtIndex))}`;
      if (segment.timestamp !== null) {
        rtf += ` [${formatTime(segment.timestamp)}]`;
      }
      rtf += ":}\\line\\line\n";

      segment.statementIndices.forEach((stmtIdx) => {
        const stmt = statements[stmtIdx];
        if (stmt) {
          stmt.paragraphs.forEach((para) => {
            const text = para.sentences.map((s) => s.text).join(" ");
            rtf += escapeRtf(text);
            rtf += "\\line\\line\n";
          });
        }
      });
    });
    rtf += "}";

    const blob = new Blob([rtf], { type: "application/rtf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const filename = `${video.date}_${video.cleanTitle.slice(0, 50).replace(/[^a-z0-9]/gi, "_")}.rtf`;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setShowDownloadMenu(false);
  };

  const downloadExcel = async () => {
    if (!segments) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Transcript");

    // Get all topic labels for column headers
    const topicList = Object.values(topics);

    // Define base columns
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

    // Add topic columns
    const topicColumns = topicList.map((topic) => ({
      header: `Topic ${topic.label}`,
      key: `topic_${topic.key}`,
      width: 15,
    }));

    worksheet.columns = [...baseColumns, ...topicColumns];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9D9D9" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "left" };

    // Freeze header row
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    // Add data
    let paragraphNumber = 1;
    segments.forEach((segment) => {
      segment.statementIndices.forEach((stmtIdx) => {
        const info = speakerMappings[stmtIdx.toString()];
        const stmt = statements?.[stmtIdx];

        if (stmt) {
          stmt.paragraphs.forEach((para) => {
            const text = para.sentences.map((s) => s.text).join(" ");

            // Collect all topic keys from sentences in this paragraph
            const paragraphTopics = new Set<string>();
            para.sentences.forEach((sent) => {
              sent.topic_keys?.forEach((key) => paragraphTopics.add(key));
            });

            // Build row data with base columns
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

            // Add topic columns
            topicList.forEach((topic) => {
              rowData[`topic_${topic.key}`] = paragraphTopics.has(topic.key)
                ? "Yes"
                : "";
            });

            const row = worksheet.addRow(rowData);

            // Wrap text in all cells
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

    // Generate buffer and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const filename = `${video.date}_${video.cleanTitle.slice(0, 50).replace(/[^a-z0-9]/gi, "_")}.xlsx`;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setShowDownloadMenu(false);
  };

  // Check for cached transcript on mount and when language changes
  useEffect(() => {
    // Reset state for language switch
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
        const response = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kalturaId, checkOnly: true, language: selectedLanguage }),
        });

        if (response.ok) {
          const data = await response.json();

          // Store transcript ID for potential retry
          if (data.transcriptId) setTranscriptId(data.transcriptId);

          // Load cached transcript if completed
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
            // Have raw data but pipeline not complete - show intermediate and poll
            setRawParagraphs(data.raw_paragraphs);
            if (data.stage) setStage(data.stage);
            if (data.transcriptId) {
              pollForCompletion(data.transcriptId).catch((err) => {
                setErrorMessage(
                  err instanceof Error ? err.message : "Pipeline failed",
                );
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

  // Poll player time via rAF and compute active indices in-loop.
  // currentTime is kept as a ref (not state) to avoid triggering re-renders on every frame.
  // setState is only called when an active index actually changes, which is far less frequent.
  useEffect(() => {
    if (!player) return;

    let animationFrameId: number;
    let lastTime = -1;
    let lastSegIdx = -1;
    let lastStmtIdx = -1;
    let lastParaIdx = -1;
    let lastSentIdx = -1;
    let lastWordIdx = -1;

    const updateTime = () => {
      try {
        const time = player.currentTime;
        if (Math.abs(time - lastTime) > 0.01) {
          lastTime = time;
          currentTimeRef.current = time;

          if (!segments || !statements || statements.length === 0) {
            if (lastSegIdx !== -1) { setActiveSegmentIndex(-1); lastSegIdx = -1; }
            if (lastStmtIdx !== -1) { setActiveStatementIndex(-1); lastStmtIdx = -1; }
            if (lastParaIdx !== -1) { setActiveParagraphIndex(-1); lastParaIdx = -1; }
            if (lastSentIdx !== -1) { setActiveSentenceIndex(-1); lastSentIdx = -1; }
            if (lastWordIdx !== -1) { setActiveWordIndex(-1); lastWordIdx = -1; }
          } else {
            let newSegIdx = -1;
            for (let i = segments.length - 1; i >= 0; i--) {
              if (time >= segments[i].timestamp) { newSegIdx = i; break; }
            }

            let newStmtIdx = -1;
            for (let i = statements.length - 1; i >= 0; i--) {
              const stmt = statements[i];
              if (stmt?.paragraphs?.[0]?.sentences?.[0]) {
                if (time >= stmt.paragraphs[0].sentences[0].start / 1000) { newStmtIdx = i; break; }
              }
            }

            let newParaIdx = -1;
            if (newStmtIdx >= 0) {
              const stmt = statements[newStmtIdx];
              if (stmt?.paragraphs) {
                for (let i = stmt.paragraphs.length - 1; i >= 0; i--) {
                  const para = stmt.paragraphs[i];
                  if (para.sentences?.[0] && time >= para.sentences[0].start / 1000) { newParaIdx = i; break; }
                }
              }
            }

            let newSentIdx = -1;
            if (newStmtIdx >= 0 && newParaIdx >= 0) {
              const para = statements[newStmtIdx]?.paragraphs?.[newParaIdx];
              if (para?.sentences) {
                for (let i = para.sentences.length - 1; i >= 0; i--) {
                  if (time >= para.sentences[i].start / 1000) { newSentIdx = i; break; }
                }
              }
            }

            let newWordIdx = -1;
            if (newStmtIdx >= 0 && newParaIdx >= 0 && newSentIdx >= 0) {
              const sentence = statements[newStmtIdx]?.paragraphs?.[newParaIdx]?.sentences?.[newSentIdx];
              if (sentence?.words) {
                for (let i = sentence.words.length - 1; i >= 0; i--) {
                  if (time >= sentence.words[i].start / 1000) { newWordIdx = i; break; }
                }
              }
            }

            if (newSegIdx !== lastSegIdx) { setActiveSegmentIndex(newSegIdx); lastSegIdx = newSegIdx; }
            if (newStmtIdx !== lastStmtIdx) { setActiveStatementIndex(newStmtIdx); lastStmtIdx = newStmtIdx; }
            if (newParaIdx !== lastParaIdx) { setActiveParagraphIndex(newParaIdx); lastParaIdx = newParaIdx; }
            if (newSentIdx !== lastSentIdx) { setActiveSentenceIndex(newSentIdx); lastSentIdx = newSentIdx; }
            if (newWordIdx !== lastWordIdx) { setActiveWordIndex(newWordIdx); lastWordIdx = newWordIdx; }
          }
        }
      } catch (err) {
        console.log("Failed to get current time:", err);
      }
      animationFrameId = requestAnimationFrame(updateTime);
    };

    animationFrameId = requestAnimationFrame(updateTime);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [player, segments, statements]);

  // Auto-scroll to active paragraph
  const lastScrolledKey = useRef<string | null>(null);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (activeStatementIndex < 0 || activeParagraphIndex < 0) return;

    const key = `${activeStatementIndex}-${activeParagraphIndex}`;

    // Don't scroll if we already scrolled to this paragraph
    if (lastScrolledKey.current === key) return;

    const element = document.querySelector<HTMLElement>(
      `[data-paragraph-key="${key}"]`,
    );
    if (!element) return;

    // Detect if user jumped (time changed by > 5 seconds in one update)
    const time = currentTimeRef.current;
    const timeDelta = Math.abs(time - lastTimeRef.current);
    const isJump = timeDelta > 5;
    lastTimeRef.current = time;

    // Try a scroll container first (overflow-y-auto), fall back to window
    const scrollContainer = element.closest(".overflow-y-auto");

    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const elementTopInContainer =
        elementRect.top - containerRect.top + scrollContainer.scrollTop;
      const containerHeight = scrollContainer.clientHeight;

      const relativeTop = elementRect.top - containerRect.top;
      const isRoughlyInView =
        relativeTop > -containerHeight * 1.5 &&
        relativeTop < containerHeight * 2.5;

      if (isJump || isRoughlyInView) {
        const offset = containerHeight / 3;
        const targetScroll = elementTopInContainer - offset;
        scrollContainer.scrollTo({
          top: targetScroll,
          behavior: isJump ? "instant" : "smooth",
        });
        lastScrolledKey.current = key;
      }
    } else {
      // Page-level scroll
      const elementRect = element.getBoundingClientRect();
      const absoluteTop = elementRect.top + window.scrollY;
      const viewportHeight = window.innerHeight;

      const relativeTop = elementRect.top;
      const isRoughlyInView =
        relativeTop > -viewportHeight * 1.5 &&
        relativeTop < viewportHeight * 2.5;

      if (isJump || isRoughlyInView) {
        const offset = viewportHeight / 3;
        window.scrollTo({
          top: absoluteTop - offset,
          behavior: isJump ? "instant" : "smooth",
        });
        lastScrolledKey.current = key;
      }
    }
  }, [activeStatementIndex, activeParagraphIndex]);

  // Handle click outside dropdowns
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

  const selectedLangName = availableLanguages.find((l) => l.code === selectedLanguage)?.name
    ?? (selectedLanguage === "en" ? "English" : selectedLanguage.toUpperCase());

  return (
    <div>
      {/* Single toolbar row: title | language | tabs | actions */}
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Transcript
        </h2>

        {/* Language selector */}
        {availableLanguages.length > 0 && (
          <div className="relative" ref={languageButtonRef}>
            <button
              onClick={() => setShowLanguageMenu(!showLanguageMenu)}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
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
                      <span className="text-[10px] text-muted-foreground/40">No audio</span>
                    )}
                    {lang.code === selectedLanguage && (
                      <Check className="h-3 w-3 text-primary" />
                    )}
                    {lang.available && lang.transcriptStatus === "completed" && (
                      <span className="h-2 w-2 rounded-full bg-green-500" title="Transcript available" />
                    )}
                    {lang.available && lang.transcriptStatus && lang.transcriptStatus !== "completed" && lang.transcriptStatus !== "error" && (
                      <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" title="In progress" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tabs — when there's transcript data or PV available */}
        {(pvSymbol ||
          (segments &&
            (propositions.length > 0 || Object.keys(topics).length > 0))) && (
            <div className="flex gap-1 rounded-md bg-muted p-0.5">
              <button
                onClick={() => setViewMode("transcript")}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs transition-colors ${
                  viewMode === "transcript"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileText className="h-3 w-3" />
                Transcript
              </button>
              <button
                onClick={() => setViewMode("analysis")}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs transition-colors ${
                  viewMode === "analysis"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                disabled={stage !== "completed" && propositions.length === 0}
                title={
                  stage !== "completed" && propositions.length === 0
                    ? "Transcription must complete before analysis"
                    : undefined
                }
              >
                <BarChart3 className="h-3 w-3" />
                Analysis
              </button>
              {pvSymbol && (
                <button
                  onClick={() => setViewMode("pv")}
                  className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs transition-colors ${
                    viewMode === "pv"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <BookOpen className="h-3 w-3" />
                  {pvSymbol?.includes("/SR.") ? "Summary Record" : "Verbatim Record"}
                </button>
              )}
            </div>
          )}

        {/* Actions — pushed to the right */}
        <div className="ml-auto flex gap-2">
          {!segments && !rawParagraphs && !checking && stage === "idle" && (
            <>
              <button
                onClick={() => handleTranscribe()}
                className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Generate
              </button>
              {(video.status === "live" || video.status === "scheduled") && (
                <button
                  onClick={() => handleSchedule()}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                  title="Queue transcript to start automatically when recording ends"
                >
                  Schedule
                </button>
              )}
            </>
          )}
          {!segments &&
            !rawParagraphs &&
            !checking &&
            stage === "scheduled" && (
              <span className="text-xs text-muted-foreground">
                Transcript scheduled — starts automatically when recording ends
              </span>
            )}
          {(segments || rawParagraphs) && (
            <>
              <div className="relative">
                <button
                  onClick={handleShare}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                >
                  Share
                </button>
                {showCopied && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background">
                    Copied!
                  </div>
                )}
              </div>
              <div className="relative" ref={downloadButtonRef}>
                <button
                  onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                >
                  Download
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showDownloadMenu && (
                  <div className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-md border border-border bg-background shadow-md">
                    <button
                      onClick={downloadDocx}
                      className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                    >
                      Text Document
                    </button>
                    <button
                      onClick={downloadExcel}
                      className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                    >
                      Excel Table
                    </button>
                    <button
                      onClick={() => {
                        window.open(
                          `/json/${encodeURIComponent(video.id)}`,
                          "_blank",
                        );
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

      {/* Analysis View */}
      {viewMode === "analysis" && propositions.length > 0 && (
        <AnalysisView
          propositions={propositions}
          statements={statements}
          speakerMappings={speakerMappings}
          countryNames={countryNames}
          onJumpToTimestamp={(ms) => seekToTimestamp(ms / 1000)}
        />
      )}

      {/* Analysis — Run Analysis prompt */}
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

      {/* PV View */}
      {viewMode === "pv" && pvSymbol && (
        <PVPanel
          pvSymbol={pvSymbol}
          language={selectedLanguage}
          player={player}
          kalturaId={kalturaId}
          onSpeakersChange={handlePvSpeakersChange}
        />
      )}

      {/* Transcript View */}
      {viewMode === "transcript" && segments && (
        <div className="space-y-3">
          {segments.map((segment, segmentIndex) => {
            const isSegmentActive = segmentIndex === activeSegmentIndex;
            const firstStmtIndex = segment.statementIndices[0] ?? 0;

            // Skip segment if in highlights-only mode and no content would be visible
            if (topicCollapsed && selectedTopic) {
              const hasAnyHighlight = segment.statementIndices.some(
                (stmtIdx) => {
                  const stmt = statements?.[stmtIdx];
                  return stmt?.paragraphs.some((para) =>
                    para.sentences.some((sent) =>
                      sent.topic_keys?.includes(selectedTopic),
                    ),
                  );
                },
              );
              if (!hasAnyHighlight) return null;
            }

            return (
              <div
                key={segmentIndex}
                className="space-y-1 pt-2"
                ref={(el) => {
                  segmentRefs.current[segmentIndex] = el;
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className={speakerHeaderClass}>
                    {renderSpeakerInfo(firstStmtIndex)}
                  </div>
                  <button
                    onClick={() => seekToTimestamp(segment.timestamp)}
                    className="rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                    title="Jump to this timestamp"
                  >
                    {formatTime(segment.timestamp)}
                  </button>
                </div>
                <div
                  className={`rounded-lg border p-3 transition-colors duration-200 ${
                    isSegmentActive
                      ? "border-primary/40 bg-primary/5"
                      : "border-transparent bg-muted/40"
                  }`}
                >
                  <div className="space-y-2 text-sm leading-relaxed">
                    {segment.statementIndices.map((stmtIdx, indexInSegment) => {
                      const stmt = statements?.[stmtIdx];

                      if (!stmt) return null;

                      const isStmtActive = stmtIdx === activeStatementIndex;
                      const allTopicKeys = Object.keys(topics);
                      const highlightColor = selectedTopic
                        ? getTopicColor(selectedTopic, allTopicKeys)
                        : null;

                      return (
                        <div key={indexInSegment} className="space-y-3">
                          {stmt.paragraphs.map((para, paraIdx) => {
                            const isParaActive =
                              isStmtActive && paraIdx === activeParagraphIndex;

                            // If topic is collapsed, skip paragraphs without highlighted sentences
                            if (topicCollapsed && selectedTopic) {
                              const hasHighlight = para.sentences.some((sent) =>
                                sent.topic_keys?.includes(selectedTopic),
                              );
                              if (!hasHighlight) return null;
                            }

                            return (
                              <p
                                key={paraIdx}
                                dir="auto"
                                className="text-start"
                                data-paragraph-key={`${stmtIdx}-${paraIdx}`}
                              >
                                {para.sentences.map((sent, sentIdx) => {
                                  const isSentActive =
                                    isParaActive &&
                                    sentIdx === activeSentenceIndex;
                                  const isHighlighted =
                                    selectedTopic &&
                                    sent.topic_keys?.includes(selectedTopic);

                                  // If topic is collapsed, skip non-highlighted sentences
                                  if (
                                    topicCollapsed &&
                                    selectedTopic &&
                                    !isHighlighted
                                  ) {
                                    return null;
                                  }

                                  // Render words if available
                                  if (sent.words && sent.words.length > 0) {
                                    if (isHighlighted && highlightColor) {
                                      return (
                                        <span
                                          key={sentIdx}
                                          className="rounded-full px-2 py-1"
                                          style={{
                                            backgroundColor:
                                              highlightColor + "30",
                                            display: "inline",
                                          }}
                                        >
                                          {sent.words.map((word, wordIdx) => {
                                            const isActiveWord =
                                              isSentActive &&
                                              wordIdx === activeWordIndex;
                                            return (
                                              <span
                                                key={wordIdx}
                                                onClick={() =>
                                                  seekToTimestamp(
                                                    word.start / 1000,
                                                  )
                                                }
                                                className="cursor-pointer hover:opacity-70"
                                                style={{
                                                  textDecorationLine: isActiveWord
                                                    ? "underline"
                                                    : "none",
                                                  textDecorationColor:
                                                    isActiveWord
                                                      ? "hsl(var(--primary))"
                                                      : "transparent",
                                                  textDecorationThickness:
                                                    "2px",
                                                  textUnderlineOffset: "3px",
                                                }}
                                              >
                                                {word.text}{" "}
                                              </span>
                                            );
                                          })}
                                        </span>
                                      );
                                    }
                                    return sent.words.map((word, wordIdx) => {
                                      const isActiveWord =
                                        isSentActive &&
                                        wordIdx === activeWordIndex;
                                      return (
                                        <span
                                          key={`${sentIdx}-${wordIdx}`}
                                          onClick={() =>
                                            seekToTimestamp(word.start / 1000)
                                          }
                                          className="cursor-pointer hover:opacity-70"
                                          style={{
                                            textDecorationLine: isActiveWord
                                              ? "underline"
                                              : "none",
                                            textDecorationColor: isActiveWord
                                              ? "hsl(var(--primary))"
                                              : "transparent",
                                            textDecorationThickness: "2px",
                                            textUnderlineOffset: "3px",
                                          }}
                                        >
                                          {word.text}{" "}
                                        </span>
                                      );
                                    });
                                  }

                                  // Fallback to text rendering
                                  return (
                                    <span
                                      key={sentIdx}
                                      className={
                                        isHighlighted
                                          ? "rounded-full px-2 py-1"
                                          : ""
                                      }
                                      style={
                                        isHighlighted && highlightColor
                                          ? {
                                              backgroundColor:
                                                highlightColor + "30",
                                              display: "inline",
                                            }
                                          : undefined
                                      }
                                    >
                                      {sent.text}{" "}
                                    </span>
                                  );
                                })}
                              </p>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Show raw paragraphs while waiting for speaker identification */}
      {!segments && rawParagraphs && rawParagraphs.length > 0 && (
        <div className="space-y-3">
          {rawParagraphs.map((para, idx) => {
            // Group consecutive paragraphs by speaker
            const speaker = para.words[0]?.speaker || "A";
            const prevSpeaker =
              idx > 0 ? rawParagraphs[idx - 1].words[0]?.speaker || "A" : null;
            const showHeader = speaker !== prevSpeaker;

            return (
              <div key={idx}>
                {showHeader && (
                  <div className="mb-2 pt-3 text-sm font-semibold tracking-wide text-foreground">
                    Speaker {speaker}
                    <button
                      onClick={() => seekToTimestamp(para.start / 1000)}
                      className="ml-2 text-xs text-muted-foreground hover:text-primary hover:underline"
                    >
                      [{formatTime(para.start / 1000)}]
                    </button>
                  </div>
                )}
                <div dir="auto" className="text-start rounded-lg bg-muted/50 p-4 text-sm leading-relaxed">
                  {para.words.map((word, wIdx) => (
                    <span
                      key={wIdx}
                      onClick={() => seekToTimestamp(word.start / 1000)}
                      className="cursor-pointer hover:opacity-70"
                    >
                      {word.text}{" "}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
