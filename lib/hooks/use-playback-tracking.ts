"use client";

import { useState } from "react";
import { useRafPlaybackTime } from "@/lib/hooks/use-raf-playback-time";

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
      words?: Array<{ text: string; start: number; end: number }>;
    }>;
    start: number;
    end: number;
    // Optional at every level — the hook only reads sentence-level words
    // anyway, and words load lazily after first paint.
    words?: Array<{ text: string; start: number; end: number }>;
  }>;
  start: number;
  end: number;
  words?: Array<{ text: string; start: number; end: number }>;
}

interface PlaybackTrackingResult {
  activeSegmentIndex: number;
  activeStatementIndex: number;
  activeParagraphIndex: number;
  activeSentenceIndex: number;
  activeWordIndex: number;
  currentTimeRef: React.RefObject<number>;
}

/**
 * Tracks playback position via rAF loop and computes active indices
 * for segment, statement, paragraph, sentence, and word.
 *
 * Only triggers setState when an index actually changes to avoid
 * unnecessary re-renders.
 */
export function usePlaybackTracking(
  player: { currentTime: number } | undefined,
  segments: SpeakerSegment[] | null,
  statements: Statement[] | null,
): PlaybackTrackingResult {
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);
  const [activeStatementIndex, setActiveStatementIndex] = useState(-1);
  const [activeParagraphIndex, setActiveParagraphIndex] = useState(-1);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(-1);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);

  // Compute the active segment/statement/paragraph/sentence/word for the given
  // playback time. Setting an unchanged index is a no-op (React bails out), so
  // no manual change-tracking is needed.
  const currentTimeRef = useRafPlaybackTime(player, (time) => {
    if (!segments || !statements || statements.length === 0) {
      setActiveSegmentIndex(-1);
      setActiveStatementIndex(-1);
      setActiveParagraphIndex(-1);
      setActiveSentenceIndex(-1);
      setActiveWordIndex(-1);
      return;
    }

    let newSegIdx = -1;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (time >= segments[i].timestamp) {
        newSegIdx = i;
        break;
      }
    }

    let newStmtIdx = -1;
    for (let i = statements.length - 1; i >= 0; i--) {
      const stmt = statements[i];
      if (stmt?.paragraphs?.[0]?.sentences?.[0]) {
        if (time >= stmt.paragraphs[0].sentences[0].start / 1000) {
          newStmtIdx = i;
          break;
        }
      }
    }

    let newParaIdx = -1;
    if (newStmtIdx >= 0) {
      const stmt = statements[newStmtIdx];
      if (stmt?.paragraphs) {
        for (let i = stmt.paragraphs.length - 1; i >= 0; i--) {
          const para = stmt.paragraphs[i];
          if (para.sentences?.[0] && time >= para.sentences[0].start / 1000) {
            newParaIdx = i;
            break;
          }
        }
      }
    }

    let newSentIdx = -1;
    if (newStmtIdx >= 0 && newParaIdx >= 0) {
      const para = statements[newStmtIdx]?.paragraphs?.[newParaIdx];
      if (para?.sentences) {
        for (let i = para.sentences.length - 1; i >= 0; i--) {
          if (time >= para.sentences[i].start / 1000) {
            newSentIdx = i;
            break;
          }
        }
      }
    }

    let newWordIdx = -1;
    if (newStmtIdx >= 0 && newParaIdx >= 0 && newSentIdx >= 0) {
      const sentence =
        statements[newStmtIdx]?.paragraphs?.[newParaIdx]?.sentences?.[
          newSentIdx
        ];
      if (sentence?.words) {
        for (let i = sentence.words.length - 1; i >= 0; i--) {
          if (time >= sentence.words[i].start / 1000) {
            newWordIdx = i;
            break;
          }
        }
      }
    }

    setActiveSegmentIndex(newSegIdx);
    setActiveStatementIndex(newStmtIdx);
    setActiveParagraphIndex(newParaIdx);
    setActiveSentenceIndex(newSentIdx);
    setActiveWordIndex(newWordIdx);
  });

  return {
    activeSegmentIndex,
    activeStatementIndex,
    activeParagraphIndex,
    activeSentenceIndex,
    activeWordIndex,
    currentTimeRef,
  };
}
