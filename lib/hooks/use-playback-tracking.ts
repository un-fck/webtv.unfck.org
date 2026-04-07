"use client";

import { useState, useEffect, useRef } from "react";

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
    words: Array<{ text: string; start: number; end: number }>;
  }>;
  start: number;
  end: number;
  words: Array<{ text: string; start: number; end: number }>;
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
  const currentTimeRef = useRef<number>(0);

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

  return {
    activeSegmentIndex,
    activeStatementIndex,
    activeParagraphIndex,
    activeSentenceIndex,
    activeWordIndex,
    currentTimeRef,
  };
}
