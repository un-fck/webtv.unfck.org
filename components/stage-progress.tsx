"use client";

import { Check, RotateCcw } from "lucide-react";

export type Stage =
  | "idle"
  | "scheduled"
  | "transcribing"
  | "identifying_speakers"
  | "analyzing_topics"
  | "analyzing_propositions"
  | "completed"
  | "error";

export const STAGES: { key: Stage; label: string }[] = [
  { key: "transcribing", label: "Transcribing audio" },
  { key: "analyzing_topics", label: "Analyzing topics" },
];

export function getStageIndex(stage: Stage): number {
  // identifying_speakers is transient — map to "just finished transcribing"
  if (stage === "identifying_speakers") return 0;
  return STAGES.findIndex((s) => s.key === stage);
}

export function StageProgress({
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
