"use client";

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  forwardRef,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, AudioLines } from "lucide-react";
import type { PVDocument, PVTurn } from "@/lib/pv-parser";
import { findReferences } from "@/lib/pv-reference-linking";
import { TocItem, useTocActiveScroll } from "@/components/toc-item";
import { ExternalLink } from "@/components/external-link";
import { getPVDocumentUrl } from "@/lib/pv-documents";
import { scrollElementIntoView } from "@/lib/scroll-into-view";
import { useScrollToActive } from "@/lib/hooks/use-scroll-to-active";
import { useRafPlaybackTime } from "@/lib/hooks/use-raf-playback-time";
import { formatTimecodeMs } from "@/lib/transcript-formatting";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

export interface PVSpeakerEntry {
  speaker: string;
  affiliation?: string;
  turnIndex: number;
  timestampMs: number;
}

interface PVPanelProps {
  pvSymbol: string;
  language?: string;
  player?: { currentTime: number; play: () => void } | null;
  kalturaId?: string;
  onSpeakersChange?: (
    speakers: PVSpeakerEntry[],
    activeTurnIndex: number,
  ) => void;
}

/** Client-side aligned turn — fields optional since turns may not be aligned yet. */
type AlignedTurn = PVTurn & {
  startTime?: number;
  endTime?: number;
  proceduralParagraphs?: number[];
  paragraphTimestamps?: number[];
};

// ── Reference linking ──────────────────────────────────────────────────
// Matching logic lives in lib/pv-reference-linking.ts; this renders the links.

function linkifyReferences(text: string): ReactNode[] {
  const filtered = findReferences(text);
  if (filtered.length === 0) return [text];

  const result: ReactNode[] = [];
  let cursor = 0;
  for (const m of filtered) {
    if (m.start > cursor) result.push(text.slice(cursor, m.start));
    result.push(
      <ExternalLink
        key={m.start}
        href={m.url}
        onClick={(e) => e.stopPropagation()}
        className="text-blue-600 underline decoration-blue-300 hover:decoration-blue-600 dark:text-blue-400 dark:decoration-blue-700 dark:hover:decoration-blue-400"
      >
        {m.label}
      </ExternalLink>,
    );
    cursor = m.end;
  }
  if (cursor < text.length) result.push(text.slice(cursor));
  return result;
}

function PvParagraphSkeleton({ lineCount }: { lineCount: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: lineCount }).map((_, i) => (
        <div
          key={i}
          className={`h-3 animate-pulse rounded bg-muted/60 ${i === lineCount - 1 ? "w-3/5" : "w-full"}`}
        />
      ))}
    </div>
  );
}

