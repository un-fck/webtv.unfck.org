"use client";

import { useEffect, useRef } from "react";
import type { SpeakerMapping } from "@/lib/speakers";

interface SpeakerSegment {
  speaker: string;
  statementIndices: number[];
  timestamp: number;
}

interface StatementForTopic {
  paragraphs: Array<{
    sentences: Array<{
      topic_keys?: string[];
    }>;
  }>;
}

interface SpeakerTocProps {
  segments: SpeakerSegment[];
  speakerMappings: SpeakerMapping;
  countryNames: Map<string, string>;
  activeSegmentIndex: number;
  onSeek: (timestampSeconds: number) => void;
  selectedTopic?: string | null;
  topicColor?: string | null;
  statements?: StatementForTopic[] | null;
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function segmentHasTopic(
  segment: SpeakerSegment,
  statements: StatementForTopic[],
  topicKey: string,
): boolean {
  return segment.statementIndices.some((stmtIdx) => {
    const stmt = statements[stmtIdx];
    if (!stmt) return false;
    return stmt.paragraphs.some((para) =>
      para.sentences.some((sent) => sent.topic_keys?.includes(topicKey)),
    );
  });
}

export function SpeakerToc({
  segments,
  speakerMappings,
  countryNames,
  activeSegmentIndex,
  onSeek,
  selectedTopic,
  topicColor,
  statements,
}: SpeakerTocProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (activeSegmentIndex < 0) return;
    const el = itemRefs.current[activeSegmentIndex];
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeSegmentIndex]);

  if (segments.length === 0) return null;

  return (
    <div>
      {segments.map((segment, idx) => {
        const isActive = idx === activeSegmentIndex;
        const firstStmtIndex = segment.statementIndices[0] ?? 0;
        const info = speakerMappings[firstStmtIndex.toString()];

        const hasAffiliation = !!info?.affiliation;
        const hasGroup = !!info?.group;
        const hasFunction =
          !!info?.function &&
          info.function.toLowerCase() !== "representative" &&
          !/^speaker\s/i.test(info.function);
        const hasName =
          !!info?.name && !/^speaker\s/i.test(info.name);

        // Skip entries with no meaningful info
        if (!hasAffiliation && !hasGroup && !hasFunction && !hasName)
          return null;

        const hasTopic =
          selectedTopic && statements
            ? segmentHasTopic(segment, statements, selectedTopic)
            : false;

        return (
          <button
            key={idx}
            ref={(el) => {
              itemRefs.current[idx] = el;
            }}
            onClick={() => onSeek(segment.timestamp)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-muted ${
              isActive ? "bg-primary/10" : ""
            }`}
          >
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {formatTime(segment.timestamp)}
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {hasAffiliation && (
                <span className="rounded bg-blue-100 px-1 py-px text-[10px] font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {countryNames.get(info!.affiliation!) || info!.affiliation}
                </span>
              )}
              {hasGroup && (
                <span className="rounded bg-purple-100 px-1 py-px text-[10px] font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                  {info!.group}
                </span>
              )}
              {hasFunction && (
                <span className="text-muted-foreground">
                  {info!.function}
                </span>
              )}
              {hasName && (
                <span className="truncate font-medium">{info!.name}</span>
              )}
            </div>
            {hasTopic && topicColor && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: topicColor }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
