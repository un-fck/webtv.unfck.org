"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { SpeakerMapping } from "@/lib/speakers";
import { getCountryName } from "@/lib/country-lookup";
import type { Proposition } from "@/lib/speaker-identification";
import type { Stage } from "@/components/stage-progress";

interface RawParagraph {
  text: string;
  start: number;
  end: number;
  words: Array<{ text: string; start: number; end: number; speaker?: string }>;
}

interface Word {
  text: string;
  speaker?: string | null;
  start: number;
  end: number;
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

interface SpeakerSegment {
  speaker: string;
  statementIndices: number[];
  timestamp: number;
}

export interface UseTranscriptResult {
  // State
  segments: SpeakerSegment[] | null;
  statements: Statement[] | null;
  rawParagraphs: RawParagraph[] | null;
  stage: Stage;
  errorMessage: string | null;
  checking: boolean;
  transcriptId: string | null;
  speakerMappings: SpeakerMapping;
  countryNames: Map<string, string>;
  topics: Record<string, { key: string; label: string; description: string }>;
  propositions: Proposition[];
  analyzingPropositions: boolean;

  // Actions
  handleTranscribe: (force?: boolean) => Promise<void>;
  handleSchedule: () => Promise<void>;
  handleRetry: () => void;
  handleRunAnalysis: () => Promise<void>;
  checkCache: (kalturaId: string, language: string) => Promise<void>;
  setStage: (stage: Stage) => void;
  setErrorMessage: (msg: string | null) => void;
  loadCountryNames: (mapping: SpeakerMapping) => Promise<void>;
}

function groupStatementsBySpeaker(
  statementsData: Statement[],
  mappings: SpeakerMapping,
): SpeakerSegment[] {
  const segments: SpeakerSegment[] = [];
  if (statementsData.length === 0) return segments;

  let currentSegment: SpeakerSegment | null = null;

  statementsData.forEach((stmt, index) => {
    const speakerInfo = mappings[index.toString()];
    const speakerId = JSON.stringify(speakerInfo || {});
    const timestamp = stmt.paragraphs[0]?.sentences[0]?.start
      ? stmt.paragraphs[0].sentences[0].start / 1000
      : 0;

    if (!currentSegment || currentSegment.speaker !== speakerId) {
      if (currentSegment) segments.push(currentSegment);
      currentSegment = {
        speaker: speakerId,
        statementIndices: [index],
        timestamp,
      };
    } else {
      currentSegment.statementIndices.push(index);
    }
  });

  if (currentSegment) segments.push(currentSegment);
  return segments;
}

export function useTranscript(
  kalturaId: string,
  videoId: string,
  selectedLanguage: string,
  onLanguagesRefresh?: () => void,
): UseTranscriptResult {
  const [segments, setSegments] = useState<SpeakerSegment[] | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [speakerMappings, setSpeakerMappings] = useState<SpeakerMapping>({});
  const [countryNames, setCountryNames] = useState<Map<string, string>>(new Map());
  const [topics, setTopics] = useState<Record<string, { key: string; label: string; description: string }>>({});
  const [statements, setStatements] = useState<Statement[] | null>(null);
  const [rawParagraphs, setRawParagraphs] = useState<RawParagraph[] | null>(null);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const [analyzingPropositions, setAnalyzingPropositions] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const visibilityPausedRef = useRef(false);

  // Abort polling on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const loadCountryNames = useCallback(async (mapping: SpeakerMapping) => {
    const names = new Map<string, string>();
    const iso3Codes = new Set<string>();
    Object.values(mapping).forEach((info) => {
      if (info.affiliation && info.affiliation.length === 3) {
        iso3Codes.add(info.affiliation);
      }
    });
    for (const code of iso3Codes) {
      const name = await getCountryName(code);
      if (name) names.set(code, name);
    }
    setCountryNames(names);
  }, []);

  const applyData = useCallback(
    async (data: {
      statements?: Statement[];
      topics?: Record<string, { key: string; label: string; description: string }>;
      propositions?: Proposition[];
      speakerMappings?: SpeakerMapping;
      raw_paragraphs?: RawParagraph[];
      stage?: string;
      transcriptId?: string;
    }) => {
      if (data.transcriptId) setTranscriptId(data.transcriptId);
      if (data.raw_paragraphs) setRawParagraphs(data.raw_paragraphs);
      if (data.stage) setStage(data.stage as Stage);
      if (data.topics && Object.keys(data.topics).length > 0) setTopics(data.topics);
      if (data.propositions && data.propositions.length > 0) setPropositions(data.propositions);

      if (data.statements && data.statements.length > 0) {
        setStatements(data.statements);
        if (data.speakerMappings && Object.keys(data.speakerMappings).length > 0) {
          setSpeakerMappings(data.speakerMappings);
          setSegments(groupStatementsBySpeaker(data.statements, data.speakerMappings));
          await loadCountryNames(data.speakerMappings);
        }
      }
    },
    [loadCountryNames],
  );

  const pollForCompletion = useCallback(
    async (tid: string) => {
      // Cancel any existing poll
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      let pollCount = 0;
      const maxTranscriptionPolls = 200;
      let errorBackoff = 3000;
      let lastStage = "";

      // Pause/resume on visibility change
      const handleVisibility = () => {
        visibilityPausedRef.current = document.hidden;
      };
      document.addEventListener("visibilitychange", handleVisibility);

      try {
        while (!controller.signal.aborted) {
          // Wait before polling (with backoff on errors)
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, errorBackoff);
            controller.signal.addEventListener("abort", () => {
              clearTimeout(timer);
              resolve(undefined);
            }, { once: true });
          });

          if (controller.signal.aborted) break;

          // Skip poll while tab is hidden
          if (visibilityPausedRef.current) continue;

          pollCount++;

          let pollResponse: Response;
          try {
            pollResponse = await fetch(
              `/api/transcripts/${encodeURIComponent(tid)}`,
              { signal: controller.signal },
            );
          } catch (err) {
            if (controller.signal.aborted) break;
            // Network error — exponential backoff (3s → 6s → 12s → 30s cap)
            errorBackoff = Math.min(errorBackoff * 2, 30000);
            continue;
          }

          if (!pollResponse.ok) {
            errorBackoff = Math.min(errorBackoff * 2, 30000);
            continue;
          }

          // Successful poll — reset backoff
          errorBackoff = 3000;

          const data = await pollResponse.json();

          // Reset poll count on stage transitions
          if (data.stage && data.stage !== lastStage) {
            lastStage = data.stage;
            pollCount = 0;
          }

          if (data.stage) setStage(data.stage);
          if (data.raw_paragraphs && !rawParagraphs) setRawParagraphs(data.raw_paragraphs);

          if (data.statements?.length > 0) {
            setStatements(data.statements);
            if (data.speakerMappings && Object.keys(data.speakerMappings).length > 0) {
              setSpeakerMappings(data.speakerMappings);
              setSegments(groupStatementsBySpeaker(data.statements, data.speakerMappings));
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
      } finally {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    },
    [loadCountryNames, rawParagraphs],
  );

  const handleTranscribe = useCallback(
    async (force = false) => {
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
          await applyData(data);
          setStage("completed");
          onLanguagesRefresh?.();
          return;
        }

        if (data.stage) setStage(data.stage);
        if (data.raw_paragraphs) setRawParagraphs(data.raw_paragraphs);

        if (data.transcriptId) {
          await pollForCompletion(data.transcriptId);
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to transcribe");
        setStage("error");
      }
    },
    [kalturaId, selectedLanguage, applyData, pollForCompletion, onLanguagesRefresh],
  );

  const handleSchedule = useCallback(async () => {
    try {
      const response = await fetch("/api/transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kalturaId,
          assetId: videoId,
          schedule: true,
        }),
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
  }, [kalturaId, videoId]);

  const handleRetry = useCallback(() => {
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
  }, [transcriptId, pollForCompletion, handleTranscribe]);

  const handleRunAnalysis = useCallback(async () => {
    if (!transcriptId) return;
    setAnalyzingPropositions(true);
    try {
      const response = await fetch(`/api/transcripts/${encodeURIComponent(transcriptId)}/analysis`, {
        method: "POST",
      });
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
  }, [transcriptId]);

  const checkCache = useCallback(
    async (kId: string, language: string) => {
      setStatements(null);
      setSegments(null);
      setRawParagraphs(null);
      setTopics({});
      setPropositions([]);
      setSpeakerMappings({});
      setTranscriptId(null);
      setErrorMessage(null);
      setStage("idle");
      setChecking(true);

      try {
        const response = await fetch(
          `/api/transcripts/check?kalturaId=${encodeURIComponent(kId)}&language=${encodeURIComponent(language)}`,
        );

        if (response.ok) {
          const data = await response.json();

          if (data.transcriptId) setTranscriptId(data.transcriptId);

          if (data.statements && data.statements.length > 0) {
            await applyData(data);
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
    },
    [applyData, pollForCompletion, onLanguagesRefresh],
  );

  return {
    segments,
    statements,
    rawParagraphs,
    stage,
    errorMessage,
    checking,
    transcriptId,
    speakerMappings,
    countryNames,
    topics,
    propositions,
    analyzingPropositions,
    handleTranscribe,
    handleSchedule,
    handleRetry,
    handleRunAnalysis,
    checkCache,
    setStage,
    setErrorMessage,
    loadCountryNames,
  };
}