export function PVPanel({
  pvSymbol,
  language = "en",
  player,
  kalturaId,
  onSpeakersChange,
}: PVPanelProps) {
  const [pvDoc, setPvDoc] = useState<
    (PVDocument & { aligned?: boolean }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [aligning, setAligning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMetadata, setShowMetadata] = useState(false);
  const [activeTurnIndex, setActiveTurnIndex] = useState<number>(-1);
  const [activeParaIndex, setActiveParaIndex] = useState<number>(-1);
  const turnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const t = useTranslations("pv");

  // Fetch PV document
  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(
      `/api/pv?symbol=${encodeURIComponent(pvSymbol)}&lang=${encodeURIComponent(language)}`,
    )
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg =
            (typeof data.error === "object" && data.error?.message) ||
            (typeof data.error === "string" && data.error) ||
            `Failed to load PV (${res.status})`;
          throw new Error(msg);
        }
        return res.json();
      })
      .then((doc: PVDocument & { aligned?: boolean }) => {
        setPvDoc(doc);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [pvSymbol, language]);

  // Notify parent of PV speakers for sidebar
  const pvSpeakers = useMemo(() => {
    if (!pvDoc) return null;
    return pvDoc.turns.map(
      (turn, i): PVSpeakerEntry => ({
        speaker: turn.speaker,
        affiliation: turn.affiliation,
        turnIndex: i,
        timestampMs: (turn as AlignedTurn).startTime ?? -1,
      }),
    );
  }, [pvDoc]);

  useEffect(() => {
    if (pvSpeakers && onSpeakersChange)
      onSpeakersChange(pvSpeakers, activeTurnIndex);
  }, [pvSpeakers, activeTurnIndex, onSpeakersChange]);

  // Flat list of paragraph start times, sorted, for active-turn lookup.
  const paraEntries = useMemo(() => {
    if (!pvDoc?.aligned) return [];
    const turns = pvDoc.turns as AlignedTurn[];
    const entries: { turnIdx: number; paraIdx: number; startMs: number }[] = [];
    for (let ti = 0; ti < turns.length; ti++) {
      const pts = turns[ti].paragraphTimestamps;
      if (pts) {
        for (let pi = 0; pi < pts.length; pi++) {
          if (pts[pi] >= 0)
            entries.push({ turnIdx: ti, paraIdx: pi, startMs: pts[pi] });
        }
      } else if (
        turns[ti].startTime !== undefined &&
        turns[ti].startTime! >= 0
      ) {
        // Legacy: turn-level only
        entries.push({
          turnIdx: ti,
          paraIdx: -1,
          startMs: turns[ti].startTime!,
        });
      }
    }
    entries.sort((a, b) => a.startMs - b.startMs);
    return entries;
  }, [pvDoc]);

  // rAF-based time tracking at paragraph level (only while aligned). Setting an
  // unchanged index is a no-op (React bails out), so no manual change-tracking.
  const currentTimeRef = useRafPlaybackTime(
    pvDoc?.aligned ? player : undefined,
    (time) => {
      const timeMs = time * 1000;
      let newTurn = -1;
      let newPara = -1;
      for (let i = paraEntries.length - 1; i >= 0; i--) {
        if (timeMs >= paraEntries[i].startMs) {
          newTurn = paraEntries[i].turnIdx;
          newPara = paraEntries[i].paraIdx;
          break;
        }
      }
      setActiveTurnIndex(newTurn);
      setActiveParaIndex(newPara);
    },
  );

  // Auto-scroll to the active turn as playback advances.
  useScrollToActive({
    activeKey: activeTurnIndex,
    getElement: (key) => turnRefs.current[key as number] ?? null,
    currentTimeRef,
  });

  const seekToTimestamp = (timestampMs: number) => {
    if (!player) return;
    try {
      player.currentTime = timestampMs / 1000;
      player.play();
    } catch {}
  };

  const handleAlign = async () => {
    if (!kalturaId || !pvDoc || aligning) return;
    setAligning(true);

    try {
      const res = await fetch("/api/pv/align", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pvSymbol, kalturaId, language }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg =
          (typeof data.error === "object" && data.error?.message) ||
          (typeof data.error === "string" && data.error) ||
          `Alignment failed (${res.status})`;
        throw new Error(msg);
      }

      const aligned = await res.json();
      setPvDoc(aligned);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Alignment failed");
    } finally {
      setAligning(false);
    }
  };

  if (loading) {
    // Document-shape skeleton instead of a spinner — the PV/SR PDF is
    // mostly text-on-text, so a stack of paragraph bars previews the
    // shape that's coming.
    return (
      <div
        role="status"
        aria-busy
        aria-label={
          pvSymbol.includes("/SR.") ? t("loadingSummary") : t("loadingVerbatim")
        }
        className="space-y-5 py-4"
      >
        <PvParagraphSkeleton lineCount={4} />
        <PvParagraphSkeleton lineCount={6} />
        <PvParagraphSkeleton lineCount={3} />
        <PvParagraphSkeleton lineCount={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2 py-8 text-center text-sm text-muted-foreground">
        <p>
          {t.rich("loadFailed", {
            odsLink: (chunks) => (
              <ExternalLink
                href={getPVDocumentUrl(pvSymbol, language)}
                className="underline underline-offset-2 hover:opacity-75"
              >
                {chunks}
              </ExternalLink>
            ),
          })}
        </p>
        <p className="text-xs opacity-70">{error}</p>
      </div>
    );
  }

  if (!pvDoc) return null;

  const isAligned = pvDoc.aligned;
  const isSR = pvDoc.symbol?.includes("/SR.");

  return (
    <div className="space-y-3">
      {/* Metadata header — expandable for PV, simple label for SR */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {isSR ? (
          <span className="text-xs text-muted-foreground">
            {pvDoc.symbol} — {pvDoc.body}
            {pvDoc.session ? `, ${pvDoc.session}` : ""}
          </span>
        ) : (
          <button
            onClick={() => setShowMetadata(!showMetadata)}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {showMetadata ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {pvDoc.symbol} — {pvDoc.body}
            {pvDoc.session ? `, ${pvDoc.session}` : ""}
            {pvDoc.status === "provisional" ? ` ${t("provisional")}` : ""}
          </button>
        )}

        {/* Align button */}
        {kalturaId && !isAligned && (
          <button
            onClick={handleAlign}
            disabled={aligning}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors hover:bg-muted disabled:opacity-50"
          >
            {aligning ? (
              <>
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t("aligning")}
              </>
            ) : (
              <>
                <AudioLines className="h-3 w-3" />
                {t("alignWithAudio")}
              </>
            )}
          </button>
        )}

        {isAligned && (
          <span className="ms-auto text-xs whitespace-nowrap text-emerald-600 dark:text-emerald-400">
            {t("aligned")}
          </span>
        )}
      </div>

      {!isSR && showMetadata && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
          {pvDoc.president && (
            <div>
              <span className="font-medium">{t("president")}:</span>{" "}
              {pvDoc.president.name} ({pvDoc.president.country})
            </div>
          )}

          {pvDoc.members.length > 0 && (
            <div>
              <span className="font-medium">
                {t("members")} ({pvDoc.members.length}):
              </span>
              <div className="mt-1 grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                {pvDoc.members.map((m, i) => (
                  <div key={i} className="text-muted-foreground">
                    {m.country} — {m.representative}
                  </div>
                ))}
              </div>
            </div>
          )}

          {pvDoc.agendaItems.length > 0 && (
            <div>
              <span className="font-medium">{t("agenda")}:</span>
              <ul className="mt-1 list-inside list-disc text-muted-foreground">
                {pvDoc.agendaItems.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-1">
            <ExternalLink
              href={getPVDocumentUrl(pvDoc.symbol, language)}
              className="text-primary hover:underline"
            >
              {pvDoc.symbol} (PDF) →
            </ExternalLink>
          </div>
        </div>
      )}

      {/* Speaker turns */}
      {pvDoc.turns.map((turn, i) => (
        <PVTurnCard
          key={i}
          turn={turn as AlignedTurn}
          turnIndex={i}
          ref={(el) => {
            turnRefs.current[i] = el;
          }}
          isActive={i === activeTurnIndex}
          activeParaIndex={i === activeTurnIndex ? activeParaIndex : -1}
          isAligned={!!isAligned}
          onSeek={seekToTimestamp}
        />
      ))}
    </div>
  );
}

