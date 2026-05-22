"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Track button refs for a speaker table-of-contents and scroll the active one
 * into view (`nearest`) whenever the active index changes. Shared by the
 * transcript and verbatim-record TOCs. `activeRefIndex` is the *array* index of
 * the active item (callers resolve it from their own active id); `-1` = none.
 */
export function useTocActiveScroll(activeRefIndex: number) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (activeRefIndex < 0) return;
    itemRefs.current[activeRefIndex]?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeRefIndex]);
  return itemRefs;
}

interface TocItemProps {
  isActive: boolean;
  onClick: () => void;
  /** Left-aligned timecode label; omit to hide (e.g. unaligned verbatim records). */
  timestamp?: ReactNode;
  /** Speaker badges / name. */
  children: ReactNode;
  /** Optional trailing adornment (e.g. a topic-color dot). */
  trailing?: ReactNode;
  buttonRef?: (el: HTMLButtonElement | null) => void;
}

/** One row of a speaker table-of-contents: timecode + content + optional dot. */
export function TocItem({
  isActive,
  onClick,
  timestamp,
  children,
  trailing,
  buttonRef,
}: TocItemProps) {
  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-muted",
        isActive && "bg-primary/10",
      )}
    >
      {timestamp != null && (
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {timestamp}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {children}
      </div>
      {trailing}
    </button>
  );
}
