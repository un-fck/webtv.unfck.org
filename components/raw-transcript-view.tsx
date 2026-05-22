"use client";

import { formatTimecode } from "@/lib/transcript-formatting";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

interface RawParagraph {
  text: string;
  start: number;
  end: number;
  speaker?: string;
  words?: Array<{ text: string; start: number; end: number; speaker?: string }>;
}

interface RawTranscriptViewProps {
  rawParagraphs: RawParagraph[];
  onSeek: (timestampSeconds: number) => void;
}

export function RawTranscriptView({
  rawParagraphs,
  onSeek,
}: RawTranscriptViewProps) {
  return (
    <div className="space-y-3">
      {rawParagraphs.map((para, idx) => {
        const speaker = para.speaker ?? para.words?.[0]?.speaker ?? "A";
        const prev = idx > 0 ? rawParagraphs[idx - 1] : null;
        const prevSpeaker = prev
          ? (prev.speaker ?? prev.words?.[0]?.speaker ?? "A")
          : null;
        const showHeader = speaker !== prevSpeaker;

        return (
          <div key={idx}>
            {showHeader && (
              <div className={cn(typography.speakerLabel, "mb-2 pt-3")}>
                Speaker {speaker}
                <button
                  onClick={() => onSeek(para.start / 1000)}
                  className={cn(
                    typography.caption,
                    "ml-2 hover:text-primary hover:underline",
                  )}
                >
                  [{formatTimecode(para.start / 1000)}]
                </button>
              </div>
            )}
            <div
              dir="auto"
              className={cn(
                typography.body,
                "rounded-lg bg-muted/50 p-4 text-start",
              )}
            >
              {para.words && para.words.length > 0 ? (
                para.words.map((word, wIdx) => (
                  <span
                    key={wIdx}
                    onClick={() => onSeek(word.start / 1000)}
                    className="cursor-pointer hover:opacity-70"
                  >
                    {word.text}{" "}
                  </span>
                ))
              ) : (
                // No per-word timing: the whole segment is one seekable unit.
                <span
                  onClick={() => onSeek(para.start / 1000)}
                  className="cursor-pointer hover:opacity-70"
                >
                  {para.text}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
