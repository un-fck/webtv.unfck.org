"use client";

import type { ServerParams } from "@/app/page";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Video } from "@/lib/un-api";
import {
  CalendarIcon,
  ChevronDown,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTimezone } from "@/lib/hooks/use-timezone";
import { rememberScheduleUrl } from "@/lib/schedule-return";
import {
  formatMeetingTime,
  formatMeetingDate,
  formatMeetingDateTime,
} from "@/lib/timezone";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

// Semantic grouping for the category filter rows. Each inner array is one row,
// in display order. This also drives the day/category header ordering within
// the schedule (CATEGORY_ORDER is the flattened form). Anything not listed
// sorts after these (alphabetically); uncategorized ("") sorts last.
const CATEGORY_GROUPS: string[][] = [
  // Press & media
  [
    "Press Conferences",
    "Media Stakeouts",
    "Media",
    "Concerts",
    "Goals Lounge",
    "SDG Studio",
    "Features",
  ],
  // Principal organs & bodies
  [
    "General Assembly",
    "Security Council",
    "Economic and Social Council",
    "Human Rights Council",
    "Human Rights Treaty Bodies",
    "Trusteeship Council",
    "International Court of Justice",
  ],
  // Events & agencies
  [
    "Agencies, Funds & Programmes",
    "High-level Events",
    "Conferences",
    "Side Events",
    "Meetings & Events",
  ],
];
const CATEGORY_ORDER: string[] = CATEGORY_GROUPS.flat();
const CATEGORY_RANK = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));

// Sort categories by the hardcoded order; unknown categories go after the known
// ones (alphabetically), and the empty/uncategorized bucket goes dead last.
function compareCategories(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "") return 1;
  if (b === "") return -1;
  const ra = CATEGORY_RANK.get(a) ?? Number.POSITIVE_INFINITY;
  const rb = CATEGORY_RANK.get(b) ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b);
}

// Format an "HH:MM:SS" duration: decimal hours over an hour ("3.5h", "2h"),
// minutes under an hour ("44min").
function formatDuration(duration: string): string | null {
  if (!duration || duration === "00:00:00") return null;
  const parts = duration.split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  let h = 0;
  let m = 0;
  if (parts.length === 3) [h, m] = parts;
  else if (parts.length === 2) [m] = parts;
  const totalMin = h * 60 + m;
  if (totalMin === 0) return "<1min";
  if (totalMin < 60) return `${m}min`;
  const hours = Math.round((totalMin / 60) * 10) / 10;
  return `${hours}h`;
}

// --- Filter popovers ---

// Shared trigger styling for the filter-toolbar dropdown buttons.
const TOOLBAR_TRIGGER =
  "inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors";
const toolbarTriggerClass = (active: boolean) =>
  cn(
    TOOLBAR_TRIGGER,
    active
      ? "border-primary/40 bg-primary/10 text-primary"
      : "border-slate-300 bg-white text-muted-foreground hover:text-foreground",
  );

function DateFilterPopover({
  availableDates,
  selectedDate,
  onChange,
}: {
  availableDates: string[];
  selectedDate: string | undefined;
  onChange: (date: string | undefined) => void;
}) {
  const { timezone } = useTimezone();
  const isActive = !!selectedDate;

  // Build set of date strings that have videos
  const availableDaySet = useMemo(
    () => new Set(availableDates),
    [availableDates],
  );

  // Only enable days that have videos
  const disabledMatcher = (date: Date) => {
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return !availableDaySet.has(iso);
  };

  // Default month to show: selected date, or most recent available date
  const defaultMonth = selectedDate
    ? new Date(selectedDate + "T00:00:00")
    : availableDates[0]
      ? new Date(availableDates[0] + "T00:00:00")
      : undefined;

  const selectedDateObj = selectedDate
    ? new Date(selectedDate + "T00:00:00")
    : undefined;

  return (
    <Popover>
      <PopoverTrigger className={toolbarTriggerClass(isActive)}>
        <CalendarIcon className="h-4 w-4" />
        <span>{selectedDate ? formatMeetingDate(selectedDate, timezone) : "Date"}</span>
        {selectedDate ? (
          <X
            className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange(undefined);
            }}
          />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {selectedDate && (
          <button
            onClick={() => onChange(undefined)}
            className="flex w-full items-center gap-1 border-b px-3 py-2 text-xs text-gray-500 hover:text-gray-700"
          >
            <X className="h-3 w-3" /> Clear date filter
          </button>
        )}
        <Calendar
          mode="single"
          selected={selectedDateObj}
          onSelect={(day) => {
            if (day) {
              const yyyy = day.getFullYear();
              const mm = String(day.getMonth() + 1).padStart(2, "0");
              const dd = String(day.getDate()).padStart(2, "0");
              onChange(`${yyyy}-${mm}-${dd}`);
            } else {
              onChange(undefined);
            }
          }}
          defaultMonth={defaultMonth}
          disabled={disabledMatcher}
        />
      </PopoverContent>
    </Popover>
  );
}