interface PVTurnCardProps {
  turn: AlignedTurn;
  turnIndex: number;
  isActive: boolean;
  activeParaIndex: number;
  isAligned: boolean;
  onSeek: (timestampMs: number) => void;
}

const PVTurnCard = forwardRef<HTMLDivElement, PVTurnCardProps>(
  function PVTurnCard(
    { turn, turnIndex, isActive, activeParaIndex, isAligned, onSeek },
    ref,
  ) {
    const t = useTranslations("pv");
    const hasTimestamp = turn.startTime !== undefined && turn.startTime >= 0;
    const hasParagraphTimestamps =
      turn.paragraphTimestamps && turn.paragraphTimestamps.some((t) => t >= 0);

    return (
      <div
        ref={ref}
        id={`pv-turn-${turnIndex}`}
        className="scroll-mt-[20vh] space-y-1 pt-2"
        data-turn-start={turn.startTime}
      >
        {/* Speaker header */}
        <div className="flex flex-wrap items-center gap-2">
          <div className={typography.speakerLabel}>
            <div className="flex flex-wrap items-center gap-1.5">
              {turn.affiliation && (
                <span
                  className={cn(
                    typography.label,
                    "inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
                  )}
                >
                  {turn.affiliation}
                </span>
              )}
              {turn.spokenLanguage && (
                <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {turn.spokenLanguage.toUpperCase()}
                </span>
              )}
              <span className="text-sm font-semibold">{turn.speaker}</span>
            </div>
          </div>
          {hasTimestamp && !hasParagraphTimestamps && (
            <button
              onClick={() => onSeek(turn.startTime!)}
              className={cn(
                typography.caption,
                "rounded px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-primary",
              )}
              title={t("jumpToTimestamp")}
            >
              {formatTimecodeMs(turn.startTime!)}
            </button>
          )}
        </div>

        {/* On behalf of preamble */}
        {turn.onBehalfOf && (
          <p className={cn(typography.caption, "italic")}>{turn.onBehalfOf}</p>
        )}

        {/* Content — each paragraph individually clickable when aligned */}
        <div className="space-y-3">
          {turn.paragraphs.map((para, j) => {
            const isProcedural = turn.proceduralParagraphs?.includes(j);
            const paraTs = turn.paragraphTimestamps?.[j];
            const hasParaTs = paraTs !== undefined && paraTs >= 0;
            const isParaClickable = isAligned && hasParaTs;
            const isActivePara =
              isActive &&
              (activeParaIndex === j || (activeParaIndex === -1 && j === 0));

            // Extract paragraph number
            let paraNum: number | undefined;
            let paraText = para;
            if (j === 0 && turn.paragraphNumber) {
              paraNum = turn.paragraphNumber;
            } else {
              const numMatch = para.match(/^(\d{1,3})\.\s+/);
              if (numMatch) {
                paraNum = parseInt(numMatch[1]);
                paraText = para.slice(numMatch[0].length);
              }
            }

            return (
              <div
                key={j}
                onClick={isParaClickable ? () => onSeek(paraTs!) : undefined}
                className={`${cn(typography.body, "rounded-lg border p-3 transition-colors duration-200")} ${
                  isParaClickable ? "cursor-pointer" : ""
                } ${
                  turn.type === "procedural"
                    ? "border-amber-200/50 bg-amber-50/30 dark:border-amber-800/30 dark:bg-amber-950/10"
                    : isActivePara
                      ? "border-primary/40 bg-primary/5"
                      : "border-transparent bg-muted/40"
                }`}
              >
                <p
                  dir="auto"
                  className={`text-start ${isProcedural ? "text-muted-foreground italic" : ""}`}
                >
                  {paraNum !== undefined && (
                    <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-un-blue)] align-text-top text-[10px] font-semibold text-white">
                      {paraNum}
                    </span>
                  )}
                  {hasParaTs && (
                    <span
                      className="mr-1.5 text-[10px] text-muted-foreground"
                      title={t("paragraphTimestamp")}
                    >
                      {formatTimecodeMs(paraTs!)}
                    </span>
                  )}
                  {linkifyReferences(paraText)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);

// ── PV Speaker sidebar ─────────────────────────────────────────────────

interface PVSpeakerTocProps {
  speakers: PVSpeakerEntry[];
  activeTurnIndex: number;
  onSeek: (timestampMs: number) => void;
}

export function PVSpeakerToc({
  speakers,
  activeTurnIndex,
  onSeek,
}: PVSpeakerTocProps) {
  const itemRefs = useTocActiveScroll(
    speakers.findIndex((s) => s.turnIndex === activeTurnIndex),
  );

  // Jump to the speaker's turn bubble. Always scrolls the transcript (works even
  // without audio alignment); also seeks the video when a timestamp exists.
  const handleClick = (entry: PVSpeakerEntry) => {
    const el = document.getElementById(`pv-turn-${entry.turnIndex}`);
    if (el) scrollElementIntoView(el, "smooth");
    if (entry.timestampMs >= 0) onSeek(entry.timestampMs);
  };

  if (speakers.length === 0) return null;

  return (
    <div>
      {speakers.map((entry, idx) => (
        <TocItem
          key={idx}
          buttonRef={(el) => {
            itemRefs.current[idx] = el;
          }}
          isActive={entry.turnIndex === activeTurnIndex}
          onClick={() => handleClick(entry)}
          timestamp={
            entry.timestampMs >= 0
              ? formatTimecodeMs(entry.timestampMs)
              : undefined
          }
        >
          {entry.affiliation && (
            <span className="rounded bg-blue-100 px-1 py-px text-[10px] font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
              {entry.affiliation}
            </span>
          )}
          <span className="truncate font-medium">{entry.speaker}</span>
        </TocItem>
      ))}
    </div>
  );
}
