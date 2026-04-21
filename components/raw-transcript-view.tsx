"use client";

interface RawParagraph {
  text: string;
  start: number;
  end: number;
  words: Array<{ text: string; start: number; end: number; speaker?: string }>;
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
                  onClick={() => onSeek(para.start / 1000)}
                  className="ml-2 text-xs text-muted-foreground hover:text-primary hover:underline"
                >
                  [{formatTime(para.start / 1000)}]
                </button>
              </div>
            )}
            <div
              dir="auto"
              className="text-start rounded-lg bg-muted/50 p-4 text-sm leading-relaxed"
            >
              {para.words.map((word, wIdx) => (
                <span
                  key={wIdx}
                  onClick={() => onSeek(word.start / 1000)}
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
  );
}