// Category filter rendered inline as grouped rows of toggle pills (no dropdown).
// Categories are bucketed into the semantic CATEGORY_GROUPS rows; only those
// present in the data are shown. Any present category not in a defined group is
// appended as a trailing row so nothing is dropped.
function CategoryFilterRows({
  options,
  selected,
  onChange,
  counts,
}: {
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  counts?: Record<string, number>;
}) {
  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  // Hide rarely-used categories (fewer than 10 meetings) to keep the rows tidy.
  const present = new Set(options.filter((c) => (counts?.[c] ?? 0) >= 10));
  const rows: string[][] = CATEGORY_GROUPS.map((group) =>
    group.filter((c) => present.has(c)),
  ).filter((row) => row.length > 0);

  // Any present category not in a defined group (incl. unknown future ones).
  const grouped = new Set(CATEGORY_GROUPS.flat());
  const ungrouped = [...present]
    .filter((c) => !grouped.has(c))
    .sort((a, b) => (counts?.[b] ?? 0) - (counts?.[a] ?? 0));
  if (ungrouped.length > 0) rows.push(ungrouped);

  if (rows.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap gap-1.5">
          {row.map((opt) => (
            <button
              key={opt}
              onClick={() => toggle(opt)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                selected.includes(opt)
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {opt}
              {counts?.[opt] !== undefined && (
                <span
                  className={cn(
                    "ml-1",
                    selected.includes(opt) ? "opacity-75" : "opacity-50",
                  )}
                >
                  {counts[opt]}
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// Search box, shared by the desktop and mobile filter bars. The wrapper width
// is the only thing that differs between breakpoints (className).
function SearchInput({
  value,
  onChange,
  onSubmit,
  isFocused,
  setIsFocused,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isFocused: boolean;
  setIsFocused: (focused: boolean) => void;
  className?: string;
}) {
  const highlighted = isFocused || value.trim().length > 0;
  return (
    <div className={`group relative ${className ?? ""}`}>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <Search
          className={`h-4 w-4 transition-colors ${highlighted ? "text-un-blue" : "text-slate-400 group-hover:text-un-blue"}`}
          aria-hidden="true"
        />
      </div>
      <input
        type="text"
        placeholder="Search all meetings…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit(value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          onSubmit(value);
        }}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="none"
        className={`block h-10 w-full touch-manipulation rounded-lg border px-3 pl-9 text-sm transition-colors focus:outline-none ${
          highlighted
            ? "border-un-blue bg-un-blue/5 text-un-blue placeholder-un-blue/50"
            : "border-slate-300 bg-white text-slate-400 placeholder-slate-400 hover:border-un-blue hover:text-un-blue hover:placeholder-un-blue/70"
        }`}
      />
      {value && (
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            onSubmit("");
          }}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-un-blue/50 hover:text-un-blue"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// Document-availability badges (AI transcript / verbatim / summary record).
// Used in both the desktop table cell and the mobile card; `uppercase` is the
// only visual difference between the two.
function DocBadges({
  hasTranscript,
  pvAvailable,
  pvSymbol,
  uppercase,
}: {
  hasTranscript: boolean;
  pvAvailable: boolean;
  pvSymbol: string | null;
  uppercase?: boolean;
}) {
  if (!hasTranscript && !pvAvailable) return null;
  const isSR = pvSymbol?.includes("/SR.");
  const caseClass = uppercase ? "uppercase" : "";
  return (
    <div className="flex flex-wrap gap-1">
      {hasTranscript && (
        <span
          className={`inline-block rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary ${caseClass}`}
        >
          transcript
        </span>
      )}
      {pvAvailable && (
        <span
          className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ${caseClass} ${
            isSR
              ? "bg-violet-500/10 text-violet-700"
              : "bg-amber-500/10 text-amber-700"
          }`}
        >
          {isSR ? "summary" : "verbatim"}
        </span>
      )}
    </div>
  );
}

// Compact letter chips for the desktop Transcripts column: T (AI transcript),
// V (verbatim record), S (summary record). Color matches DocBadges; the full
// name is in a hover tooltip. Letters distinguish the three types far more
// legibly than icons would at this size.
function DocChips({
  hasTranscript,
  pvAvailable,
  pvSymbol,
}: {
  hasTranscript: boolean;
  pvAvailable: boolean;
  pvSymbol: string | null;
}) {
  if (!hasTranscript && !pvAvailable) return null;
  const isSR = pvSymbol?.includes("/SR.");
  const chips: { letter: string; label: string; className: string }[] = [];
  if (hasTranscript) {
    chips.push({
      letter: "T",
      label: DOCS_TOOLTIPS.transcript,
      className: "bg-primary/10 text-primary",
    });
  }
  if (pvAvailable) {
    chips.push(
      isSR
        ? {
            letter: "S",
            label: DOCS_TOOLTIPS.sr,
            className: "bg-violet-500/10 text-violet-700",
          }
        : {
            letter: "V",
            label: DOCS_TOOLTIPS.pv,
            className: "bg-amber-500/10 text-amber-700",
          },
    );
  }
  return (
    <span className="mr-1.5 inline-flex gap-1 align-middle">
      {chips.map((chip) => (
        <Tooltip key={chip.letter}>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold",
                chip.className,
              )}
            >
              {chip.letter}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-56 text-xs">
            {chip.label}
          </TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
}

// Binary/segmented toggle (e.g. Recent/Scheduled, All/Transcribed). Shared by
// the desktop and mobile filter bars so both stay visually identical.
function SegmentedToggle({
  options,
}: {
  options: { label: string; active: boolean; onSelect: () => void }[];
}) {
  return (
    <div className="flex h-10 rounded-lg border border-slate-300 bg-white p-0.5 text-xs font-medium">
      {options.map(({ label, active, onSelect }) => (
        <button
          key={label}
          onClick={() => !active && onSelect()}
          className={`rounded-md px-4 py-1.5 transition-all ${
            active
              ? "bg-primary text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Any of these document types counts as "having a transcript" for the
// coarse All / With transcript toggle.
const ALL_DOC_TYPES = ["transcript", "pv", "sr"];

const DOCS_TOOLTIPS: Record<string, string> = {
  transcript: "Automatically generated transcript from the audio recording",
  pv: "Official word-for-word record of the meeting, produced by the UN Secretariat",
  sr: "Official condensed record of the meeting, produced by the UN Secretariat",
};

interface VideoTableProps {
  videos: Video[];
  totalCount: number;
  serverParams: ServerParams;
  availableDates: string[];
  filterOptions: {
    bodies: string[];
    categories: string[];
    bodyCounts: Record<string, number>;
    categoryCounts: Record<string, number>;
  };
}

export function VideoTable({
  videos,
  totalCount,
  serverParams,
  availableDates,
  filterOptions,
}: VideoTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { timezone } = useTimezone();

  // Search state (client-side, uses /api/search)
  const [inputValue, setInputValue] = useState(serverParams.q || "");
  const [searchResults, setSearchResults] = useState<Video[] | null>(
    serverParams.q ? null : null, // will be populated by effect if q is set
  );
  const [isSearching, setIsSearching] = useState(false);
  const [searchOffset, setSearchOffset] = useState(0);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Browse-feed infinite scroll (non-search). Seeded with the server-rendered
  // first chunk; further chunks append via /api/videos. Re-seeded whenever a
  // fresh SSR payload arrives (filter/sort/status change → new `videos`).
  const [browseRows, setBrowseRows] = useState<Video[]>(videos);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseHasMore, setBrowseHasMore] = useState(
    videos.length < totalCount,
  );
  useEffect(() => {
    setBrowseRows(videos);
    setBrowseHasMore(videos.length < totalCount);
  }, [videos, totalCount]);

  // URL-driven param updater
  const updateParams = useCallback(
    (
      updates: Partial<ServerParams> & {
        resetPage?: boolean;
        replace?: boolean;
      },
    ) => {
      const { resetPage = true, replace = false, ...paramUpdates } = updates;
      const next = { ...serverParams, ...paramUpdates };
      if (resetPage && !("page" in paramUpdates)) {
        next.page = 1;
      }

      const sp = new URLSearchParams();
      if (next.page > 1) sp.set("page", String(next.page));
      if (next.pageSize !== 50) sp.set("pageSize", String(next.pageSize));
      if (next.sort) sp.set("sort", next.sort);
      if (next.status !== "past") sp.set("status", next.status);
      if (next.date) sp.set("date", next.date);
      next.body?.forEach((v) => sp.append("body", v));
      next.category?.forEach((v) => sp.append("category", v));
      next.text?.forEach((v) => sp.append("text", v));
      if (next.q) sp.set("q", next.q);

      const href = sp.toString() ? `?${sp}` : "/";
      // Search updates use replace() so typing doesn't flood browser history.
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [serverParams, router],
  );

  // Tracks the q value we last wrote to the URL ourselves, so the sync effect
  // below can tell our own live-search writes apart from external navigation.
  const lastWrittenQuery = useRef(serverParams.q ?? "");

  // Sync search input from genuine URL changes (back/forward) only — our own
  // live-search writes are ignored so they can't clobber in-progress typing.
  useEffect(() => {
    const urlQuery = searchParams.get("q") || "";
    if (urlQuery !== lastWrittenQuery.current) {
      lastWrittenQuery.current = urlQuery;
      setInputValue(urlQuery);
    }
  }, [searchParams]);

  // Live search: debounce typed input → q param (replace, no history spam).
  useEffect(() => {
    const trimmed = inputValue.trim();
    if (trimmed === lastWrittenQuery.current) return; // already in sync
    if (trimmed.length === 1) return; // too short to query, but don't clear yet
    const id = setTimeout(() => {
      lastWrittenQuery.current = trimmed;
      updateParams({ q: trimmed || undefined, replace: true });
    }, 300);
    return () => clearTimeout(id);
  }, [inputValue, updateParams]);

  // Remember the filtered schedule URL so the meeting page's "Back to
  // schedule" link can return here with filters intact.
  useEffect(() => {
    rememberScheduleUrl(`${window.location.pathname}${window.location.search}`);
  }, [searchParams]);

  // Fetch search results when q param is set
  useEffect(() => {
    if (!serverParams.q) {
      setSearchResults(null);
      setSearchOffset(0);
      setHasMoreResults(false);
      return;
    }

    setIsSearching(true);
    setSearchOffset(0);
    const sortParam = serverParams.sort ? `&sort=${serverParams.sort}` : "";
    fetch(`/api/search?q=${encodeURIComponent(serverParams.q)}${sortParam}`)
      .then((res) => res.json())
      .then((data) => {
        setSearchResults(data.videos);
        setHasMoreResults(data.hasMore);
        setSearchOffset(data.videos.length);
      })
      .catch(() => setSearchResults(null))
      .finally(() => setIsSearching(false));
  }, [serverParams.q, serverParams.sort]);

  const loadMore = () => {
    if (!serverParams.q || isLoadingMore) return;
    setIsLoadingMore(true);
    const sortParam = serverParams.sort ? `&sort=${serverParams.sort}` : "";
    fetch(
      `/api/search?q=${encodeURIComponent(serverParams.q)}&offset=${searchOffset}${sortParam}`,
    )
      .then((res) => res.json())
      .then((data) => {
        setSearchResults((prev) => [...(prev ?? []), ...data.videos]);
        setHasMoreResults(data.hasMore);
        setSearchOffset((prev) => prev + data.videos.length);
      })
      .catch(() => {})
      .finally(() => setIsLoadingMore(false));
  };

  // Immediate flush (Enter / blur / clear) — bypasses the debounce. Uses
  // replace() like the live-search path so search never floods history.
  const submitSearch = (value: string) => {
    const trimmed = value.trim();
    setInputValue(trimmed);
    if (trimmed === lastWrittenQuery.current) return;
    lastWrittenQuery.current = trimmed;
    if (trimmed) {
      updateParams({ q: trimmed, replace: true });
    } else {
      // Clear search — remove q param, go back to normal view
      updateParams({ q: undefined, replace: true });
      setSearchResults(null);
    }
  };

  const isSearchMode = !!serverParams.q;

  // Append the next browse chunk from /api/videos using the current filters.
  const loadMoreBrowse = useCallback(() => {
    if (isSearchMode || browseLoading || !browseHasMore) return;
    setBrowseLoading(true);
    const sp = new URLSearchParams();
    sp.set("offset", String(browseRows.length));
    if (serverParams.sort) sp.set("sort", serverParams.sort);
    if (serverParams.status !== "past") sp.set("status", serverParams.status);
    if (serverParams.date) sp.set("date", serverParams.date);
    serverParams.body?.forEach((v) => sp.append("body", v));
    serverParams.category?.forEach((v) => sp.append("category", v));
    serverParams.text?.forEach((v) => sp.append("text", v));
    fetch(`/api/videos?${sp}`)
      .then((res) => res.json())
      .then((data) => {
        setBrowseRows((prev) => [...prev, ...data.videos]);
        setBrowseHasMore(Boolean(data.hasMore));
      })
      .catch(() => {})
      .finally(() => setBrowseLoading(false));
  }, [
    isSearchMode,
    browseLoading,
    browseHasMore,
    browseRows.length,
    serverParams,
  ]);

  // Data: search results when searching, else the (growing) browse feed.
  const tableData = isSearchMode ? (searchResults ?? []) : browseRows;

  // Unified infinite-scroll controls for whichever mode is active.
  const hasMore = isSearchMode ? hasMoreResults : browseHasMore;
  const loadingMore = isSearchMode ? isLoadingMore : browseLoading;
  const loadMoreCurrent = isSearchMode ? loadMore : loadMoreBrowse;

  // Auto-load the next chunk when the bottom sentinel nears the viewport. The
  // callback is held in a ref so the observer doesn't reattach every render;
  // re-running on tableData.length re-fires if the sentinel is still in view
  // after a short append (so the feed keeps filling until the viewport scrolls).
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMoreCurrent);
  useEffect(() => {
    loadMoreRef.current = loadMoreCurrent;
  });
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreRef.current();
      },
      { rootMargin: "800px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isSearchMode, tableData.length]);

  // Coarse "With transcript" toggle: on when every doc type is selected (any
  // of transcript / PV / SR counts as a transcript).
  const withTranscript = ALL_DOC_TYPES.every((d) =>
    (serverParams.text ?? []).includes(d),
  );
  const toggleWithTranscript = () =>
    updateParams({ text: withTranscript ? undefined : ALL_DOC_TYPES });

  const isScheduledView = serverParams.status === "scheduled";
  const statusToggleOptions = [
    {
      label: "Recent",
      active: !isScheduledView,
      // Reset the ascending sort that Upcoming sets, back to newest-first.
      onSelect: () => updateParams({ status: "past", sort: undefined }),
    },
    {
      label: "Upcoming",
      active: isScheduledView,
      onSelect: () => updateParams({ status: "scheduled", sort: "date_asc" }),
    },
  ];
  const transcribedToggleOptions = [
    { label: "All", active: !withTranscript, onSelect: toggleWithTranscript },
    {
      label: "Transcribed",
      active: withTranscript,
      onSelect: toggleWithTranscript,
    },
  ];

  // Search-result ordering: relevance (default, no sort param) vs newest-first.
  const searchSortOptions = [
    {
      label: "Relevance",
      active: !serverParams.sort,
      onSelect: () => updateParams({ sort: undefined }),
    },
    {
      label: "Date",
      active: !!serverParams.sort?.startsWith("date"),
      onSelect: () => updateParams({ sort: "date_desc" }),
    },
  ];

  const rows = tableData;
  const hasActiveFilters =
    !!serverParams.date ||
    (serverParams.body?.length ?? 0) > 0 ||
    (serverParams.category?.length ?? 0) > 0 ||
    (serverParams.text?.length ?? 0) > 0;
  // Don't flash "no results" while a search request is still in flight.
  const showEmptyState = rows.length === 0 && !isSearching;
  // Day/category grouping only makes sense when rows are in date order;
  // relevance-sorted search results would fragment into 1-row groups.
  const groupByDate = !isSearchMode;

  // When grouping, reorder rows so that within each day they're bucketed by
  // category (categories in first-appearance order, time order kept inside each
  // bucket; day order preserved from the server's date sort). Each row carries
  // precomputed day/category labels and whether it starts a new day/category
  // group, so rendering stays a pure map (no render-time mutation).
  const displayRows = useMemo<
    {
      video: Video;
      dateLabel: string;
      category: string;
      showDay: boolean;
      showCategory: boolean;
    }[]
  >(() => {
    const labelOf = (v: Video) =>
      formatMeetingDate(v.scheduledTime ?? v.date, timezone);

    // In search mode rows stay as-is and no group headers are emitted.
    const ordered = rows.map((video) => ({
      video,
      dateLabel: labelOf(video),
      category: video.category ?? "",
    }));

    if (!groupByDate) {
      return ordered.map((r) => ({
        ...r,
        showDay: false,
        showCategory: false,
      }));
    }

    const dayOrder: string[] = [];
    const byDay = new Map<string, typeof ordered>();
    for (const r of ordered) {
      if (!byDay.has(r.dateLabel)) {
        byDay.set(r.dateLabel, []);
        dayOrder.push(r.dateLabel);
      }
      byDay.get(r.dateLabel)!.push(r);
    }

    const out: {
      video: Video;
      dateLabel: string;
      category: string;
      showDay: boolean;
      showCategory: boolean;
    }[] = [];
    for (const day of dayOrder) {
      const catOrder: string[] = [];
      const byCat = new Map<string, typeof ordered>();
      for (const r of byDay.get(day)!) {
        if (!byCat.has(r.category)) {
          byCat.set(r.category, []);
          catOrder.push(r.category);
        }
        byCat.get(r.category)!.push(r);
      }
      catOrder.sort(compareCategories);
      let firstOfDay = true;
      for (const cat of catOrder) {
        let firstOfCat = true;
        for (const r of byCat.get(cat)!) {
          out.push({
            ...r,
            showDay: firstOfDay,
            showCategory: firstOfDay || firstOfCat,
          });
          firstOfDay = false;
          firstOfCat = false;
        }
      }
    }
    return out;
  }, [rows, groupByDate, timezone]);

  // Split the rows into per-day groups (one rendered table each) when grouping.
  type DisplayRow = (typeof displayRows)[number];
  const dayGroups = useMemo<{ day: string; rows: DisplayRow[] }[] | null>(() => {
    if (!groupByDate) return null;
    const groups: { day: string; rows: DisplayRow[] }[] = [];
    for (const r of displayRows) {
      if (r.showDay || groups.length === 0) {
        groups.push({ day: r.dateLabel, rows: [] });
      }
      groups[groups.length - 1].rows.push(r);
    }
    return groups;
  }, [displayRows, groupByDate]);

  // Renders one meeting's table rows: an optional category subheader followed by
  // the data row. The day heading lives outside the table (one table per day).
  const renderMeetingRow = ({
    video,
    dateLabel,
    category,
    showCategory,
  }: DisplayRow) => {
    const isScheduled = video.status === "scheduled";
    const isLive = video.status === "live";
    const time = video.scheduledTime;
    const duration = formatDuration(video.duration);
    const activeCategory =
      (serverParams.category ?? []).length === 1 &&
      serverParams.category![0] === category;

    return (
      <Fragment key={video.slug}>
        {showCategory && (
          <tr className="bg-gray-50">
            <td colSpan={2} className="px-4 pt-2 pb-1">
              {category ? (
                <button
                  onClick={() =>
                    updateParams({
                      category: activeCategory ? undefined : [category],
                    })
                  }
                  className={cn(
                    typography.tableHeader,
                    "transition-colors hover:text-foreground",
                    activeCategory && "text-primary",
                  )}
                >
                  {category}
                </button>
              ) : (
                <span className={typography.tableHeader}>Uncategorized</span>
              )}
            </td>
          </tr>
        )}
        <tr
          onClick={() => router.push(`/${video.slug}`)}
          className={cn(
            "cursor-pointer border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50",
            isScheduled && "opacity-40",
          )}
        >
          {/* Date (search mode only — grouped mode shows it as a heading) */}
          {!groupByDate && (
            <td className="px-4 py-2.5 align-top whitespace-nowrap text-muted-foreground">
              {dateLabel}
            </td>
          )}
          {/* Time + duration */}
          <td className="px-4 py-2.5 align-top">
            <div className="flex items-baseline justify-between gap-2 tabular-nums">
              {time ? (
                <span>{formatMeetingTime(time, timezone)}</span>
              ) : (
                <span className="text-black/20">—</span>
              )}
              {duration ? (
                <span className="text-muted-foreground">{duration}</span>
              ) : (
                <span className="text-black/20">—</span>
              )}
            </div>
          </td>
          {/* Title, prefixed with record badges */}
          <td className="px-4 py-2.5 align-top">
            {isLive && (
              <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500 align-middle" />
            )}
            <DocChips
              hasTranscript={video.hasTranscript}
              pvAvailable={video.pvAvailable}
              pvSymbol={video.pvSymbol}
            />
            <a
              href={`/${video.slug}`}
              onClick={(e) => e.stopPropagation()}
              className="text-black underline-offset-2 hover:underline"
            >
              {video.cleanTitle}
            </a>
          </td>
        </tr>
      </Fragment>
    );
  };

  const searchStatus = isSearching
    ? "Searching…"
    : isSearchMode && searchResults !== null && searchResults.length > 0
      ? hasMoreResults
        ? `Showing ${searchResults.length.toLocaleString()} meetings`
        : `${searchResults.length.toLocaleString()} meetings in total`
      : null;

  const clearAllFilters = () =>
    updateParams({
      date: undefined,
      body: undefined,
      category: undefined,
      text: undefined,
      q: undefined,
    });

  const emptyState = (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <SearchX className="h-8 w-8 text-muted-foreground/40" />
      {isSearchMode ? (
        <>
          <p className="text-sm text-muted-foreground">
            No meetings match{" "}
            <span className="font-medium text-foreground">
              &ldquo;{serverParams.q}&rdquo;
            </span>
            .
          </p>
          <button
            onClick={() => submitSearch("")}
            className="text-sm text-un-blue underline-offset-4 hover:underline"
          >
            Clear search
          </button>
        </>
      ) : hasActiveFilters ? (
        <>
          <p className="text-sm text-muted-foreground">
            No meetings match the current filters.
          </p>
          <button
            onClick={clearAllFilters}
            className="text-sm text-un-blue underline-offset-4 hover:underline"
          >
            Clear all filters
          </button>
        </>
      ) : isScheduledView ? (
        <p className="text-sm text-muted-foreground">
          No upcoming meetings are scheduled right now. Check back soon, or
          switch to{" "}
          <button
            onClick={() => updateParams({ status: "past" })}
            className="text-un-blue underline-offset-4 hover:underline"
          >
            recent meetings
          </button>
          .
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No meetings found.</p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Unified filter toolbar — search on its own row, controls below */}
      <div className="space-y-3">
        <SearchInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={submitSearch}
          isFocused={isSearchFocused}
          setIsFocused={setIsSearchFocused}
          className="w-full lg:w-1/2"
        />
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedToggle options={statusToggleOptions} />
          <SegmentedToggle options={transcribedToggleOptions} />
          <DateFilterPopover
            availableDates={availableDates}
            selectedDate={serverParams.date}
            onChange={(val) => updateParams({ date: val })}
          />
        </div>
        <CategoryFilterRows
          options={filterOptions.categories}
          selected={serverParams.category ?? []}
          onChange={(vals) =>
            updateParams({ category: vals.length ? vals : undefined })
          }
          counts={filterOptions.categoryCounts}
        />
      </div>

      {/* Search results: count + sort (relevance vs date) */}
      {isSearchMode && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">{searchStatus}</div>
          <SegmentedToggle options={searchSortOptions} />
        </div>
      )}

      {/* Mobile Card View */}
      {showEmptyState && (
        <div className="overflow-hidden rounded-lg border border-gray-200 lg:hidden">
          {emptyState}
        </div>
      )}
      <div className={cn("grid gap-3 lg:hidden", showEmptyState && "hidden")}>
        {rows.map((video) => {
          const isLive = video.status === "live";
          const isScheduled = video.status === "scheduled";
          const duration = formatDuration(video.duration);
          const dateTime = formatMeetingDateTime(
            video.scheduledTime,
            video.date,
            timezone,
          );

          return (
            <a
              key={video.slug}
              href={`/${video.slug}`}
              className={`block rounded-lg border p-4 transition-colors hover:bg-muted/50 ${isScheduled ? "opacity-50" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <span
                    className={`text-sm leading-tight ${isScheduled ? "text-muted-foreground" : "text-primary"}`}
                  >
                    {video.cleanTitle}
                  </span>
                  <DocBadges
                    hasTranscript={video.hasTranscript}
                    pvAvailable={video.pvAvailable}
                    pvSymbol={video.pvSymbol}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isLive ? (
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  ) : (
                    duration && (
                      <span className={cn(typography.caption, "tabular-nums")}>
                        {duration}
                      </span>
                    )
                  )}
                </div>
              </div>
              <div
                className={cn(
                  typography.caption,
                  "mt-2 flex flex-wrap gap-x-3 gap-y-1",
                )}
              >
                <span>{dateTime}</span>
                {video.body && <span>• {video.body}</span>}
                {video.category && <span>• {video.category}</span>}
              </div>
            </a>
          );
        })}
      </div>

      {/* Desktop view: one table per day, with the day as a text heading */}
      <div className="hidden pt-2 lg:block">
        {showEmptyState ? (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            {emptyState}
          </div>
        ) : dayGroups ? (
          <div className="space-y-10">
            {dayGroups.map((group) => (
              <div key={group.day}>
                <h2 className="mb-3 text-xl font-bold tracking-tight text-foreground">
                  {group.day}
                </h2>
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col style={{ width: 132 }} />
                      <col />
                    </colgroup>
                    <tbody>{group.rows.map(renderMeetingRow)}</tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Search mode: a single ungrouped table with a leading Date column.
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: 120 }} />
                <col style={{ width: 132 }} />
                <col />
              </colgroup>
              <tbody>{displayRows.map(renderMeetingRow)}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Infinite scroll: sentinel auto-loads the next chunk; the button is a
          fallback / explicit control. */}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center pt-4">
          <button
            onClick={() => loadMoreCurrent()}
            disabled={loadingMore}
            className="rounded-full border border-border px-6 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
      {!hasMore && tableData.length > 0 && (
        <div className="pt-4 text-center text-sm text-muted-foreground">
          {isSearchMode
            ? `${tableData.length.toLocaleString()} ${tableData.length === 1 ? "result" : "results"}`
            : `${totalCount.toLocaleString()} ${totalCount === 1 ? "meeting" : "meetings"}`}
        </div>
      )}
    </div>
  );
}
