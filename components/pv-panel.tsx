"use client";

import { useState, useEffect, useRef, useMemo, forwardRef, type ReactNode } from "react";
import { ChevronDown, ChevronRight, AudioLines } from "lucide-react";
import type { PVDocument, PVTurn } from "@/lib/pv-parser";

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
  onSpeakersChange?: (speakers: PVSpeakerEntry[], activeTurnIndex: number) => void;
}

/** Client-side aligned turn — fields optional since turns may not be aligned yet. */
type AlignedTurn = PVTurn & {
  startTime?: number;
  endTime?: number;
  proceduralParagraphs?: number[];
  paragraphTimestamps?: number[];
};

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Reference linking ──────────────────────────────────────────────────

const REFERENCE_PATTERNS = [
  // Resolution references: "resolution 2231 (2015)" → S/RES/2231(2015)
  {
    regex: /resolution\s+(\d+)\s*\((\d{4})\)/gi,
    url: (_match: string, num: string, year: string) =>
      `https://undocs.org/S/RES/${num}(${year})`,
    label: (match: string) => match,
  },
  // Document symbols: S/PV.10124, A/RES/79/1, S/2026/8, A/79/L.1, E/2024/SR.10, A/C.1/79/PV.7, A/ES-11/PV.23
  {
    regex: /\b([SAEC]\/(?:[\w.-]+\/)*[\w.-]+\.\d+|[SAEC]\/(?:[\w.-]+\/)*\d+(?:\/[\w.-]+)*)\b/g,
    url: (match: string) => `https://undocs.org/${match}`,
    label: (match: string) => match,
  },
];

