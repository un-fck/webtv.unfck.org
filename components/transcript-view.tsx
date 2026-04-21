"use client";

import type { SpeakerMapping } from "@/lib/speakers";
import { getTopicColor } from "@/components/transcription-panel";

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

function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function renderSpeakerInfo(
  statementIndex: number | undefined,
  speakerMappings: SpeakerMapping,
  countryNames: Map<string, string>,
) {
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
}

interface TranscriptViewProps {
  segments: SpeakerSegment[];
  statements: Statement[] | null;
  speakerMappings: SpeakerMapping;
  countryNames: Map<string, string>;
  topics: Record<string, { key: string; label: string; description: string }>;
  activeSegmentIndex: number;
  activeStatementIndex: number;
  activeParagraphIndex: number;
  activeSentenceIndex: number;
  activeWordIndex: number;
  selectedTopic: string | null;
  topicCollapsed: boolean;
  onSeek: (timestampSeconds: number) => void;
}

export function TranscriptView({
  segments,
  statements,
  speakerMappings,
  countryNames,
  topics,
  activeSegmentIndex,
  activeStatementIndex,
  activeParagraphIndex,
  activeSentenceIndex,
  activeWordIndex,
  selectedTopic,
  topicCollapsed,
  onSeek,
}: TranscriptViewProps) {
  const allTopicKeys = Object.keys(topics);
  const highlightColor = selectedTopic
    ? getTopicColor(selectedTopic, allTopicKeys)
    : null;

  return (
    <div className="space-y-3">
      {segments.map((segment, segmentIndex) => {
        const isSegmentActive = segmentIndex === activeSegmentIndex;
        const firstStmtIndex = segment.statementIndices[0] ?? 0;

        if (topicCollapsed && selectedTopic) {
          const hasAnyHighlight = segment.statementIndices.some((stmtIdx) => {
            const stmt = statements?.[stmtIdx];
            return stmt?.paragraphs.some((para) =>
              para.sentences.some((sent) =>
                sent.topic_keys?.includes(selectedTopic),
              ),
            );
          });
          if (!hasAnyHighlight) return null;
        }

        return (
          <div key={segmentIndex} className="space-y-1 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold tracking-wide text-foreground">
                {renderSpeakerInfo(firstStmtIndex, speakerMappings, countryNames)}
              </div>
              <button
                onClick={() => onSeek(segment.timestamp)}
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

                  return (
                    <div key={indexInSegment} className="space-y-3">
                      {stmt.paragraphs.map((para, paraIdx) => {
                        const isParaActive =
                          isStmtActive && paraIdx === activeParagraphIndex;

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
                                isParaActive && sentIdx === activeSentenceIndex;
                              const isHighlighted =
                                selectedTopic &&
                                sent.topic_keys?.includes(selectedTopic);

                              if (topicCollapsed && selectedTopic && !isHighlighted) {
                                return null;
                              }

                              if (sent.words && sent.words.length > 0) {
                                if (isHighlighted && highlightColor) {
                                  return (
                                    <span
                                      key={sentIdx}
                                      className="rounded-full px-2 py-1"
                                      style={{
                                        backgroundColor: highlightColor + "30",
                                        display: "inline",
                                      }}
                                    >
                                      {sent.words.map((word, wordIdx) => {
                                        const isActiveWord =
                                          isSentActive && wordIdx === activeWordIndex;
                                        return (
                                          <span
                                            key={wordIdx}
                                            onClick={() => onSeek(word.start / 1000)}
                                            className="cursor-pointer hover:opacity-70"
                                            style={{
                                              textDecorationLine: isActiveWord ? "underline" : "none",
                                              textDecorationColor: isActiveWord ? "hsl(var(--primary))" : "transparent",
                                              textDecorationThickness: "2px",
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
                                    isSentActive && wordIdx === activeWordIndex;
                                  return (
                                    <span
                                      key={`${sentIdx}-${wordIdx}`}
                                      onClick={() => onSeek(word.start / 1000)}
                                      className="cursor-pointer hover:opacity-70"
                                      style={{
                                        textDecorationLine: isActiveWord ? "underline" : "none",
                                        textDecorationColor: isActiveWord ? "hsl(var(--primary))" : "transparent",
                                        textDecorationThickness: "2px",
                                        textUnderlineOffset: "3px",
                                      }}
                                    >
                                      {word.text}{" "}
                                    </span>
                                  );
                                });
                              }

                              return (
                                <span
                                  key={sentIdx}
                                  className={isHighlighted ? "rounded-full px-2 py-1" : ""}
                                  style={
                                    isHighlighted && highlightColor
                                      ? { backgroundColor: highlightColor + "30", display: "inline" }
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
  );
}
