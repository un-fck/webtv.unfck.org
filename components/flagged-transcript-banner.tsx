"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";
import type { Stage } from "@/components/stage-progress";

interface FlaggedTranscriptBannerProps {
  sourceDurationMs: number | null;
  alignedDurationMs: number | null;
  isLoggedIn: boolean;
  /** Stage of an in-flight fresh transcription, or null if none running. */
  pendingStage: Stage | null;
  starting: boolean;
  error: string | null;
  onRetranscribe: () => void;
}

function formatDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "?";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h${m}m` : `${h}h`;
  return `${m}m`;
}

export function FlaggedTranscriptBanner({
  sourceDurationMs,
  alignedDurationMs,
  isLoggedIn,
  pendingStage,
  starting,
  error,
  onRetranscribe,
}: FlaggedTranscriptBannerProps) {
  const t = useTranslations("transcript.panel");
  const original = formatDuration(sourceDurationMs);
  const current = formatDuration(alignedDurationMs);
  const inProgress = pendingStage != null;
  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/20">
      <p className={cn(typography.label, "text-amber-900 dark:text-amber-200")}>
        {t("audioOutOfSyncTitle")}
      </p>
      <p
        className={cn(
          typography.body,
          "mt-1 text-amber-900/90 dark:text-amber-200/90",
        )}
      >
        {t("audioOutOfSyncBody", {
          originalDuration: original,
          currentDuration: current,
        })}
      </p>
      <div className="mt-2">
        {inProgress ? (
          <span
            className={cn(
              typography.caption,
              "inline-flex items-center gap-2 text-amber-900/80 dark:text-amber-200/80",
            )}
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            {t("audioOutOfSyncInProgress")}
          </span>
        ) : isLoggedIn ? (
          <button
            type="button"
            onClick={onRetranscribe}
            disabled={starting}
            className={cn(
              typography.label,
              "rounded-md border border-amber-300 bg-white px-3 py-1.5 text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-60 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100 dark:hover:bg-amber-900/50",
            )}
          >
            {starting
              ? t("audioOutOfSyncStarting")
              : t("audioOutOfSyncRequest")}
          </button>
        ) : (
          <Link
            href="/login"
            className={cn(
              typography.label,
              "inline-block text-amber-900 underline underline-offset-2 hover:text-amber-700 dark:text-amber-200 dark:hover:text-amber-300",
            )}
          >
            {t("audioOutOfSyncSignIn")}
          </Link>
        )}
      </div>
      {error && (
        <p
          className={cn(
            typography.caption,
            "mt-2 text-red-700 dark:text-red-300",
          )}
        >
          {error}
        </p>
      )}
    </div>
  );
}