function linkifyReferences(text: string): ReactNode[] {
  // Build a combined regex from all patterns
  const allMatches: { start: number; end: number; url: string; label: string }[] = [];

  for (const pattern of REFERENCE_PATTERNS) {
    let m: RegExpExecArray | null;
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    while ((m = re.exec(text)) !== null) {
      const url = typeof pattern.url === "function"
        ? pattern.url(m[0], m[1], m[2])
        : pattern.url;
      allMatches.push({
        start: m.index,
        end: m.index + m[0].length,
        url,
        label: pattern.label(m[0]),
      });
    }
  }

  if (allMatches.length === 0) return [text];

  // Sort by position, remove overlaps (keep earlier/longer)
  allMatches.sort((a, b) => a.start - b.start || b.end - a.end);
  const filtered: typeof allMatches = [];
  let lastEnd = 0;
  for (const m of allMatches) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }

  const result: ReactNode[] = [];
  let cursor = 0;
  for (const m of filtered) {
    if (m.start > cursor) result.push(text.slice(cursor, m.start));
    result.push(
      <a
        key={m.start}
        href={m.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-blue-600 underline decoration-blue-300 hover:decoration-blue-600 dark:text-blue-400 dark:decoration-blue-700 dark:hover:decoration-blue-400"
      >
        {m.label}
      </a>
    );
    cursor = m.end;
  }
  if (cursor < text.length) result.push(text.slice(cursor));
  return result;
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
  const currentTimeRef = useRef<number>(0);
  const lastScrolledTurn = useRef<number>(-1);
  const lastTimeRef = useRef<number>(0);

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
          throw new Error(data.error || `Failed to load PV (${res.status})`);
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
    return pvDoc.turns.map((turn, i): PVSpeakerEntry => ({
      speaker: turn.speaker,
      affiliation: turn.affiliation,
      turnIndex: i,
      timestampMs: (turn as AlignedTurn).startTime ?? -1,
    }));
  }, [pvDoc]);

  useEffect(() => {
    if (pvSpeakers && onSpeakersChange) onSpeakersChange(pvSpeakers, activeTurnIndex);
  }, [pvSpeakers, activeTurnIndex, onSpeakersChange]);

  // rAF-based time tracking at paragraph level.
  // Build a flat sorted list of { turnIndex, paraIndex, startTime } for binary-ish lookup.
  useEffect(() => {
    if (!player || !pvDoc?.aligned) return;

    const turns = pvDoc.turns as AlignedTurn[];
    // Build flat list of paragraph timestamps sorted by time
    const paraEntries: { turnIdx: number; paraIdx: number; startMs: number }[] = [];
    for (let ti = 0; ti < turns.length; ti++) {
      const pts = turns[ti].paragraphTimestamps;
      if (pts) {
        for (let pi = 0; pi < pts.length; pi++) {
          if (pts[pi] >= 0) paraEntries.push({ turnIdx: ti, paraIdx: pi, startMs: pts[pi] });
        }
      } else if (turns[ti].startTime !== undefined && turns[ti].startTime! >= 0) {
        // Legacy: turn-level only
        paraEntries.push({ turnIdx: ti, paraIdx: -1, startMs: turns[ti].startTime! });
      }
    }
    paraEntries.sort((a, b) => a.startMs - b.startMs);

    let rafId: number;
    let lastTurnIdx = -1;
    let lastParaIdx = -1;

    const tick = () => {
      try {
        const time = player.currentTime;
        if (Math.abs(time - currentTimeRef.current) > 0.01) {
          currentTimeRef.current = time;
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

          if (newTurn !== lastTurnIdx || newPara !== lastParaIdx) {
            lastTurnIdx = newTurn;
            lastParaIdx = newPara;
            setActiveTurnIndex(newTurn);
            setActiveParaIndex(newPara);
          }
        }
      } catch {}
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [player, pvDoc]);

  // Auto-scroll to active turn — with jump detection
  useEffect(() => {
    if (activeTurnIndex < 0) return;
    if (lastScrolledTurn.current === activeTurnIndex) return;

    const el = turnRefs.current[activeTurnIndex];
    if (!el) return;

    // Detect if user jumped (time changed by > 5s in one update)
    const time = currentTimeRef.current;
    const timeDelta = Math.abs(time - lastTimeRef.current);
    const isJump = timeDelta > 5;
    lastTimeRef.current = time;

    const scrollContainer = el.closest(".overflow-y-auto");

    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const elementRect = el.getBoundingClientRect();
      const relativeTop = elementRect.top - containerRect.top;
      const isRoughlyInView =
        relativeTop > -containerRect.height * 1.5 &&
        relativeTop < containerRect.height * 2.5;

      if (isJump || !isRoughlyInView) {
        // Instant scroll on jump or far away
        const targetScroll =
          elementRect.top -
          containerRect.top +
          scrollContainer.scrollTop -
          containerRect.height * 0.3;
        scrollContainer.scrollTo({ top: targetScroll, behavior: isJump ? "instant" : "smooth" });
      } else {
        // Gentle scroll during playback — keep near top third
        const targetScroll =
          elementRect.top -
          containerRect.top +
          scrollContainer.scrollTop -
          containerRect.height * 0.3;
        scrollContainer.scrollTo({ top: targetScroll, behavior: "smooth" });
      }
    } else {
      // No scroll container — use window scroll
      el.scrollIntoView({
        behavior: isJump ? "instant" : "smooth",
        block: "center",
      });
    }

    lastScrolledTurn.current = activeTurnIndex;
  }, [activeTurnIndex]);

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
        throw new Error(data.error || `Alignment failed (${res.status})`);
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
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Loading {pvSymbol.includes("/SR.") ? "Summary Record" : "Verbatim Record"}...
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  if (!pvDoc) return null;

  const isAligned = pvDoc.aligned;
  const isSR = pvDoc.symbol?.includes("/SR.");

  return (
    <div className="space-y-3">
      {/* Metadata header — expandable for PV, simple label for SR */}
      <div className="flex items-center gap-2">
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
            {pvDoc.status === "provisional" ? " (Provisional)" : ""}
          </button>
        )}

        {/* Align button */}
        {kalturaId && !isAligned && (
          <button
            onClick={handleAlign}
            disabled={aligning}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {aligning ? (
              <>
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Aligning…
              </>
            ) : (
              <>
                <AudioLines className="h-3 w-3" />
                Align with audio
              </>
            )}
          </button>
        )}

        {isAligned && (
          <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400">
            ✓ Aligned
          </span>
        )}
      </div>

      {!isSR && showMetadata && (
        <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-2">
          {pvDoc.president && (
            <div>
              <span className="font-medium">President:</span>{" "}
              {pvDoc.president.name} ({pvDoc.president.country})
            </div>
          )}

          {pvDoc.members.length > 0 && (
            <div>
              <span className="font-medium">
                Members ({pvDoc.members.length}):
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
              <span className="font-medium">Agenda:</span>
              <ul className="mt-1 list-inside list-disc text-muted-foreground">
                {pvDoc.agendaItems.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Speaker turns */}
      {pvDoc.turns.map((turn, i) => (
        <PVTurnCard
          key={i}
          turn={turn as AlignedTurn}
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
  isActive: boolean;
  activeParaIndex: number;
  isAligned: boolean;
  onSeek: (timestampMs: number) => void;
}

const PVTurnCard = forwardRef<HTMLDivElement, PVTurnCardProps>(
  function PVTurnCard({ turn, isActive, activeParaIndex, isAligned, onSeek }, ref) {
    const hasTimestamp =
      turn.startTime !== undefined && turn.startTime >= 0;
    const hasParagraphTimestamps = turn.paragraphTimestamps && turn.paragraphTimestamps.some(t => t >= 0);

    return (
      <div
        ref={ref}
        className="space-y-1 pt-2"
        data-turn-start={turn.startTime}
      >
        {/* Speaker header */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold tracking-wide text-foreground">
            <div className="flex flex-wrap items-center gap-1.5">
              {turn.affiliation && (
                <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
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
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
              title="Jump to this timestamp"
            >
              {formatTime(turn.startTime!)}
            </button>
          )}
        </div>

        {/* On behalf of preamble */}
        {turn.onBehalfOf && (
          <p className="text-xs italic text-muted-foreground">
            {turn.onBehalfOf}
          </p>
        )}

        {/* Content — each paragraph individually clickable when aligned */}
        <div className="space-y-3">
          {turn.paragraphs.map((para, j) => {
            const isProcedural = turn.proceduralParagraphs?.includes(j);
            const paraTs = turn.paragraphTimestamps?.[j];
            const hasParaTs = paraTs !== undefined && paraTs >= 0;
            const isParaClickable = isAligned && hasParaTs;
            const isActivePara = isActive && (activeParaIndex === j || (activeParaIndex === -1 && j === 0));

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
                className={`rounded-lg border p-3 text-sm leading-relaxed transition-colors duration-200 ${
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
                  className={`text-start ${isProcedural ? "italic text-muted-foreground" : ""}`}
                >
                  {paraNum !== undefined && (
                    <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-un-blue)] text-[10px] font-semibold text-white align-text-top">
                      {paraNum}
                    </span>
                  )}
                  {hasParaTs && (
                    <span
                      className="mr-1.5 text-[10px] text-muted-foreground"
                      title="Paragraph timestamp"
                    >
                      {formatTime(paraTs!)}
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

export function PVSpeakerToc({ speakers, activeTurnIndex, onSeek }: PVSpeakerTocProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (activeTurnIndex < 0) return;
    const idx = speakers.findIndex(s => s.turnIndex === activeTurnIndex);
    const el = idx >= 0 ? itemRefs.current[idx] : null;
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeTurnIndex, speakers]);

  if (speakers.length === 0) return null;

  return (
    <div>
      {speakers.map((entry, idx) => {
        const isActive = entry.turnIndex === activeTurnIndex;
        const hasTimestamp = entry.timestampMs >= 0;

        return (
          <button
            key={idx}
            ref={(el) => { itemRefs.current[idx] = el; }}
            onClick={() => hasTimestamp && onSeek(entry.timestampMs)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-muted ${
              isActive ? "bg-primary/10" : ""
            } ${hasTimestamp ? "" : "opacity-60"}`}
          >
            {hasTimestamp && (
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {formatTime(entry.timestampMs)}
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {entry.affiliation && (
                <span className="rounded bg-blue-100 px-1 py-px text-[10px] font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {entry.affiliation}
                </span>
              )}
              <span className="truncate font-medium">{entry.speaker}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
